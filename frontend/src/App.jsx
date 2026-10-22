import { useRef, useState } from 'react';

const API_DEFAULT = 'http://217.217.249.121:8050';

function findDownloadFiles(value, found = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => findDownloadFiles(item, found, seen));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && /(?:url|download|file|xlsx|json)/i.test(key)
      && (/^https?:\/\//i.test(item) || /\.(?:json|xlsx)(?:\?|$)/i.test(item))) {
      found.push({ label: key.replace(/[_-]/g, ' '), href: item });
    } else {
      findDownloadFiles(item, found, seen);
    }
  }
  return found;
}

function ResultSummary({ data }) {
  const excluded = new Set(['pages', 'sheets', 'entries', 'ocr_text', 'text', 'raw_text', 'line_boxes']);
  let entries = Object.entries(data).filter(([key, value]) => !excluded.has(key.toLowerCase())
    && (typeof value !== 'object' || value === null));
  if (!entries.length) {
    entries = [['Pages', Array.isArray(data.pages) ? data.pages.length
      : Array.isArray(data.sheets) ? data.sheets.length : 'See raw JSON for extracted content']];
  }
  const downloads = findDownloadFiles(data);
  return <div className="summary-view">
    <div className="summary-grid">
      {entries.slice(0, 18).map(([key, value]) => <article className="summary-card" key={key}>
        <div className="summary-key">{key.replace(/[_-]/g, ' ')}</div>
        <div className="summary-value">{typeof value === 'string' ? value : JSON.stringify(value)}</div>
      </article>)}
    </div>
    {downloads.length > 0 && <div className="download-list">
      {downloads.map((item, index) => <a className="download-link" href={item.href} target="_blank" rel="noreferrer" key={`${item.href}-${index}`}>↓ {item.label}</a>)}
    </div>}
  </div>;
}

export default function App() {
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [apiUrl, setApiUrl] = useState(API_DEFAULT);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [view, setView] = useState('summary');
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);

  function chooseFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setResult(null);
    setStatus(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) { setStatus({ type: 'error', message: 'Choose a PDF or image before starting extraction.' }); return; }
    const base = apiUrl.trim().replace(/\/+$/, '');
    if (!base) { setStatus({ type: 'error', message: 'Enter the URL of your running API.' }); return; }
    setLoading(true);
    setResult(null);
    setStatus({ type: 'info', message: 'Uploading document and waiting for extraction. Larger scans may take a little longer.' });
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${base}/extract`, { method: 'POST', body });
      const responseText = await response.text();
      let data;
      try { data = responseText ? JSON.parse(responseText) : {}; }
      catch { data = { response: responseText }; }
      if (!response.ok) throw new Error(data.detail || data.message || `API returned HTTP ${response.status}`);
      setResult(data);
      setView('summary');
      setStatus(null);
    } catch (error) {
      const message = error instanceof TypeError
        ? 'Could not reach the API. Start the backend and allow this frontend origin in its CORS settings.'
        : error.message;
      setStatus({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setStatus({ type: 'error', message: 'Clipboard access is unavailable in this browser context.' });
    }
  }

  return <>
    <header className="topbar">
      <a className="brand" href="#" aria-label="Script home"><span className="brand-mark">S</span><span>script<span className="brand-dot">.</span></span></a>
      <span className="local-label"><span className="status-dot" /> Local workspace</span>
    </header>

    <main className="layout">
      <section className="intro">
        <p className="eyebrow">DOCUMENT WORKSPACE <span>/</span> EXTRACTION</p>
        <h1>Turn handwriting<br />into <em>structured data.</em></h1>
        <p className="lede">Upload a scan or document. Your extraction is organized and ready to review in moments.</p>
      </section>

      <section className="workspace" aria-label="Document extraction">
        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="api-url">API endpoint</label>
          <div className="api-row">
            <input id="api-url" type="url" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
            <span className="api-hint">POST /extract</span>
          </div>

          <div
            className={`dropzone${dragging ? ' dragover' : ''}`}
            role="button" tabIndex={0}
            aria-label="Choose a document to upload"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.current?.click(); } }}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
          >
            <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,image/*,application/pdf" onChange={(event) => chooseFile(event.target.files[0])} />
            <span className="upload-icon" aria-hidden="true">↑</span>
            <span className="drop-title">{file ? file.name : 'Drop a document here'}</span>
            <span className="drop-subtitle">{file ? 'Ready to process · click to choose another file' : <>or <span className="browse">browse files</span> · PDF, JPG, PNG, TIFF</>}</span>
            {file && <span className="file-meta">{(file.size / 1024 / 1024).toFixed(2)} MB</span>}
          </div>

          <button className="submit-button" type="submit" disabled={loading}>
            <span>{loading ? 'Extracting document…' : 'Extract document'}</span><span aria-hidden="true">→</span>
          </button>
        </form>
        {status && <div className={`notice ${status.type}`} role="status" aria-live="polite">{status.message}</div>}
      </section>

      {result && <section className="results" aria-label="Extraction result">
        <div className="results-heading">
          <div><p className="eyebrow">PROCESSING RESULT</p><h2>Extraction complete</h2></div>
          <button className="text-button" type="button" onClick={copyResult}>{copied ? 'Copied' : 'Copy JSON'}</button>
        </div>
        <nav className="tabs" aria-label="Result views">
          <button className={`tab${view === 'summary' ? ' active' : ''}`} type="button" onClick={() => setView('summary')}>Summary</button>
          <button className={`tab${view === 'json' ? ' active' : ''}`} type="button" onClick={() => setView('json')}>Raw JSON</button>
        </nav>
        {view === 'summary' ? <ResultSummary data={result} />
          : <pre className="json-view">{JSON.stringify(result, null, 2)}</pre>}
      </section>}

      <footer><span>PRIVATE BY DEFAULT</span><span>Documents are sent to your configured local API.</span></footer>
    </main>
  </>;
}

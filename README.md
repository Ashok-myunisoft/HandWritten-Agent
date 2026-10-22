# Local Handwritten Document Extraction Agent

A local-first starter for English handwritten documents: PDFs, scanned pages, JPG/PNG and TIFF. It separates OCR, extraction, validation/review flags and exports. Each PDF page becomes its own `sheet_001.json`, `sheet_002.json`, etc., plus `combined.json` and `extraction.xlsx`.

## What this does (and does not do)

- Preprocesses page images (orientation correction, grayscale/denoise, conservative deskew).
- Uses a configurable OCR adapter:
  - `paddle`: PaddleOCR detection + general text recognition.
  - `trocr`: PaddleOCR line detection plus Microsoft's TrOCR handwritten line recognizer.
- Optionally uses a **local Ollama model** to map OCR text into structured JSON.
- Writes one JSON per page, a combined JSON, and Excel (`Pages` and `Entries` sheets).
- Keeps OCR text and line boxes as an audit trail; marks outputs for review when warnings/notes exist.
- Uses a conservative heuristic fallback if Ollama is not running.

**Honesty about accuracy:** This is a runnable starter, not a claim of production-grade handwriting accuracy. PaddleOCR's general OCR is not handwriting-specialized. TrOCR is a line recognizer and the provided integration uses PaddleOCR to detect line crops first. Handwritten industrial tables, circled/bubble digits, low-quality scans and ambiguous digits must be tested against labeled examples and reviewed by a person. Do not use extracted quantities to drive production decisions until validated.

## Architecture

1. Upload/API (`FastAPI`)
2. Page rendering (`PyMuPDF`) and image preprocessing (`OpenCV`/`Pillow`)
3. OCR detection/recognition (`PaddleOCR`, optional TrOCR)
4. Extraction (`Ollama` local model; prompt stored at `prompts/extraction_prompt.txt`)
5. Review metadata / conservative fallback
6. JSON per page + combined JSON + Excel

This follows the useful document-pipeline separation highlighted by Extend: parsing/recognition, structured extraction, and downstream workflow should be separate stages. This implementation does not call Extend APIs and does not require a hosted service.

## Requirements

- Python 3.11 recommended.
- Local Ollama for LLM extraction (optional but recommended): https://ollama.com/
- For OCR, install PaddleOCR and a compatible PaddlePaddle build. CPU works but can be slow.
- For handwriting recognition with TrOCR, install PyTorch/Transformers and allow the model weights to download on first use. After download, inference can run locally. The first download requires network access.

## Use an existing RunPod Qwen endpoint (no local Ollama install)

1. Rotate/revoke any RunPod API key that has been pasted into a chat, repository, screenshot or log. Store the replacement only in `.env`.
2. Copy `.env.example` to `.env` and set:
   - `RUNPOD_ENDPOINT_URL=https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/runsync`
   - `RUNPOD_API_KEY=your_rotated_key`
   - `USE_OLLAMA=false`
3. The current adapter uses RunPod Serverless authentication (`Authorization` header set to the API key, as shown in RunPod docs) and sends `POST` JSON in the common format: `{"input":{"prompt":"...","max_tokens":4096,"temperature":0}}` and parses common text-generation response shapes.
4. RunPod worker templates have different input/output contracts. If your Qwen endpoint expects a different input key or returns another shape, update `_runpod_extract()` and `_extract_text_from_runpod_response()` in `app/extract.py` to match that worker. A `/runsync` URL is not automatically an Ollama `/api/chat` endpoint.
5. Test the endpoint separately with a tiny prompt before uploading private documents. RunPod may charge for inference and idle/warm workers depending on your configuration.

## Setup (Windows PowerShell)

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Install PaddlePaddle/PaddleOCR following the official installation guide for your Python/OS:
https://www.paddleocr.ai/latest/en/version3.x/installation.html

If you are using RunPod, skip the local Ollama setup below. Only install Ollama if you want a local fallback:

```powershell
ollama pull mistral
ollama serve
```

In another terminal:
```powershell
Copy-Item .env.example .env
# Set OCR_ENGINE=paddle in .env (the app loads these settings from `.env`.)
$env:OCR_ENGINE="paddle"
$env:USE_OLLAMA="true"
$env:OLLAMA_MODEL="mistral"
python run.py
```

Open Swagger UI: http://127.0.0.1:8000/docs

### Enable TrOCR handwriting recognition

Install compatible versions for your machine:
```powershell
pip install torch transformers sentencepiece
$env:OCR_ENGINE="trocr"
python run.py
```
TrOCR downloads `microsoft/trocr-base-handwritten` on first use. The model recognizes text lines, not whole page layout by itself; this starter uses PaddleOCR boxes for line crops.

## API usage

```powershell
curl.exe -X POST "http://127.0.0.1:8000/extract" -F "file=@C:\path\to\handwritten.pdf"
```

The response includes page results and output filenames. Files are saved under `outputs/<source-name>/`:
- `sheet_001.json` — page 1
- `sheet_002.json` — page 2
- `combined.json` — optional all-page `sheets` array
- `extraction.xlsx` — `Pages` and `Entries` sheets

Download examples:
- `GET /files/<safe-document-name>/sheet_001.json`
- `GET /files/<safe-document-name>/extraction.xlsx`

## Local CLI usage

```powershell
python -c "from app.pipeline import process_document; print(process_document(r'C:\docs\scan.pdf'))"
```

## Output schema notes

For industrial production sheets, the extraction prompt requests:
- source/document metadata, operator, date
- entries with time, part/work order, operation, machine, cell
- target, actual, idle, rework and rejection
- rework/rejection bubble fields: `ones_digit`, `tens_digit`, `combined_value`
- remarks, legend, signatures and supervisor comments
- review notes and original OCR text

For general documents, the local model may adapt the fields to the document type. If Ollama is unavailable, the fallback deliberately does **not** fabricate table rows: it returns document type/date/operator heuristics and full OCR text, with review notes.

## Important next steps before production

1. Create a labeled evaluation set of representative scans. Record exact text/fields per page.
2. Measure character error rate (CER), exact-match rates for critical numbers, and row alignment accuracy.
3. Inspect false readings of `0/O`, `1/7`, `3/8`, decimal points, dates and leading zeros.
4. For bubble/circled digits, implement a dedicated bubble-region detector/classifier from labeled examples. The current prompt preserves digits if OCR/model can read them; it does not perform visual bubble classification.
5. Add authentication, file retention/deletion policy, request IDs and structured logs before exposing the API beyond localhost.
6. Consider saving page images and field-level bounding boxes alongside each extracted value to enable human review.
7. Pin dependency versions after testing on your Windows/Python version. PaddleOCR/PaddlePaddle installation is OS/version-sensitive.

## Troubleshooting

- `No module named paddle`: install a PaddlePaddle wheel compatible with your Python version and OS first.
- Ollama connection error: start `ollama serve`, confirm `ollama list`, and check `OLLAMA_BASE_URL`.
- Empty/poor OCR: test a higher-resolution scan and inspect preprocessing output; handwritten scripts vary substantially.
- Slow first run: OCR/TrOCR model weights are downloaded and cached on first use.

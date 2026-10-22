# React frontend

React + Vite interface for the handwritten document extraction API. It uploads PDFs or images to `POST /extract`, shows a summary and raw JSON, and displays download links included in the response.

## Run

Start the backend from the project root:

```powershell
python run.py
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (typically `http://127.0.0.1:5173`). The API URL defaults to `http://127.0.0.1:8000` and is editable in the form.

The frontend and API use different origins, so the FastAPI backend must allow the Vite origin through CORS. Add FastAPI's `CORSMiddleware` to `app/main.py` if the browser reports a CORS error. The backend source folder is not present in this checkout, so this frontend does not alter backend CORS settings.

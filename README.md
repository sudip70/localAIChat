# Gemma Local AI

A lightweight chat UI for a Gemma model running through Ollama completely locally.

This project pairs a small FastAPI backend with a clean vanilla frontend. It is built as a local-first demo: conversations stay in the browser, the backend talks to Ollama on `localhost`, and the UI exposes just enough product behavior to feel like a real chat client instead of a one-off prompt box.

**Demo:** 
<p align="center">
  <img src="local_demo.gif" width="600"/>
</p>

## What it includes

- Split frontend structure with dedicated `index.html`, `styles.css`, and `app.js`
- Local conversation history stored in `localStorage`
- Searchable chat history grouped by recency
- Inline conversation title editing
- `Clear` for the active chat and `Clear history` for all saved chats
- Light and dark mode toggle
- Health/status badge for the local model
- Text and image attachment support for code, structured text files, and common image formats
- Markdown-style rendering for assistant responses
- Fixed viewport layout with internal scrolling for long chat history
- JSON `POST` API instead of query-string prompt submission
- Timeout and error handling around Ollama requests

## Stack

- FastAPI
- Requests
- Vanilla HTML, CSS, and JavaScript
- Ollama
- `gemma4:latest`

## Project structure

```text
.
├── app.py
├── requirements.txt
├── static
│   ├── app.js
│   ├── index.html
│   └── styles.css
└── README.md
```

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Make sure Ollama is installed, then pull the model once:

```bash
ollama pull gemma4:latest
```

4. Start the app:

```bash
uvicorn app:app --reload
```

5. Open [http://localhost:8000](http://localhost:8000)

## How it works

- `GET /` serves the frontend from `static/index.html`
- `GET /api/health` checks whether the app-managed Ollama server is reachable locally
- `POST /api/generate` forwards the assembled prompt to Ollama and returns the final response
- The backend starts its own Ollama child process on startup and stops it again on shutdown
- The browser stores conversations in `localStorage`, so the history persists on the same machine and browser profile
- The settings panel lets you rename the model label in the UI, but it does not change the backend model selection

## Important notes

- This app supports text files and common images such as PNG, JPG, JPEG, and WEBP. PDFs are still excluded.
- The UI model name is cosmetic. The actual model used by the backend is defined in `app.py` as `gemma4:latest`.
- The backend now manages Ollama itself, so closing the FastAPI server also stops the Ollama process it started.
- Responses are non-streaming right now, so the UI waits for the full Ollama reply before rendering it.

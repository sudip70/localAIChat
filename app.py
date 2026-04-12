from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_TAGS_URL = "http://localhost:11434/api/tags"
OLLAMA_MODEL = "gemma4:latest"
OLLAMA_TIMEOUT_SECONDS = 90


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=50000)


app = FastAPI(
    title="Gemma Local AI",
    description="A local-first chat interface for Ollama + Gemma.",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    try:
        response = requests.get(OLLAMA_TAGS_URL, timeout=3)
        response.raise_for_status()
    except requests.RequestException:
        return {"status": "offline", "model": OLLAMA_MODEL}

    return {"status": "online", "model": OLLAMA_MODEL}


@app.post("/api/generate")
def generate(payload: GenerateRequest) -> dict[str, object]:
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": OLLAMA_MODEL,
                "prompt": payload.prompt,
                "stream": False,
            },
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.Timeout as exc:
        raise HTTPException(
            status_code=504,
            detail="Ollama took too long to respond. Try again or shorten the prompt.",
        ) from exc
    except requests.ConnectionError as exc:
        raise HTTPException(
            status_code=503,
            detail="Cannot reach Ollama at http://localhost:11434. Start Ollama and load the model first.",
        ) from exc
    except requests.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ollama returned an error ({response.status_code}).",
        ) from exc
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="The request to Ollama failed before a response was returned.",
        ) from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Ollama returned a non-JSON response.",
        ) from exc

    reply = data.get("response", "").strip()
    if not reply:
        raise HTTPException(
            status_code=502,
            detail="Ollama returned an empty response.",
        )

    return {
        "response": reply,
        "model": data.get("model", OLLAMA_MODEL),
        "done": bool(data.get("done", True)),
    }

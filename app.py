import os
import socket
import subprocess
import time
from contextlib import asynccontextmanager
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
OLLAMA_MODEL = os.getenv("GEMMA_OLLAMA_MODEL", "gemma4:latest")
OLLAMA_TIMEOUT_SECONDS = 90
OLLAMA_STARTUP_TIMEOUT_SECONDS = 20


def pick_ollama_host() -> str:
    configured_host = os.getenv("GEMMA_OLLAMA_HOST", "").strip()
    if configured_host:
        return configured_host

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return f"127.0.0.1:{sock.getsockname()[1]}"


def build_ollama_base_url(host: str) -> str:
    return f"http://{host}"


def wait_for_ollama(tags_url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + OLLAMA_STARTUP_TIMEOUT_SECONDS
    last_error = ""

    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Ollama exited before it finished starting.")

        try:
            response = requests.get(tags_url, timeout=1)
            response.raise_for_status()
            return
        except requests.RequestException as exc:
            last_error = str(exc)
            time.sleep(0.25)

    stop_ollama_process(process)
    raise RuntimeError(
        f"Timed out waiting for Ollama to start at {tags_url}. {last_error}".strip()
    )


def start_managed_ollama(host: str) -> subprocess.Popen[str]:
    env = os.environ.copy()
    env["OLLAMA_HOST"] = host

    process = subprocess.Popen(
        ["ollama", "serve"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wait_for_ollama(f"{build_ollama_base_url(host)}/api/tags", process)
    return process


def stop_ollama_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ollama_host = pick_ollama_host()
    ollama_base_url = build_ollama_base_url(ollama_host)

    app.state.ollama_base_url = ollama_base_url
    app.state.ollama_chat_url = f"{ollama_base_url}/api/chat"
    app.state.ollama_tags_url = f"{ollama_base_url}/api/tags"
    app.state.ollama_process = None

    try:
        app.state.ollama_process = start_managed_ollama(ollama_host)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Could not find the `ollama` executable. Install Ollama first, then start the app again."
        ) from exc

    try:
        yield
    finally:
        stop_ollama_process(app.state.ollama_process)


class ChatMessage(BaseModel):
    role: str = Field(..., min_length=1, max_length=20)
    # FIX: allow empty content so image-only messages (no text, just images[]) are valid
    content: str = Field(default="", max_length=500_000)
    images: list[str] = Field(default_factory=list, max_length=6)


class GenerateRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=32)


app = FastAPI(
    title="Gemma Local AI",
    description="A local-first chat interface for Ollama + Gemma.",
    version="1.0.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    try:
        response = requests.get(app.state.ollama_tags_url, timeout=3)
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError):
        return {"status": "offline", "model": OLLAMA_MODEL}

    models = data.get("models", [])
    has_model = any(
        isinstance(model, dict)
        and (model.get("name") == OLLAMA_MODEL or model.get("model") == OLLAMA_MODEL)
        for model in models
    )

    if has_model:
        return {"status": "online", "model": OLLAMA_MODEL}

    # FIX: surface a pull hint so the user knows exactly what to run
    return {
        "status": "offline",
        "model": OLLAMA_MODEL,
        "hint": f"Model not found. Run: ollama pull {OLLAMA_MODEL}",
    }


@app.post("/api/generate")
def generate(payload: GenerateRequest) -> dict[str, object]:
    try:
        response = requests.post(
            app.state.ollama_chat_url,
            json={
                "model": OLLAMA_MODEL,
                "messages": [message.model_dump(exclude_none=True) for message in payload.messages],
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
            detail=f"Cannot reach the managed Ollama server at {app.state.ollama_base_url}. Restart the app.",
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

    message = data.get("message", {})
    reply = message.get("content", "").strip() if isinstance(message, dict) else ""
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
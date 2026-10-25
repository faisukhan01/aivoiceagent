"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.routes import chat, documents, fulltext, health, voice
from app.api.ws import router as ws_router
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logging.getLogger("app").info("AI Voice Agent API %s starting (llm=%s, tts=%s, turso=%s)", __version__, settings.has_any_llm_key, settings.has_elevenlabs, settings.has_turso)
    yield


app = FastAPI(
    title="AI Voice Agent API",
    description="FastAPI backend: LLM providers, STT/TTS, VAD, RAG, Turso — REST + WebSockets",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(voice.router)
app.include_router(documents.router)
app.include_router(fulltext.router)
app.include_router(ws_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "ai-voice-agent-api", "version": __version__, "docs": "/docs", "health": "/health"}

"""Health & readiness endpoint."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

from app import __version__
from app.core.config import settings
from app.db.turso import check_connection
from app.rag.retriever import store as vector_store
from app.services import stt, tts
from app.services.llm import available_providers

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "ai-voice-agent-api",
        "version": __version__,
        "time": datetime.now(UTC).isoformat(),
        "providers": {
            **available_providers(),
            "elevenlabs": settings.has_elevenlabs,
            "livekit": settings.has_livekit,
        },
        "stt": stt.capabilities(),
        "tts": tts.capabilities(),
        "turso": check_connection(),
        "vector_store_size": len(vector_store),
    }

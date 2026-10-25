"""Health check endpoint."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()

VERSION = "0.1.0"


@router.get("/health")
async def health() -> dict[str, Any]:
    """Liveness + configuration summary (no secrets, only booleans)."""
    settings = get_settings()
    return {
        "status": "ok",
        "service": "ai-voice-agent-api",
        "version": VERSION,
        "providers": settings.provider_flags(),
        "turso_configured": settings.turso_configured,
        "time": datetime.now(UTC).isoformat(),
    }

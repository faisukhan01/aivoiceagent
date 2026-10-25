"""REST routers package."""

from __future__ import annotations

from app.api.routes import chat, documents, health, voice

__all__ = ["chat", "documents", "health", "voice"]

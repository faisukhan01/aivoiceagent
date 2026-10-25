"""Speech-to-text service (stub).

Provider detection and request plumbing are in place; actual transcription
is a placeholder until the STT pipeline is wired up.

TODO:
    - Implement OpenAI Whisper transcription (``client.audio.transcriptions.create``)
      when OPENAI_API_KEY is configured.
    - Implement ElevenLabs Scribe STT when ELEVENLABS_API_KEY is configured.
    - Accept streaming audio chunks over the websocket for real-time STT.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class SttService:
    """Speech-to-text facade with provider detection and a placeholder path."""

    name = "stt"

    def available_providers(self) -> list[str]:
        """STT-capable providers with configured keys, in preference order."""
        settings = get_settings()
        out: list[str] = []
        if settings.has_openai:
            out.append("openai-whisper")
        if settings.has_elevenlabs:
            out.append("elevenlabs-scribe")
        return out

    @property
    def is_configured(self) -> bool:
        """True when at least one STT provider key is present."""
        return bool(self.available_providers())

    async def transcribe(self, audio_bytes: bytes, *, mime_type: str = "audio/wav") -> dict[str, Any]:
        """Transcribe raw audio bytes.

        Returns a result dict. Without a configured provider this returns a
        clearly-marked placeholder transcript instead of raising, so callers
        (websocket pipeline, /api/voice/stt) degrade gracefully in dev.
        """
        providers = self.available_providers()
        if not providers:
            logger.warning("STT requested but no provider configured; returning placeholder")
            return {
                "text": "",
                "provider": None,
                "placeholder": True,
                "detail": (
                    "No STT provider configured. Set OPENAI_API_KEY (Whisper) or "
                    "ELEVENLABS_API_KEY (Scribe) to enable transcription."
                ),
            }

        # Preferred: OpenAI Whisper -------------------------------------- #
        if "openai-whisper" in providers:
            # TODO: implement real transcription call:
            #   client = AsyncOpenAI()
            #   resp = await client.audio.transcriptions.create(
            #       model="whisper-1", file=(filename, audio_bytes, mime_type))
            #   return {"text": resp.text, "provider": "openai-whisper", "placeholder": False}
            logger.info("STT openai-whisper path not yet implemented; placeholder returned")
            return {
                "text": "",
                "provider": "openai-whisper",
                "placeholder": True,
                "detail": "Whisper transcription not yet implemented (TODO).",
            }

        # Fallback: ElevenLabs Scribe ------------------------------------ #
        # TODO: implement elevenlabs speech_to_text conversion here.
        logger.info("STT elevenlabs-scribe path not yet implemented; placeholder returned")
        return {
            "text": "",
            "provider": "elevenlabs-scribe",
            "placeholder": True,
            "detail": "ElevenLabs Scribe transcription not yet implemented (TODO).",
        }


stt_service = SttService()
"""Module-level singleton."""

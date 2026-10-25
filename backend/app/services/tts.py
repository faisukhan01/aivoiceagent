"""Text-to-speech service.

Uses the ElevenLabs SDK when ELEVENLABS_API_KEY is configured; otherwise a
stub returns a clear "not configured" signal so routes can degrade to 503
JSON instead of crashing.

The ElevenLabs SDK is imported lazily inside functions so the module imports
cleanly with no keys present.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TtsNotConfiguredError(RuntimeError):
    """Raised when TTS is requested but no provider key is configured."""


class TtsService:
    """Text-to-speech facade (ElevenLabs-backed, with graceful stub)."""

    name = "tts"

    @property
    def is_configured(self) -> bool:
        """True when ELEVENLABS_API_KEY is set."""
        return get_settings().has_elevenlabs

    def available_providers(self) -> list[str]:
        """TTS-capable providers with configured keys."""
        return ["elevenlabs"] if self.is_configured else []

    async def synthesize(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model_id: str = "eleven_turbo_v2_5",
    ) -> dict[str, Any]:
        """Synthesize speech and return raw audio bytes (audio/mpeg).

        Returns:
            Dict with ``audio`` (bytes), ``mime_type`` and ``provider``.

        Raises:
            TtsNotConfiguredError: When no TTS provider key is configured.
        """
        settings = get_settings()
        if not settings.has_elevenlabs:
            raise TtsNotConfiguredError(
                "TTS not configured: set ELEVENLABS_API_KEY in the backend .env file."
            )

        from elevenlabs.client import ElevenLabs  # lazy import

        voice = voice_id or settings.ELEVENLABS_VOICE_ID
        logger.info("TTS synthesize: voice=%s model=%s chars=%d", voice, model_id, len(text))

        def _convert() -> bytes:
            client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
            audio_iter = client.text_to_speech.convert(
                voice_id=voice,
                model_id=model_id,
                text=text,
                output_format="mp3_44100_128",
            )
            return b"".join(chunk for chunk in audio_iter)

        # The SDK's convert() is synchronous (generator); offload to a thread.
        import asyncio

        audio = await asyncio.to_thread(_convert)
        return {
            "audio": audio,
            "mime_type": "audio/mpeg",
            "provider": "elevenlabs",
            "voice_id": voice,
            "model_id": model_id,
        }

    async def synthesize_stub_info(self) -> dict[str, Any]:
        """Structured info payload for callers when TTS is unavailable."""
        return {
            "provider": "elevenlabs",
            "configured": False,
            "detail": (
                "TTS unavailable: set ELEVENLABS_API_KEY (and optionally "
                "ELEVENLABS_VOICE_ID) in the backend .env file."
            ),
        }


tts_service = TtsService()
"""Module-level singleton."""

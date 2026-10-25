"""Text-to-Speech service (ElevenLabs first, graceful stub without a key)."""

from __future__ import annotations

from app.core.config import settings

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs "Rachel"


def available() -> bool:
    return settings.has_elevenlabs


def capabilities() -> dict[str, object]:
    return {
        "elevenlabs_tts": settings.has_elevenlabs,
        "voice_id": settings.elevenlabs_voice_id or DEFAULT_VOICE_ID,
        "models": ["eleven_multilingual_v2", "eleven_turbo_v2_5"],
    }


async def synthesize(
    text: str,
    voice_id: str | None = None,
    model_id: str = "eleven_multilingual_v2",
) -> bytes:
    """Convert text to MP3 audio bytes via ElevenLabs."""
    if not settings.has_elevenlabs:
        raise TTSNotConfiguredError("No TTS provider configured (set ELEVENLABS_API_KEY).")

    from elevenlabs.client import ElevenLabs  # lazy import

    client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    audio = client.text_to_speech.convert(
        text=text,
        voice_id=voice_id or settings.elevenlabs_voice_id or DEFAULT_VOICE_ID,
        model_id=model_id,
        output_format="mp3_44100_128",
    )
    return b"".join(audio)


class TTSNotConfiguredError(RuntimeError):
    pass

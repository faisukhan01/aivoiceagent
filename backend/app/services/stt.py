"""Speech-to-Text service.

Provider slots:
- ElevenLabs Scribe  (ELEVENLABS_API_KEY)
- OpenAI Whisper     (OPENAI_API_KEY)
- Google Gemini audio (GOOGLE_API_KEY)

With no keys configured the service reports `available=False` and the API
returns a graceful, machine-readable response instead of failing.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings


@dataclass
class STTResult:
    text: str
    provider: str
    language: str | None = None
    duration_seconds: float | None = None


def capabilities() -> dict[str, bool]:
    return {
        "elevenlabs_scribe": settings.has_elevenlabs,
        "openai_whisper": settings.has_openai,
        "google_gemini": settings.has_google,
    }


def available() -> bool:
    return any(capabilities().values())


async def transcribe(audio: bytes, filename: str = "audio.webm", language: str | None = None) -> STTResult:
    """Transcribe audio bytes. Tries ElevenLabs Scribe, then OpenAI Whisper."""
    if settings.has_elevenlabs:
        return await _transcribe_elevenlabs(audio, filename, language)
    if settings.has_openai:
        return await _transcribe_whisper(audio, filename, language)
    raise STTNotConfiguredError("No STT provider configured (set ELEVENLABS_API_KEY or OPENAI_API_KEY).")


class STTNotConfiguredError(RuntimeError):
    pass


async def _transcribe_elevenlabs(audio: bytes, filename: str, language: str | None) -> STTResult:
    import io

    from elevenlabs.client import ElevenLabs  # lazy import

    client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    result = client.speech_to_text.convert(
        file=io.BytesIO(audio),
        model_id="scribe_v1",
        file_format=filename.rsplit(".", 1)[-1] if "." in filename else "webm",
        language_code=language or "en",
    )
    return STTResult(text=result.text or "", provider="elevenlabs_scribe", language=language)


async def _transcribe_whisper(audio: bytes, filename: str, language: str | None) -> STTResult:
    from openai import AsyncOpenAI  # lazy import

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    kwargs: dict[str, object] = {"model": "whisper-1"}
    if language:
        kwargs["language"] = language
    result = await client.audio.transcriptions.create(
        file=(filename, audio),
        **kwargs,  # type: ignore[arg-type]
    )
    return STTResult(text=result.text or "", provider="openai_whisper", language=language)

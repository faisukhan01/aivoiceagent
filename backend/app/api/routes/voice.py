"""Voice endpoints: TTS synthesis, STT upload, capability discovery."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.services import stt, tts

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.get("/capabilities")
async def capabilities() -> dict[str, object]:
    return {
        "stt": {"available": stt.available(), **stt.capabilities()},
        "tts": {"available": tts.available(), **tts.capabilities()},
        "vad": {"available": True},
        "livekit": {"available": settings.has_livekit, "url": settings.livekit_url or None},
        "elevenlabs": {"available": settings.has_elevenlabs, "voice_id": settings.elevenlabs_voice_id or None},
    }


@router.post("/tts")
async def text_to_speech(text: str, voice_id: str | None = None) -> Response:
    """Synthesize speech -> audio/mpeg (ElevenLabs when configured)."""
    try:
        audio = await tts.synthesize(text, voice_id=voice_id)
    except tts.TTSNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TTS provider error: {exc}") from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/stt")
async def speech_to_text(file: UploadFile, language: str | None = None) -> dict[str, object]:
    """Transcribe an uploaded audio file."""
    if not stt.available():
        raise HTTPException(
            status_code=503,
            detail="No STT provider configured (set ELEVENLABS_API_KEY or OPENAI_API_KEY).",
        )
    audio = await file.read()
    try:
        result = await stt.transcribe(audio, filename=file.filename or "audio.webm", language=language)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"STT provider error: {exc}") from exc
    return {
        "text": result.text,
        "provider": result.provider,
        "language": result.language,
        "duration_seconds": result.duration_seconds,
    }

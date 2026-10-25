"""Voice endpoints: TTS synthesis, STT upload stub, capability discovery."""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.stt import stt_service
from app.services.tts import TtsNotConfiguredError, tts_service
from app.services.vad import vad_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/voice", tags=["voice"])


class TtsRequest(BaseModel):
    """Request body for TTS synthesis."""

    text: str = Field(min_length=1, max_length=5_000)
    voice_id: str | None = Field(default=None, description="ElevenLabs voice override")


class SttResponse(BaseModel):
    """STT upload response (stub until providers are wired)."""

    text: str
    provider: str | None
    placeholder: bool
    duration_ms: int
    detail: str | None = None


class CapabilitiesResponse(BaseModel):
    """Voice feature availability summary."""

    tts: dict[str, Any]
    stt: dict[str, Any]
    vad: dict[str, Any]
    realtime: dict[str, Any]


@router.post("/tts")
async def text_to_speech(req: TtsRequest) -> Any:
    """Synthesize speech (audio/mpeg) via ElevenLabs, or 503 JSON when unconfigured."""
    try:
        result = await tts_service.synthesize(req.text, voice_id=req.voice_id)
        from fastapi.responses import Response

        return Response(
            content=result["audio"],
            media_type="audio/mpeg",
            headers={"X-TTS-Provider": "elevenlabs", "X-Voice-Id": result["voice_id"]},
        )
    except TtsNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "tts_not_configured",
                "provider": "elevenlabs",
                "message": str(exc),
            },
        ) from exc


@router.post("/stt", response_model=SttResponse)
async def speech_to_text(audio: UploadFile = File(...)) -> SttResponse:
    """Transcribe an uploaded audio file (stub: returns placeholder transcript).

    TODO: route bytes through services.stt once Whisper/Scribe is implemented;
    currently returns a clearly-marked placeholder so clients can integrate.
    """
    started = time.monotonic()
    data = await audio.read()
    result = await stt_service.transcribe(data, mime_type=audio.content_type or "audio/wav")
    duration_ms = int((time.monotonic() - started) * 1000)
    return SttResponse(
        text=result.get("text", ""),
        provider=result.get("provider"),
        placeholder=bool(result.get("placeholder", True)),
        duration_ms=duration_ms,
        detail=result.get("detail"),
    )


@router.get("/capabilities", response_model=CapabilitiesResponse)
async def capabilities() -> CapabilitiesResponse:
    """Which voice features are available in this deployment."""
    return CapabilitiesResponse(
        tts={
            "configured": tts_service.is_configured,
            "providers": tts_service.available_providers(),
        },
        stt={
            "configured": stt_service.is_configured,
            "providers": stt_service.available_providers(),
        },
        vad=vad_service.info(),
        realtime={
            "websocket": "/ws/voice",
            "livekit": "not-integrated",
        },
    )

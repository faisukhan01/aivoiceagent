"""WebSocket endpoint for the realtime voice loop.

Protocol (JSON frames, client → server):
    {"type": "ping"}                          → {"type": "pong"}
    {"type": "audio", "data": "<b64 pcm16>"}  → VAD + placeholder reply

TODO (pipeline stubs to fill in):
    1. STT   — feed accumulated speech frames into services.stt.transcribe
    2. LLM   — pass transcript into services.llm (streaming) with conversation history
    3. TTS   — synthesize the LLM reply via services.tts and send b64 audio frames back
"""

from __future__ import annotations

import base64
import binascii
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.services import vad as vad_service
from app.services.stt import stt_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/voice")
async def voice_socket(websocket: WebSocket) -> None:
    """Realtime voice websocket.

    Handles control frames (ping) and audio frames. Audio frames are base64
    PCM16 and pass through VAD; the STT→LLM→TTS pipeline is stubbed with
    clear extension points.
    """
    settings = get_settings()
    await websocket.accept()
    logger.info("Voice websocket connected from %s", websocket.client)
    await websocket.send_json(
        {
            "type": "hello",
            "message": "AI Voice Agent websocket ready",
            "vad_backend": vad_service.vad_service.info()["backend"],
            "stt_configured": stt_service.is_configured,
            "llm_providers": "auto",
        }
    )

    try:
        while True:
            frame = await websocket.receive_json()

            if frame.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if frame.get("type") == "audio":
                await _handle_audio_frame(websocket, frame)
                continue

            # Unknown frame type — echo an error, never crash the socket.
            await websocket.send_json(
                {"type": "error", "detail": f"unknown frame type {frame.get('type')!r}"}
            )

    except WebSocketDisconnect:
        logger.info("Voice websocket disconnected")
    except Exception:  # noqa: BLE001 — keep server alive on protocol errors
        logger.exception("Voice websocket error")
        try:
            await websocket.send_json({"type": "error", "detail": "internal server error"})
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


async def _handle_audio_frame(websocket: WebSocket, frame: dict) -> None:
    """Decode a base64 PCM16 audio frame, run VAD, reply with placeholders."""
    b64_data = frame.get("data", "")
    try:
        audio = base64.b64decode(b64_data, validate=True)
    except (binascii.Error, ValueError):
        await websocket.send_json({"type": "error", "detail": "invalid base64 audio data"})
        return

    is_speech = vad_service.vad_service.is_speech(audio)
    if not is_speech:
        await websocket.send_json(
            {"type": "status", "message": "silence", "bytes": len(audio)}
        )
        return

    # ---- Pipeline stub --------------------------------------------------- #
    # 1. STT:   transcript = await stt_service.transcribe(audio)   (TODO)
    # 2. LLM:   reply = await llm_service.chat(...)                (TODO)
    # 3. TTS:   audio_out = await tts_service.synthesize(reply)    (TODO)
    transcript = await stt_service.transcribe(audio)  # placeholder, keeps plumbing real
    await websocket.send_json(
        {
            "type": "transcript.placeholder",
            "speech_detected": True,
            "bytes": len(audio),
            "text": transcript.get("text", ""),
            "provider": transcript.get("provider"),
            "detail": transcript.get("detail"),
            "pipeline": {"stt": "stub", "llm": "stub", "tts": "stub"},
        }
    )

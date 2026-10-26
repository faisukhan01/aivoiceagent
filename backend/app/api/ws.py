"""WebSocket endpoints for the real-time voice pipeline.

Client → server JSON frames:
  {"type": "ping"}                          → {"type": "pong"}
  {"type": "audio", "data": "<b64 pcm16>"}  → {"type": "vad", "speech": bool, "speech_frames": n}
  {"type": "text",  "data": "hello"}        → {"type": "llm", "text": "..."}  (when keys configured)

This is the wiring point for the full duplex loop:
  mic → VAD → STT → LLM (stream) → TTS → playback
"""

from __future__ import annotations

import base64
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.vad import get_vad

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice-ws"])


@router.websocket("/ws/voice")
async def voice_socket(ws: WebSocket) -> None:
    await ws.accept()
    vad = get_vad()
    logger.info("voice socket connected (vad=%s)", vad.name)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "detail": "frames must be JSON text"})
                continue

            msg_type = frame.get("type")

            if msg_type == "ping":
                await ws.send_json({"type": "pong"})

            elif msg_type == "audio":
                try:
                    pcm = base64.b64decode(frame.get("data", ""))
                except Exception:
                    await ws.send_json({"type": "error", "detail": "invalid base64 audio"})
                    continue
                from app.services.vad import FRAME_BYTES

                speech_frames = vad.frames_with_speech(pcm)
                await ws.send_json(
                    {
                        "type": "vad",
                        "engine": vad.name,
                        "speech": bool(speech_frames),
                        "speech_frames": len(speech_frames),
                        "total_frames": max(len(pcm) // FRAME_BYTES, 0),
                    }
                )

            elif msg_type == "text":
                # LLM loop: wired to provider abstraction; graceful when unconfigured.
                try:
                    from app.services.llm import ChatMessage, chat

                    result = await chat([ChatMessage(role="user", content=str(frame.get("data", "")))])
                    await ws.send_json({"type": "llm", "provider": result.provider, "text": result.text})
                except Exception as exc:
                    await ws.send_json({"type": "llm-unavailable", "detail": str(exc)})

            else:
                await ws.send_json({"type": "error", "detail": f"unknown frame type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info("voice socket disconnected")

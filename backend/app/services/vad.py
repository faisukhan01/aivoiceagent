"""Voice Activity Detection.

Prefers `webrtcvad` (Google's WebRTC VAD, the industry standard used with
WebRTC/LiveKit pipelines). Falls back to a simple numpy energy-based VAD when
the native module is unavailable, keeping the same interface.
"""

from __future__ import annotations

from typing import Protocol

SAMPLE_RATE = 16_000
FRAME_MS = 30
FRAME_BYTES = int(SAMPLE_RATE * FRAME_MS / 1000) * 2  # 16-bit mono PCM


class VAD(Protocol):
    name: str

    def is_speech(self, frame: bytes) -> bool:
        """Return True when a single PCM16 mono frame contains speech."""
        ...

    def frames_with_speech(self, audio: bytes) -> list[int]:
        """Return indices of speech frames within a PCM16 buffer."""
        ...


class WebRtcVAD:
    """Wrapper around Google WebRTC VAD (native)."""

    def __init__(self, aggressiveness: int = 2) -> None:
        import webrtcvad  # lazy import; optional dependency

        self._vad = webrtcvad.Vad(aggressiveness)
        self.name = "webrtcvad"

    def is_speech(self, frame: bytes) -> bool:
        if len(frame) != FRAME_BYTES:
            frame = frame[:FRAME_BYTES].ljust(FRAME_BYTES, b"\x00")
        try:
            return self._vad.is_speech(frame, SAMPLE_RATE)
        except Exception:
            return False

    def frames_with_speech(self, audio: bytes) -> list[int]:
        return [i for i in range(0, len(audio) - FRAME_BYTES + 1, FRAME_BYTES) if self.is_speech(audio[i : i + FRAME_BYTES])]


class EnergyVAD:
    """Fallback energy-based VAD (numpy RMS threshold). Good enough for dev."""

    def __init__(self, threshold: float = 550.0) -> None:
        self.threshold = threshold
        self.name = "energy"

    def is_speech(self, frame: bytes) -> bool:
        import numpy as np

        if not frame:
            return False
        samples = np.frombuffer(frame[: len(frame) // 2 * 2], dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            return False
        return float(np.sqrt(np.mean(samples**2))) > self.threshold

    def frames_with_speech(self, audio: bytes) -> list[int]:
        return [i for i in range(0, len(audio) - FRAME_BYTES + 1, FRAME_BYTES) if self.is_speech(audio[i : i + FRAME_BYTES])]


def get_vad() -> VAD:
    """Factory: WebRTC VAD when available, energy VAD otherwise."""
    try:
        return WebRtcVAD()
    except Exception:
        return EnergyVAD()

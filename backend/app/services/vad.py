"""Voice activity detection (VAD).

Two interchangeable implementations sharing the same interface:

* :class:`WebRtcVAD` — wraps the native ``webrtcvad`` C extension when the
  package built successfully at install time.
* :class:`EnergyVAD` — pure-numpy fallback computing RMS energy over
  16 kHz mono PCM16 frames (dev/no-compiler environments).

Use :func:`get_vad` to obtain whichever backend is available.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# WebRTC VAD constraints: 8/16/32/48 kHz, 10/20/30 ms frames.
SAMPLE_RATE = 16000
FRAME_MS = 30
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000  # 480 samples
FRAME_BYTES = FRAME_SAMPLES * 2  # pcm16 → 2 bytes/sample

try:  # pragma: no cover - import guard depends on native build success
    import webrtcvad  # type: ignore[import-not-found]

    _HAS_WEBRTCVAD = True
except ImportError:  # pragma: no cover
    webrtcvad = None  # type: ignore[assignment]
    _HAS_WEBRTCVAD = False


class BaseVAD:
    """Shared VAD interface."""

    name: str = "base"

    def is_speech(self, frames: bytes | list[bytes], sample_rate: int = SAMPLE_RATE) -> bool:
        """Return True if the given PCM16 frame(s) contain speech."""
        raise NotImplementedError

    def info(self) -> dict[str, Any]:
        """Backend description for /api/voice/capabilities."""
        return {"backend": self.name}


class WebRtcVAD(BaseVAD):
    """Native webrtcvad wrapper (high accuracy, 10/20/30 ms frames)."""

    name = "webrtcvad"

    def __init__(self, aggressiveness: int = 2) -> None:
        if not _HAS_WEBRTCVAD:
            raise RuntimeError("webrtcvad is not installed")
        self._vad = webrtcvad.Vad(aggressiveness)

    def is_speech(self, frames: bytes | list[bytes], sample_rate: int = SAMPLE_RATE) -> bool:
        """True when any single frame (or >1/3 of many frames) is speech."""
        chunks = [frames] if isinstance(frames, (bytes, bytearray)) else list(frames)
        verdicts = [self._vad.is_speech(bytes(c), sample_rate) for c in chunks if len(c) == FRAME_BYTES]
        if not verdicts:
            return False
        if len(verdicts) == 1:
            return verdicts[0]
        return sum(verdicts) * 3 > len(verdicts)

    def info(self) -> dict[str, Any]:
        return {"backend": self.name, "frame_ms": FRAME_MS, "aggressive": True}


class EnergyVAD(BaseVAD):
    """RMS-energy fallback over 16 kHz mono PCM16 audio (numpy)."""

    name = "energy"

    def __init__(self, threshold: float = 0.015, min_frames: int = 1) -> None:
        self.threshold = threshold
        self.min_frames = min_frames

    @staticmethod
    def _rms(values: np.ndarray) -> float:
        return float(np.sqrt(np.mean(np.square(values)))) if values.size else 0.0

    def is_speech(self, frames: bytes | list[bytes], sample_rate: int = SAMPLE_RATE) -> bool:
        """True when RMS energy of any frame exceeds the threshold.

        Works for arbitrary frame sizes; resamples the threshold assumption
        by simply accepting whatever pcm16 frame length arrives (dev-mode
        behavior — real pipelines should feed 30 ms @ 16 kHz frames).
        """
        chunks = [frames] if isinstance(frames, (bytes, bytearray)) else list(frames)
        voiced = 0
        total = 0
        for chunk in chunks:
            data = bytes(chunk)
            if len(data) < 2 or len(data) % 2:
                continue
            samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
            total += 1
            if self._rms(samples) >= self.threshold:
                voiced += 1
        return total > 0 and voiced >= self.min_frames and voiced * 3 > total

    def info(self) -> dict[str, Any]:
        return {
            "backend": self.name,
            "threshold": self.threshold,
            "sample_rate": SAMPLE_RATE,
            "note": "numpy RMS fallback (dev mode)",
        }


def get_vad() -> WebRtcVAD | EnergyVAD:
    """Return the best available VAD backend (webrtcvad if importable)."""
    if _HAS_WEBRTCVAD:
        return WebRtcVAD()
    return EnergyVAD()


vad_service = get_vad()
"""Module-level VAD singleton used by the websocket router."""

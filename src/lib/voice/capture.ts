'use client'

/**
 * Microphone capture with client-side voice-activity detection.
 *
 * Design notes (fixes for the "Speech recognition unavailable" + "not
 * listening" bugs):
 * - MediaRecorder is started when the capture is armed and STOPPED when the
 *   utterance ends. The blob is assembled inside `onstop`, so every utterance
 *   is a complete, self-contained WebM (EBML header included) and the final
 *   audio tail is never clipped. A fresh recorder starts for the next turn.
 * - Adaptive threshold: a running noise-floor estimate scales with the room,
 *   so quiet mics still trigger and noisy rooms don't false-trigger.
 * - Hysteresis (end threshold below start threshold) + a short minimum speech
 *   time prevents clicks/blips from producing junk requests.
 */

export interface VadOptions {
  /** Minimum absolute RMS to start speech (floor for the adaptive threshold). */
  minThreshold?: number
  /** Maximum absolute RMS for the adaptive threshold (noisy rooms). */
  maxThreshold?: number
  /** Noise-floor multiplier for speech start. */
  sensitivity?: number
  /** Silence duration (ms) before an utterance is considered finished. */
  silenceMs?: number
  /** Speech must persist this long (ms) to count as an utterance. */
  minSpeechMs?: number
  /** Hard cap per utterance (ms) — auto-flush afterwards. */
  maxUtteranceMs?: number
  onLevel?: (level: number) => void
  onSpeechStart?: () => void
  onSpeechEnd?: (blob: Blob) => void
  onError?: (error: Error) => void
}

type CaptureState = 'idle' | 'armed' | 'pending' | 'capturing' | 'processing'

export class VoiceCapture {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private raf = 0
  private state: CaptureState = 'idle'
  private barge = false
  private silenceSince = 0
  private speechStartedAt = 0
  private noiseFloor = 0.012
  private opts: VadOptions

  constructor(opts: VadOptions = {}) {
    this.opts = opts
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    // Some browsers start the context suspended — resume to get audio flowing.
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    const source = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    source.connect(this.analyser)

    this.spawnRecorder()
    this.loop()
  }

  /** Begin listening for the next utterance. Safe to call repeatedly. */
  arm(): void {
    if (this.state === 'capturing') return
    this.barge = false
    this.chunks = []
    this.silenceSince = 0
    this.state = 'armed'
    this.ensureRecorder()
  }

  /**
   * Arm the mic while the assistant is thinking/speaking (barge-in mode).
   * Uses an echo-guarded threshold: the trigger needs to be louder AND
   * sustained longer than normal speech, so the assistant's own TTS output
   * (attenuated by echo cancellation but still present) doesn't interrupt
   * itself, while a real human voice does.
   */
  armBarge(): void {
    if (this.state === 'capturing') return
    this.chunks = []
    this.silenceSince = 0
    this.state = 'armed'
    this.barge = true
    this.ensureRecorder()
  }

  private ensureRecorder(): void {
    // A fresh recorder per utterance guarantees a valid WebM header.
    if (!this.recorder || this.recorder.state === 'inactive') this.spawnRecorder()
    if (this.recorder && this.recorder.state !== 'recording') {
      try {
        this.recorder.start(250)
      } catch {
        this.spawnRecorder()
        try {
          this.recorder?.start(250)
        } catch {
          /* recorder unusable — mic appears dead; error path handled elsewhere */
        }
      }
    }
  }

  /** Force-finish the current utterance (e.g., user pressed stop). */
  flush(): Blob | null {
    const blob = this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null
    this.chunks = []
    this.state = 'idle'
    return blob
  }

  /** Current capture state (for UI/tests). */
  getState(): CaptureState {
    return this.state
  }

  private spawnRecorder(): void {
    if (!this.stream) return
    try {
      this.recorder = new MediaRecorder(this.stream)
    } catch {
      this.recorder = null
      this.opts.onError?.(new Error('MediaRecorder is not supported in this browser'))
      return
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => {
      const blob = this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null
      this.chunks = []
      if (this.state === 'capturing') {
        this.state = 'processing'
        if (blob && blob.size > 0) this.opts.onSpeechEnd?.(blob)
        else this.state = 'idle'
      }
    }
  }

  /** Adaptive speech threshold from the running noise floor. */
  private threshold(): number {
    const min = this.opts.minThreshold ?? 0.015
    const max = this.barge ? 0.3 : 0.18
    const mult = this.barge ? (this.opts.sensitivity ?? 2.5) * 2.0 : (this.opts.sensitivity ?? 2.5)
    return Math.min(max, Math.max(min, this.noiseFloor * mult))
  }

  private loop = () => {
    if (!this.analyser) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    this.opts.onLevel?.(rms)

    const now = performance.now()
    const silenceMs = this.opts.silenceMs ?? 550
    const minSpeechMs = this.barge ? 250 : (this.opts.minSpeechMs ?? 120)
    const maxUtteranceMs = this.opts.maxUtteranceMs ?? 25_000
    const startTh = this.threshold()
    const endTh = startTh * 0.65

    // Adapt the noise floor ONLY on genuinely quiet ambience (absolute cap).
    // Adapting on any sub-threshold audio let the user's own quiet speech
    // raise the floor, which raised the threshold, which made the mic harder
    // to trigger — the "takes forever to start listening" feedback loop.
    if ((this.state === 'armed' || this.state === 'pending') && !this.barge && rms < 0.02) {
      this.noiseFloor = 0.92 * this.noiseFloor + 0.08 * rms
    }

    if (this.state === 'armed' && rms > startTh) {
      this.speechStartedAt = now
      this.silenceSince = now
      // Confirm the sound persists — filters clicks and keyboard taps.
      this.state = 'pending'
    } else if (this.state === 'pending') {
      if (rms > startTh) {
        if (now - this.speechStartedAt >= minSpeechMs) {
          this.state = 'capturing'
          if (this.barge) this.chunks = [] // drop echo pre-roll from the TTS playback
          this.opts.onSpeechStart?.()
        }
      } else {
        this.state = 'armed' // blip discarded
      }
    }

    if (this.state === 'capturing') {
      if (rms > endTh) {
        this.silenceSince = now
      } else if (now - this.silenceSince > silenceMs || now - this.speechStartedAt > maxUtteranceMs) {
        // Finish the utterance: stop the recorder; onstop assembles the blob
        // (complete WebM incl. header and unclipped tail) and notifies.
        this.finishUtterance()
      }
    }

    this.raf = requestAnimationFrame(this.loop)
  }

  private finishUtterance(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop() // triggers onstop → onSpeechEnd
      } catch {
        this.state = 'idle'
      }
    } else {
      this.state = 'idle'
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        /* already stopped */
      }
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
    this.stream = null
    this.ctx = null
    this.analyser = null
    this.recorder = null
    this.chunks = []
    this.state = 'idle'
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

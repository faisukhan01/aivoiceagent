'use client'

/**
 * Microphone capture with client-side voice-activity detection.
 *
 * - AudioContext analyser computes RMS energy over ~30ms windows
 * - speech starts above `startThreshold`, ends after `silenceMs` of quiet
 * - while active, MediaRecorder captures webm/opus for server-side ASR
 * - onSpeechEnd resolves with the recorded Blob
 * - `arm()` re-arms for the next turn; used for hands-free barje-in mode
 */

export interface VadOptions {
  startThreshold?: number
  silenceMs?: number
  onLevel?: (level: number) => void
  onSpeechStart?: () => void
  onSpeechEnd?: (blob: Blob) => void
  onError?: (error: Error) => void
}

export class VoiceCapture {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private raf = 0
  private speaking = false
  private silenceSince = 0
  private armed = false
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
    const source = this.ctx.createMediaStreamSource(this.stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    source.connect(this.analyser)

    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.start(250)
    this.loop()
  }

  /** Begin listening for the next utterance. */
  arm(): void {
    this.chunks = []
    this.speaking = false
    this.silenceSince = 0
    this.armed = true
  }

  /** Force-finish the current utterance (e.g., user pressed stop). */
  flush(): Blob | null {
    const blob = this.chunks.length ? new Blob(this.chunks, { type: 'audio/webm' }) : null
    this.armed = false
    this.speaking = false
    return blob
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
    const threshold = this.opts.startThreshold ?? 0.045
    const silenceMs = this.opts.silenceMs ?? 900

    if (this.armed && !this.speaking && rms > threshold) {
      this.speaking = true
      this.silenceSince = now
      this.opts.onSpeechStart?.()
    } else if (this.speaking) {
      if (rms > threshold) {
        this.silenceSince = now
      } else if (now - this.silenceSince > silenceMs) {
        this.speaking = false
        this.armed = false
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        this.chunks = []
        this.opts.onSpeechEnd?.(blob)
      }
    }

    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.recorder?.state !== 'inactive' && this.recorder?.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.stream = null
    this.ctx = null
    this.analyser = null
    this.recorder = null
    this.armed = false
    this.speaking = false
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

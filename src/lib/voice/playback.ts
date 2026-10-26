'use client'

/**
 * Sequential TTS playback queue with hard interruption and look-ahead
 * pipelining: while sentence N is playing, sentence N+1 is already being
 * synthesized on the server — removing the per-sentence gap that made the
 * conversation feel slow. `interrupt()` drops the queue, aborts in-flight
 * speech requests and pauses the playing element immediately (barge-in).
 */
export class SpeechQueue {
  private queue: string[] = []
  private audio: HTMLAudioElement | null = null
  private controller: AbortController | null = null
  private running = false
  private voice: string
  private busy = false
  private onStateChange?: (state: 'idle' | 'synthesizing' | 'speaking') => void
  private onChunkDone?: (text: string) => void

  constructor(opts: { voice: string; onStateChange?: (state: 'idle' | 'synthesizing' | 'speaking') => void; onChunkDone?: (text: string) => void }) {
    this.voice = opts.voice
    this.onStateChange = opts.onStateChange
    this.onChunkDone = opts.onChunkDone
  }

  enqueue(text: string): void {
    this.queue.push(text)
    void this.pump()
  }

  /** True while chunks are queued, being synthesized or played back. */
  isBusy(): boolean {
    return this.busy
  }

  private setState(state: 'idle' | 'synthesizing' | 'speaking') {
    this.onStateChange?.(state)
  }

  private async fetchAudio(text: string, signal: AbortSignal): Promise<Blob | null> {
    const res = await fetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: this.voice }),
      signal,
    })
    if (!res.ok) return null // synthesis failure — skip chunk, keep transcript
    return res.blob()
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.audio = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        this.audio = null
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        this.audio = null
        resolve()
      }
      void audio.play().catch(() => {
        URL.revokeObjectURL(url)
        this.audio = null
        resolve()
      })
    })
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    this.busy = true
    try {
      while (this.queue.length > 0) {
        const text = this.queue.shift()!
        this.setState('synthesizing')
        this.controller = new AbortController()
        const signal = this.controller.signal

        // Look-ahead: start synthesizing the NEXT sentence while this one
        // is being fetched — the network round-trip overlaps with playback.
        const nextText = this.queue[0]
        const nextPromise: Promise<Blob | null> | null =
          nextText !== undefined ? this.fetchAudio(nextText, signal).catch(() => null) : null

        let blob: Blob | null = null
        try {
          blob = await this.fetchAudio(text, signal)
        } catch {
          blob = null
        }
        if (signal.aborted) return
        this.controller = null

        if (blob) {
          this.setState('speaking')
          await this.playBlob(blob)
          if (signal.aborted) return
        }
        this.onChunkDone?.(text)

        // Swap in the pre-fetched audio, if any.
        if (nextPromise) {
          const nextBlob = await nextPromise
          if (signal.aborted) return
          if (nextBlob) {
            this.queue.shift() // consumed the pre-fetched text
            this.setState('speaking')
            await this.playBlob(nextBlob)
            if (signal.aborted) return
            this.onChunkDone?.(nextText as string)
          }
        }
      }
      this.setState('idle')
      this.busy = false
    } catch {
      this.setState('idle')
      this.busy = false
    } finally {
      this.running = false
    }
  }

  /** Stop everything immediately. */
  interrupt(): void {
    this.queue = []
    this.controller?.abort()
    this.controller = null
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
      this.audio = null
    }
    this.running = false
    this.busy = false
    this.setState('idle')
  }

  setVoice(voice: string): void {
    this.voice = voice
  }
}

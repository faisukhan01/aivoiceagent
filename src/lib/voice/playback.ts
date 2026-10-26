'use client'

/**
 * Sequential TTS playback queue with hard interruption.
 * Each sentence chunk becomes one /api/voice/speak request; audio segments
 * play back-to-back. `interrupt()` drops the queue, aborts in-flight speech
 * requests and pauses the playing element immediately (barge-in).
 */
export class SpeechQueue {
  private queue: string[] = []
  private audio: HTMLAudioElement | null = null
  private controller: AbortController | null = null
  private running = false
  private voice: string
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

  private setState(state: 'idle' | 'synthesizing' | 'speaking') {
    this.onStateChange?.(state)
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const text = this.queue.shift()!
        this.setState('synthesizing')
        this.controller = new AbortController()
        const res = await fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: this.voice }),
          signal: this.controller.signal,
        })
        if (!res.ok) {
          // Synthesis failure — skip this chunk, keep transcript visible.
          this.onChunkDone?.(text)
          continue
        }
        const blob = await res.blob()
        if (this.controller.signal.aborted) return
        this.setState('speaking')
        await new Promise<void>((resolve) => {
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
          void audio.play().catch(() => resolve())
        })
        this.onChunkDone?.(text)
      }
      this.setState('idle')
    } catch {
      this.setState('idle')
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
    this.setState('idle')
  }

  setVoice(voice: string): void {
    this.voice = voice
  }
}

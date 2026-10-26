'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, Mic, MicOff, PhoneOff, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { VoiceCapture } from '@/lib/voice/capture'
import { SpeechQueue } from '@/lib/voice/playback'
import { useStore } from '@/lib/store'

type CallState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

interface Turn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Live voice conversation.
 * Real end-to-end pipeline: mic → VAD → ASR → streaming LLM → chunked TTS →
 * playback, with barge-in interruption while the assistant speaks.
 *
 * Re-arm invariant: the mic is re-armed exactly when BOTH the chat stream and
 * the TTS queue are done (whichever finishes last triggers the re-arm), so the
 * microphone can never get stuck disarmed between turns.
 */
export function VoiceMode({ onSend }: { onSend: (text: string) => void }) {
  const { setVoiceMode, voice } = useStore()
  const [state, setState] = useState<CallState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [partialUser, setPartialUser] = useState('')
  const [partialAssistant, setPartialAssistant] = useState('')

  const captureRef = useRef<VoiceCapture | null>(null)
  const queueRef = useRef<SpeechQueue | null>(null)
  const busyRef = useRef(false) // chat stream in flight
  const queueBusyRef = useRef(false) // TTS synthesis/playback in flight
  const streamRef = useRef<AbortController | null>(null)
  const errorTimerRef = useRef<number | null>(null)
  const transcriptRef = useRef('')

  const setCallState = useCallback((s: CallState) => {
    setState(s)
  }, [])

  const showError = useCallback((message: string) => {
    setError(message)
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current)
    errorTimerRef.current = window.setTimeout(() => setError(null), 5000)
  }, [])

  /** Re-arm the mic iff nothing is in flight — the single re-arm gate. */
  const maybeRearm = useCallback(() => {
    if (!busyRef.current && !queueBusyRef.current) {
      captureRef.current?.arm()
      if (stateRef.current !== 'error') setCallState('listening')
    }
  }, [setCallState])

  /** One full conversational turn: transcript → stream → speak. */
  const runTurn = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      busyRef.current = true
      // CRITICAL: reset the spoken-prefix cursor per turn — otherwise a
      // response shorter than the previous one enqueues nothing and the
      // assistant goes silent (the "not responding completely" bug).
      pendingSpokenLen.current = 0
      setTurns((t) => [...t, { role: 'user', text }])
      transcriptRef.current = ''
      setPartialUser('')
      setPartialAssistant('')
      setCallState('thinking')
      // Barge-in window: mic is live (echo-guarded) during thinking, so the
      // user can interrupt a slow/wrong answer by just talking over it.
      captureRef.current?.armBarge()

      const controller = new AbortController()
      streamRef.current = controller
      let full = ''

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, voiceMode: true }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error('chat request failed')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let doneStreaming = false

        while (!doneStreaming) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const line = frame.trim()
            if (!line.startsWith('data:')) continue
            try {
              const evt = JSON.parse(line.slice(5)) as { type: string; text?: string }
              if (evt.type === 'delta' && evt.text) {
                full += evt.text
                transcriptRef.current = full
                setPartialAssistant(full)
              } else if (evt.type === 'done') {
                doneStreaming = true
              } else if (evt.type === 'error') {
                throw new Error(evt.text ?? 'assistant error')
              }
            } catch {
              // skip malformed frame
            }
          }

          // Chunked TTS: enqueue at sentence boundaries, or soft breaks
          // (commas) once enough text is on screen — first audio starts
          // ~1s earlier than waiting for a full sentence.
          const queue = queueRef.current
          if (queue) {
            const spoken = queuePendingSpoken(full, 36)
            if (spoken.length > pendingSpokenLen.current) {
              const newText = spoken.slice(pendingSpokenLen.current)
              pendingSpokenLen.current = spoken.length
              if (newText.trim()) queue.enqueue(newText.trim())
            }
          }
        }

        // Flush the tail: everything not yet spoken, even without a
        // trailing punctuation (previously a bare "Sure" was never spoken).
        const queue = queueRef.current
        if (queue && full.length > pendingSpokenLen.current) {
          const tail = full.slice(pendingSpokenLen.current).trim()
          if (tail) queue.enqueue(tail)
          pendingSpokenLen.current = full.length
        }

        setTurns((t) => [...t, { role: 'assistant', text: full }])
        setPartialAssistant('')
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          showError(err instanceof Error ? err.message : 'Voice turn failed')
          setCallState('error')
        }
      } finally {
        streamRef.current = null
        busyRef.current = false
        // If TTS already drained, this re-arms; otherwise the queue's idle
        // callback re-arms when it finishes (whichever is last wins).
        maybeRearm()
      }
    },
    [maybeRearm, setCallState, showError],
  )

  const pendingSpokenLen = useRef(0)

  /**
   * Splitter for streaming TTS: returns the speakable prefix of `text`.
   * Prefers sentence ends; falls back to soft breaks (comma/colon/dash)
   * once at least `softMinLen` chars are buffered so playback starts early.
   */
  function queuePendingSpoken(text: string, softMinLen = 0): string {
    const sentence = text.match(/^[\s\S]*[.!?。！?]\s/)
    if (sentence && sentence[0].length >= softMinLen) return sentence[0]
    if (text.length >= softMinLen) {
      const soft = text.match(/^[\s\S]*[，,;；:—]\s/)
      if (soft) return soft[0]
    }
    return ''
  }

  /** Handle a finished user utterance blob: transcribe, then run the turn. */
  const handleUtterance = useCallback(
    async (blob: Blob) => {
      setCallState('thinking')
      busyRef.current = true // transcription counts as busy — blocks stray re-arms
      try {
        const form = new FormData()
        form.append('audio', blob, 'utterance.webm')
        const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
        const data = (await res.json()) as { text?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? 'transcription failed')
        // Empty transcript = background noise — silently keep listening.
        if (!data.text || !data.text.trim()) {
          busyRef.current = false
          setCallState('listening')
          maybeRearm()
          return
        }
        setPartialUser(data.text)
        await runTurn(data.text)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          busyRef.current = false
          return
        }
        showError(err instanceof Error ? err.message : 'Speech recognition failed')
        setCallState('error')
        // Never leave the mic dead — the user can just speak again.
        busyRef.current = false
        queueBusyRef.current = false
        maybeRearm()
      }
    },
    [maybeRearm, runTurn, showError],
  )

  // Init capture + playback on mount.
  useEffect(() => {
    let cancelled = false

    const queue = new SpeechQueue({
      voice,
      onStateChange: (s) => {
        queueBusyRef.current = s !== 'idle'
        if (s === 'idle') {
          maybeRearm()
        } else {
          // Synthesizing or speaking — keep the mic live with the echo
          // guard so the user can interrupt ("just talk over me").
          captureRef.current?.armBarge()
          if (busyRef.current || stateRef.current === 'speaking') setCallState('speaking')
        }
      },
    })
    queueRef.current = queue

    const capture = new VoiceCapture({
      onLevel: (l) => setLevel(l),
      onSpeechStart: () => {
        // Barge-in: user started speaking while the assistant talks.
        if (queueBusyRef.current || streamRef.current) {
          queueRef.current?.interrupt()
          queueBusyRef.current = false
          streamRef.current?.abort()
          streamRef.current = null
          busyRef.current = false
        }
        setCallState('listening')
      },
      onSpeechEnd: (blob) => {
        if (blob.size < 800) {
          // noise blip — re-arm
          captureRef.current?.arm()
          return
        }
        void handleUtterance(blob)
      },
      onError: (e) => {
        showError(e.message)
        setCallState('error')
      },
    })
    captureRef.current = capture

    capture
      .start()
      .then(() => {
        if (!cancelled) {
          capture.arm()
          setCallState('listening')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Microphone permission denied. Enable it in your browser settings to use voice.')
          setCallState('error')
        }
      })

    return () => {
      cancelled = true
      capture.stop()
      queue.interrupt()
      streamRef.current?.abort()
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current)
    }
  }, [])

  // Track state in a ref for the callbacks.
  const stateRef = useRef<CallState>('connecting')
  useEffect(() => {
    stateRef.current = state
  }, [state])

  function endCall() {
    streamRef.current?.abort()
    queueRef.current?.interrupt()
    captureRef.current?.stop()
    setVoiceMode(false)
  }

  const orbScale = 1 + Math.min(level * 1.6, 0.5)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-stone-950/97 backdrop-blur-xl"
      role="dialog"
      aria-label="Voice conversation"
    >
      {/* header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-stone-300">
          <AudioLines className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium">Auralis · voice</span>
        </div>
        <Button variant="ghost" size="sm" onClick={endCall} className="gap-2 text-stone-300 hover:bg-stone-800 hover:text-white">
          <PhoneOff className="h-4 w-4" /> End call
        </Button>
      </div>

      {/* orb + transcript */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
        <motion.div
          animate={{ scale: state === 'speaking' ? [1, 1.08, 1] : orbScale }}
          transition={state === 'speaking' ? { repeat: Infinity, duration: 1.2 } : { duration: 0.12 }}
          className={`grid h-32 w-32 place-items-center rounded-full shadow-2xl ${
            state === 'error' ? 'bg-red-900 text-red-200' : state === 'thinking' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {state === 'listening' && <Mic className="h-10 w-10" />}
          {state === 'thinking' && <Sparkles className="h-10 w-10 animate-pulse" />}
          {state === 'speaking' && <AudioLines className="h-10 w-10" />}
          {state === 'error' && <MicOff className="h-10 w-10" />}
          {state === 'connecting' && <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        </motion.div>

        <div className="h-1 w-40 overflow-hidden rounded-full bg-stone-800">
          <motion.div
            className="h-full bg-emerald-500"
            animate={{ width: `${Math.min(level * 400, 100)}%` }}
            transition={{ duration: 0.08 }}
          />
        </div>

        <p className="text-sm font-medium text-stone-400" aria-live="polite">
          {state === 'connecting' && 'Connecting…'}
          {state === 'listening' && 'Listening — speak naturally'}
          {state === 'thinking' && 'Thinking…'}
          {state === 'speaking' && 'Speaking — just interrupt me'}
          {state === 'error' && 'Something went wrong — speak to try again'}
        </p>

        {/* live transcript */}
        <div className="max-h-64 w-full max-w-2xl space-y-3 overflow-y-auto text-center">
          {turns.slice(-6).map((t, i) => (
            <p key={i} className={t.role === 'user' ? 'text-stone-400' : 'text-stone-100'}>
              <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-emerald-500/80">
                {t.role === 'user' ? 'You' : 'Auralis'}
              </span>
              {t.text}
            </p>
          ))}
          {partialUser && <p className="text-stone-400">— {partialUser}</p>}
          {partialAssistant && <p className="text-stone-100">{partialAssistant}</p>}
        </div>

        {error && (
          <p role="alert" className="max-w-md rounded-lg bg-red-950/60 px-4 py-2 text-center text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-stone-500">
        Speech recognition and synthesis run server-side · interrupt anytime by speaking
      </p>
    </motion.div>
  )
}

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
  const busyRef = useRef(false)
  const streamRef = useRef<AbortController | null>(null)
  const transcriptRef = useRef('')
  const lastUserRef = useRef('')

  const setCallState = useCallback((s: CallState) => {
    setState(s)
  }, [])

  /** One full conversational turn: transcript → stream → speak. */
  const runTurn = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      busyRef.current = true
      lastUserRef.current = text
      setTurns((t) => [...t, { role: 'user', text }])
      transcriptRef.current = ''
      setPartialUser('')
      setPartialAssistant('')
      setCallState('thinking')

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

          // Sentence-chunked TTS: enqueue complete sentences as they stream.
          const queue = queueRef.current
          if (queue) {
            const spoken = queuePendingSpoken(full)
            if (spoken.length > pendingSpokenLen.current) {
              const newText = spoken.slice(pendingSpokenLen.current)
              pendingSpokenLen.current = spoken.length
              if (newText.trim()) queue.enqueue(newText.trim())
            }
          }
        }

        // Flush any trailing sentence.
        const queue = queueRef.current
        const spoken = queuePendingSpoken(full)
        if (queue && spoken.slice(pendingSpokenLen.current).trim()) {
          queue.enqueue(spoken.slice(pendingSpokenLen.current).trim())
          pendingSpokenLen.current = spoken.length
        }

        setTurns((t) => [...t, { role: 'assistant', text: full }])
        setPartialAssistant('')
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Voice turn failed')
          setCallState('error')
        }
      } finally {
        streamRef.current = null
        busyRef.current = false
      }
    },
    [setCallState],
  )

  const pendingSpokenLen = useRef(0)

  /** Sentence boundary splitter used to stream TTS while tokens arrive. */
  function queuePendingSpoken(text: string): string {
    const match = text.match(/^[\s\S]*[.!?。！?]\s/)
    return match ? match[0] : ''
  }

  /** Handle a finished user utterance blob: transcribe, then run the turn. */
  const handleUtterance = useCallback(
    async (blob: Blob) => {
      setCallState('thinking')
      try {
        const form = new FormData()
        form.append('audio', blob, 'utterance.webm')
        const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
        const data = (await res.json()) as { text?: string; error?: string }
        if (!res.ok || !data.text) throw new Error(data.error ?? 'transcription failed')
        setPartialUser(data.text)
        await runTurn(data.text)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Speech recognition failed')
        setCallState('error')
      }
    },
    [runTurn, setCallState],
  )

  // Init capture + playback on mount.
  useEffect(() => {
    let cancelled = false

    const queue = new SpeechQueue({
      voice,
      onStateChange: (s) => {
        if (busyRef.current && s === 'speaking') setCallState('speaking')
        if (s === 'idle' && !busyRef.current) {
          setCallState('listening')
          captureRef.current?.arm()
        }
      },
    })
    queueRef.current = queue

    const capture = new VoiceCapture({
      onLevel: (l) => setLevel(l),
      onSpeechStart: () => {
        // Barge-in: user started speaking while the assistant talks.
        if (queueRef.current && (stateRef.current === 'speaking' || stateRef.current === 'synthesizing' as CallState)) {
          queueRef.current.interrupt()
          streamRef.current?.abort()
        }
        setCallState('listening')
      },
      onSpeechEnd: (blob) => {
        if (blob.size < 2000) {
          // noise blip — re-arm
          captureRef.current?.arm()
          return
        }
        void handleUtterance(blob)
      },
      onError: (e) => {
        setError(e.message)
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
    }
     
  }, [])

  // Track state in a ref for the barge-in callback.
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
          {state === 'error' && 'Something went wrong'}
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

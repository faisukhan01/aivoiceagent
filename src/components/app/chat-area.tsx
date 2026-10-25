'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AudioLines, Check, Copy, Globe, RefreshCw, Wrench } from 'lucide-react'

import { Markdown } from '@/components/app/markdown'
import { Button } from '@/components/ui/button'
import { useStore, type UiMessage } from '@/lib/store'

export function ChatArea({ onRegenerate, onPrompt }: { onRegenerate: (messageId: string) => void; onPrompt: (prompt: string) => void }) {
  const messages = useStore((s) => s.messages)
  const streaming = useStore((s) => s.streaming)
  const bottomRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  return (
    <div className="flex-1 overflow-y-auto" onScroll={onScroll}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {messages.length === 0 ? <EmptyState onPrompt={onPrompt} /> : (
          <div className="space-y-6">
            {messages.map((m, i) => (
              <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} streaming={streaming} onRegenerate={onRegenerate} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const [greeting] = useState(() => {
    const h = new Date().getHours()
    return h < 5 ? 'Up late?' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.'
  })
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="py-16 text-center sm:py-24">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md">
        <AudioLines className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">{greeting}</h1>
      <p className="mt-2 text-stone-500 dark:text-stone-400">What are we working on today?</p>
      <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
        {[
          ['Explain a hard idea', 'Explain CRDTs like I am a strong junior engineer, with a worked example.'],
          ['Research something', 'What changed in the EU AI Act this year? Cite sources.'],
          ['Review my thinking', 'Here is my product pricing logic — poke holes in it.'],
          ['Talk it out loud', 'Use the mic — interrupt me anytime, like a real conversation.'],
        ].map(([title, prompt]) => (
          <button
            key={title}
            type="button"
            onClick={() => onPrompt(prompt)}
            className="rounded-xl border border-stone-200 bg-white p-3.5 text-left text-sm transition-all hover:border-emerald-300 hover:shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:hover:border-emerald-700"
          >
            <span className="block font-medium text-stone-800 dark:text-stone-100">{title}</span>
            <span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">{prompt}</span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function MessageBubble({
  message,
  isLast,
  streaming,
  onRegenerate,
}: {
  message: UiMessage
  isLast: boolean
  streaming: boolean
  onRegenerate: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-[15px] leading-relaxed text-white sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </motion.div>
    )
  }

  const meta = message.meta

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="group flex gap-3">
      <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
        <AudioLines className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {/* tool trace */}
        {meta?.tools?.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            {meta.tools.map((t, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full border border-stone-200 px-2 py-0.5 dark:border-stone-700">
                <Wrench className="h-3 w-3" />
                {t.name}
              </span>
            ))}
          </div>
        ) : null}

        {message.pending && !message.content ? (
          <div className="flex items-center gap-1.5 py-2" aria-label="Assistant is thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        ) : (
          <div className="text-[15px] leading-relaxed text-stone-800 dark:text-stone-200">
            <Markdown content={message.content} />
            {message.pending && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-emerald-600 align-text-bottom" />}
          </div>
        )}

        {/* sources */}
        {(meta?.sources?.length ?? 0) > 0 && !message.pending ? (
          <div className="mt-3 border-t border-stone-200 pt-2.5 dark:border-stone-800">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
              <Globe className="h-3 w-3" /> Sources
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(meta?.sources ?? []).map((s, i) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex max-w-56 items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
                >
                  <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">[{i + 1}]</span>
                  <span className="truncate">{s.name}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* actions */}
        {!message.pending && (
          <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              onClick={async () => {
                await navigator.clipboard.writeText(message.content)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            {isLast && !streaming && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                onClick={() => onRegenerate(message.id)}
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </Button>
            )}
            {message.meta?.stopped && <span className="text-xs text-stone-400">· stopped</span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

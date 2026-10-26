'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, FileText, Globe, Loader2, Mic, Paperclip, Square, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'

export function Composer({
  onSend,
  onStop,
  streaming,
  onVoice,
}: {
  onSend: (text: string) => void
  onStop: () => void
  streaming: boolean
  onVoice: () => void
}) {
  const { webSearch, toggleWebSearch, attachments, addAttachment, setAttachments } = useStore()
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useEffect(resize, [text, resize])

  function submit() {
    const value = text.trim()
    if (!value || streaming || uploading) return
    onSend(value)
    setText('')
  }

  async function uploadFile(file: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/files/extract', { method: 'POST', body: form })
      const data = (await res.json()) as { error?: string; document?: { id: string; filename: string; extracted_chars: number } }
      if (!res.ok || !data.document) throw new Error(data.error ?? 'Upload failed')
      addAttachment(data.document)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="border-t border-stone-200 bg-white/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-stone-800 dark:bg-stone-900/80 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Attachments */}
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex flex-wrap gap-1.5 overflow-hidden">
              {attachments.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pl-2.5 pr-1 text-xs text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                  <FileText className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="max-w-40 truncate">{a.filename}</span>
                  <button
                    aria-label={`Remove ${a.filename}`}
                    onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                    className="rounded-full p-0.5 hover:bg-stone-200 dark:hover:bg-stone-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {uploadError && (
          <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {uploadError}
          </p>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm focus-within:border-emerald-400 dark:border-stone-700 dark:bg-stone-950 dark:focus-within:border-emerald-600">
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
            onChange={(e) => e.target.files?.[0] && void uploadFile(e.target.files[0])}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Attach document"
            disabled={streaming || uploading || attachments.length >= 5}
            onClick={() => fileRef.current?.click()}
            className="h-9 w-9 shrink-0 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={webSearch}
            aria-label="Toggle web research"
            onClick={toggleWebSearch}
            className={`h-9 shrink-0 gap-1.5 px-2.5 ${
              webSearch
                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden text-xs font-medium sm:inline">Research</span>
          </Button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ask anything — or hold a conversation…"
            rows={1}
            maxLength={32000}
            aria-label="Message Auralis"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-50"
          />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Start voice conversation"
            onClick={onVoice}
            className="h-9 w-9 shrink-0 text-stone-500 hover:text-emerald-700 dark:hover:text-emerald-400"
          >
            <Mic className="h-4 w-4" />
          </Button>

          {streaming ? (
            <Button
              size="icon"
              aria-label="Stop generating"
              onClick={onStop}
              className="h-9 w-9 shrink-0 rounded-xl bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              aria-label="Send message"
              disabled={!text.trim() || uploading}
              onClick={submit}
              className="h-9 w-9 shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="mt-2 text-center text-[11px] text-stone-400">
          Auralis can make mistakes — verify important information. Research mode cites its sources.
        </p>
      </div>
    </div>
  )
}

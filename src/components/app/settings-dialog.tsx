'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Check, Loader2, Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useStore } from '@/lib/store'

interface VoiceStatus {
  ready: boolean
  tts: { voices: Array<{ id: string; label: string }> }
}

export function SettingsDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  user: { name?: string | null; email?: string | null }
}) {
  const { theme, setTheme } = useTheme()
  const voice = useStore((s) => s.voice)
  const setVoice = useStore((s) => s.setVoice)
  const [status, setStatus] = useState<VoiceStatus | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/voice/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VoiceStatus | null) => d && setStatus(d))
      .catch(() => {})
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto border-stone-200 sm:max-w-lg dark:border-stone-700">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Preferences are saved to your account.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Account */}
          <section>
            <Label className="text-stone-500 dark:text-stone-400">Account</Label>
            <p className="mt-1.5 text-sm text-stone-800 dark:text-stone-100">{user.name ?? 'Member'}</p>
            <p className="text-xs text-stone-400">{user.email}</p>
          </section>

          {/* Theme */}
          <section>
            <Label className="text-stone-500 dark:text-stone-400">Appearance</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ['light', Sun, 'Light'],
                ['dark', Moon, 'Dark'],
                ['system', Monitor, 'System'],
              ].map(([value, Icon, label]) => (
                <button
                  key={value as string}
                  type="button"
                  onClick={() => setTheme(value as string)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors ${
                    theme === value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'border-stone-200 text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:text-stone-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </div>
          </section>

          {/* Voice */}
          <section>
            <Label className="text-stone-500 dark:text-stone-400">Voice {status && !status.ready && '(unavailable — text fallback active)'}</Label>
            <div className="mt-2 space-y-1.5">
              {(status?.tts.voices ?? []).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoice(v.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                    voice === v.id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'border-stone-200 text-stone-700 hover:border-stone-300 dark:border-stone-700 dark:text-stone-200'
                  }`}
                >
                  {v.label}
                  {voice === v.id && <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                </button>
              ))}
              {!status && <Loader2 className="h-4 w-4 animate-spin text-stone-400" />}
            </div>
          </section>

          {/* Models */}
          <section>
            <Label className="text-stone-500 dark:text-stone-400">Model</Label>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                <span>Auralis Core</span>
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              {['OpenAI GPT-4o', 'Anthropic Claude', 'Google Gemini'].map((m) => (
                <div
                  key={m}
                  title="Add the provider API key to activate"
                  className="flex items-center justify-between rounded-lg border border-dashed border-stone-200 px-3 py-2 text-stone-400 dark:border-stone-700"
                >
                  <span>{m}</span>
                  <span className="text-xs">needs key</span>
                </div>
              ))}
            </div>
          </section>

          {/* Data */}
          <section>
            <Label className="text-stone-500 dark:text-stone-400">Data &amp; privacy</Label>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
              Conversations, documents, and preferences are stored in your private Turso account. Deleting a
              conversation removes its messages permanently. Passwords are hashed (bcrypt) and never visible to
              anyone — including us.
            </p>
          </section>
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
          Done
        </Button>
      </DialogContent>
    </Dialog>
  )
}

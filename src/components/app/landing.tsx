'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'
import { AudioLines, Loader2, Lock, Mail, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

type Mode = 'signin' | 'signup'

export function Landing() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: name || undefined }),
        })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Registration failed')
      }
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) throw new Error('Wrong email or password.')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-stone-950">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:gap-16 lg:py-20">
        {/* Brand column */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-xl flex-1"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <AudioLines className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-50">Auralis</p>
              <p className="-mt-0.5 text-xs text-stone-500 dark:text-stone-400">the assistant that listens</p>
            </div>
          </div>

          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
            Think out loud.
            <br />
            <span className="text-emerald-700 dark:text-emerald-400">Auralis answers — in text or in voice.</span>
          </h1>
          <p className="mt-5 text-pretty text-base leading-relaxed text-stone-600 dark:text-stone-300">
            A general-purpose AI assistant for real work: streaming answers with citations, web research, document
            Q&amp;A, code, math — and natural spoken conversations you can interrupt, like a phone call.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-stone-600 dark:text-stone-300">
            {[
              'Streaming responses with inline web citations',
              'Real voice conversations with barge-in interruption',
              'Documents in — grounded answers out (pdf, docx, md)',
              'Your history, yours alone — persisted in Turso',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Auth column */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
            <div className="mb-6 flex gap-1 rounded-lg bg-stone-100 p-1 dark:bg-stone-800">
              {(['signin', 'signup'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError(null)
                  }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-50'
                      : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-stone-700 dark:text-stone-300">
                    Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ada Lovelace"
                      className="border-stone-200 pl-9 dark:border-stone-700"
                      autoComplete="name"
                      maxLength={80}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-stone-700 dark:text-stone-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="border-stone-200 pl-9 dark:border-stone-700"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-stone-700 dark:text-stone-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                    className="border-stone-200 pl-9 dark:border-stone-700"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'signin' ? 'Sign in' : 'Create account & sign in'}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-stone-400">secure · encrypted passwords</span>
              <Separator className="flex-1" />
            </div>
            <p className="text-center text-xs leading-relaxed text-stone-400">
              Conversations are stored privately in your account. Passwords are hashed with bcrypt and never stored in
              plaintext.
            </p>
          </div>
        </motion.section>
      </div>

      <footer className="border-t border-stone-200 py-4 text-center text-xs text-stone-400 dark:border-stone-800">
        Auralis · original open architecture · Next.js · FastAPI · Turso · deployed anywhere
      </footer>
    </div>
  )
}

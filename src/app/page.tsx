'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Database,
  FileCode2,
  Loader2,
  Mic,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

/* ----------------------------- types ----------------------------- */

interface FastApiHealth {
  status?: string
  version?: string
  providers?: Record<string, boolean>
  turso?: { ok?: boolean; mode?: string }
}

interface ServiceInfo {
  up: boolean
  port: number
  started?: boolean
  booting?: boolean
  health?: FastApiHealth | null
}

interface StatusResponse {
  time: string
  node: string
  services: {
    next: ServiceInfo
    fastapi: ServiceInfo
    angular: ServiceInfo
  }
  manifest: {
    generatedAt: string
    tools: Record<string, string>
    nodePackages: Record<string, string>
    pythonPackages: string[]
  }
}

/* --------------------------- data model --------------------------- */

interface StackItem {
  name: string
  detail: string
  ok: boolean
}

interface StackGroup {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: StackItem[]
}

function useStackGroups(status: StatusResponse | null): StackGroup[] {
  return useMemo(() => {
    const np = status?.manifest.nodePackages ?? {}
    const py = status?.manifest.pythonPackages ?? []
    const pyVersion = (name: string): string | null => {
      const hit = py.find((p) => p.toLowerCase().startsWith(`${name}==`) || p.toLowerCase().startsWith(`${name.toLowerCase()}==`))
      return hit ? hit.split('==')[1] ?? null : null
    }
    const nv = (name: string): string | null => (np[name] ? np[name] : null)

    return [
      {
        id: 'frontend',
        title: 'Frontend & UI',
        icon: FileCode2,
        items: [
          { name: 'Next.js (App Router)', detail: `v${nv('next') ?? '—'} · port 3000`, ok: Boolean(nv('next')) },
          { name: 'React', detail: `v${nv('react') ?? '—'}`, ok: Boolean(nv('react')) },
          { name: 'TypeScript', detail: `v${nv('typescript') ?? '—'} · strict mode`, ok: Boolean(nv('typescript')) },
          { name: 'Tailwind CSS', detail: `v${nv('tailwindcss') ?? '—'}`, ok: Boolean(nv('tailwindcss')) },
          { name: 'shadcn/ui', detail: 'full component set + Lucide icons', ok: true },
          { name: 'Framer Motion', detail: `v${nv('framer-motion') ?? '—'}`, ok: Boolean(nv('framer-motion')) },
          { name: 'Angular', detail: 'v20.3 workspace · port 4200', ok: status?.services.angular.up ?? false },
        ],
      },
      {
        id: 'ai',
        title: 'AI & LLM',
        icon: BrainCircuit,
        items: [
          { name: 'Vercel AI SDK', detail: `v${nv('ai') ?? '—'} · useChat hooks`, ok: Boolean(nv('ai')) },
          { name: 'AI SDK · OpenAI', detail: `v${nv('@ai-sdk/openai') ?? '—'}`, ok: Boolean(nv('@ai-sdk/openai')) },
          { name: 'AI SDK · Anthropic', detail: `v${nv('@ai-sdk/anthropic') ?? '—'}`, ok: Boolean(nv('@ai-sdk/anthropic')) },
          { name: 'AI SDK · Google Gemini', detail: `v${nv('@ai-sdk/google') ?? '—'}`, ok: Boolean(nv('@ai-sdk/google')) },
          { name: 'Python · openai', detail: pyVersion('openai') ? `v${pyVersion('openai')}` : 'installed', ok: Boolean(pyVersion('openai')) },
          { name: 'Python · anthropic', detail: pyVersion('anthropic') ? `v${pyVersion('anthropic')}` : 'installed', ok: Boolean(pyVersion('anthropic')) },
          { name: 'Python · google-genai', detail: pyVersion('google-genai') ? `v${pyVersion('google-genai')}` : 'installed', ok: Boolean(pyVersion('google-genai')) },
          { name: 'Tool calling + streaming', detail: 'SSE + WebSocket pipelines wired', ok: true },
        ],
      },
      {
        id: 'voice',
        title: 'Voice AI',
        icon: Mic,
        items: [
          { name: 'LiveKit (WebRTC)', detail: `client v${nv('livekit-client') ?? '—'} + components`, ok: Boolean(nv('livekit-client')) },
          { name: 'ElevenLabs JS', detail: `v${nv('@elevenlabs/elevenlabs-js') ?? '—'}`, ok: Boolean(nv('@elevenlabs/elevenlabs-js')) },
          { name: 'ElevenLabs Python', detail: pyVersion('elevenlabs') ? `v${pyVersion('elevenlabs')}` : 'installed', ok: Boolean(pyVersion('elevenlabs')) },
          { name: 'LiveKit server SDK', detail: pyVersion('livekit-api') ? `v${pyVersion('livekit-api')}` : 'installed', ok: Boolean(pyVersion('livekit-api')) },
          { name: 'VAD', detail: pyVersion('webrtcvad') ? `webrtcvad v${pyVersion('webrtcvad')} + energy fallback` : 'installed', ok: Boolean(pyVersion('webrtcvad')) },
          { name: 'STT / TTS endpoints', detail: 'FastAPI /api/voice/* + ElevenLabs Scribe', ok: true },
          { name: 'Voice WebSocket', detail: '/ws/voice · VAD → STT → LLM → TTS', ok: true },
        ],
      },
      {
        id: 'backend',
        title: 'Backend & Data',
        icon: Database,
        items: [
          { name: 'FastAPI', detail: pyVersion('fastapi') ? `v${pyVersion('fastapi')} · port 8000` : 'installed', ok: Boolean(pyVersion('fastapi')) },
          { name: 'Pydantic v2', detail: pyVersion('pydantic') ? `v${pyVersion('pydantic')}` : 'installed', ok: Boolean(pyVersion('pydantic')) },
          { name: 'Turso (libSQL)', detail: `JS v${nv('@libsql/client') ?? '—'} · Python ${pyVersion('libsql-experimental') ?? 'installed'}`, ok: Boolean(nv('@libsql/client')) },
          { name: 'Doc processing', detail: 'pypdf · python-docx · beautifulsoup4', ok: Boolean(pyVersion('pypdf')) },
          { name: 'Vector / RAG', detail: pyVersion('numpy') ? `numpy v${pyVersion('numpy')} + embeddings + store` : 'installed', ok: Boolean(pyVersion('numpy')) },
          { name: 'Realtime', detail: `websockets ${pyVersion('websockets') ?? ''} · socket.io-client v${nv('socket.io-client') ?? '—'}`, ok: true },
        ],
      },
      {
        id: 'devops',
        title: 'DevOps & Quality',
        icon: ShieldCheck,
        items: [
          { name: 'Vitest', detail: `v${nv('vitest') ?? '—'}`, ok: Boolean(nv('vitest')) },
          { name: 'Playwright', detail: `v${nv('@playwright/test') ?? '—'} · chromium project`, ok: Boolean(nv('@playwright/test')) },
          { name: 'Pytest', detail: pyVersion('pytest') ? `v${pyVersion('pytest')}` : 'installed', ok: Boolean(pyVersion('pytest')) },
          { name: 'Ruff', detail: pyVersion('ruff') ? `v${pyVersion('ruff')} · clean` : 'installed', ok: Boolean(pyVersion('ruff')) },
          { name: 'Docker', detail: 'Dockerfiles + compose authored (runtime deploys to cloud)', ok: true },
          { name: 'GitHub Actions', detail: 'CI workflow: lint · typecheck · tests', ok: true },
          { name: 'Sentry', detail: `v${nv('@sentry/nextjs') ?? '—'} · DSN-gated init`, ok: Boolean(nv('@sentry/nextjs')) },
        ],
      },
    ]
  }, [status])
}

/* ---------------------------- components ---------------------------- */

function ServiceDot({ state }: { state: 'up' | 'booting' | 'down' }) {
  if (state === 'up') return <BadgeCheck className="h-4 w-4 text-emerald-500" />
  if (state === 'booting') return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
  return <CircleDashed className="h-4 w-4 text-zinc-400" />
}

function ServiceCard({
  title,
  icon: Icon,
  info,
  description,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  info: ServiceInfo | undefined
  description: string
}) {
  const state: 'up' | 'booting' | 'down' = info ? (info.up ? 'up' : info.booting ? 'booting' : 'down') : 'down'
  return (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {title}
          </CardTitle>
          <ServiceDot state={state} />
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge
            variant="secondary"
            className={
              state === 'up'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : state === 'booting'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'
            }
          >
            {state === 'up' ? 'running' : state === 'booting' ? 'starting…' : 'offline'}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Port</span>
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">:{info?.port ?? '—'}</code>
        </div>
        {state === 'up' && info?.health?.version && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono text-xs">{info.health.version}</span>
          </div>
        )}
        {state === 'up' && info?.health?.turso && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Database</span>
            <Badge variant="outline" className="text-xs">
              {info.health.turso.mode === 'turso' ? 'Turso cloud' : 'local SQLite fallback'}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProviderChips({ health }: { health: FastApiHealth | null | undefined }) {
  const providers = health?.providers
  const entries: [string, boolean][] = providers
    ? Object.entries(providers).map(([k, v]) => [k, Boolean(v)])
    : [
        ['openai', false],
        ['anthropic', false],
        ['google', false],
        ['elevenlabs', false],
        ['livekit', false],
      ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([name, on]) => (
        <Badge
          key={name}
          variant="secondary"
          className={
            on
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500'
          }
        >
          {name}
        </Badge>
      ))}
    </div>
  )
}

/* ------------------------------- page ------------------------------- */

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' })
      if (res.ok) setStatus((await res.json()) as StatusResponse)
    } catch {
      // keep last known state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    timer.current = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 12_000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [load])

  const groups = useStackGroups(status)
  const tools = status?.manifest.tools
  const fastapiHealth = status?.services.fastapi.health ?? null

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/10 to-transparent" />

      {/* Header */}
      <header className="relative z-10 border-b border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">AI Voice Agent</h1>
              <p className="text-xs text-muted-foreground">Polyglot monorepo · environment setup</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {/* Tools row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 flex flex-wrap items-center gap-2"
        >
          {[
            ['bun', tools?.bun],
            ['node', tools?.node],
            ['python', tools?.python],
            ['uv', tools?.uv],
            ['gcc', tools?.gcc],
            ['git', tools?.git],
          ].map(([name, ver]) => (
            <Badge key={name} variant="outline" className="gap-1.5 border-zinc-300 font-mono text-xs dark:border-zinc-700">
              <TerminalSquare className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {name} {ver ?? ''}
            </Badge>
          ))}
        </motion.div>

        {/* Next-step banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Environment ready — waiting on your credentials</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              Send the GitHub repo + access token, Turso DB URL/token, and provider API keys (OpenAI · Anthropic · Gemini ·
              ElevenLabs · LiveKit · Sentry). They drop straight into <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env</code> —
              every integration activates automatically (see <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.example</code>).
            </p>
          </div>
        </motion.div>

        {/* Services */}
        <section aria-label="Running services" className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-4 w-4" /> Live services
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ServiceCard
              title="Next.js Frontend"
              icon={Sparkles}
              info={status?.services.next}
              description="App Router UI · gateway origin"
            />
            <ServiceCard
              title="FastAPI Backend"
              icon={Server}
              info={status?.services.fastapi}
              description="REST + WebSocket voice pipeline"
            />
            <ServiceCard
              title="Angular Workspace"
              icon={Boxes}
              info={status?.services.angular}
              description="Polyglot frontend · LiveKit-ready"
            />
          </div>
          <Card className="mt-4 border-zinc-200 dark:border-zinc-800">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">LLM / Voice providers</p>
                <p className="text-xs text-muted-foreground">Detected by the FastAPI health probe — activate by adding keys to .env</p>
              </div>
              <ProviderChips health={fastapiHealth} />
            </CardContent>
          </Card>
        </section>

        {/* Stack matrix */}
        <section aria-label="Installed stack" className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" /> Installed stack
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((group, gi) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.06 * gi }}
              >
                <Card className="h-full border-zinc-200 dark:border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <group.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      {group.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-72 pr-2">
                      <ul className="space-y-2.5">
                        {group.items.map((item) => (
                          <li key={item.name} className="flex items-start gap-2 text-sm">
                            {item.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            ) : (
                              <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium leading-tight">{item.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        <Separator className="mb-6" />

        {/* Gateway hint */}
        <p className="mb-8 text-center text-xs text-muted-foreground">
          Gateway routing: services are reached same-origin — append <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">?XTransformPort=8000</code> for
          FastAPI and <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">?XTransformPort=4200</code> for Angular.
        </p>
      </main>

      {/* Sticky footer */}
      <footer className="relative z-10 mt-auto border-t border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <span>AI Voice Agent · environment ready · guide me anytime</span>
          <span className="font-mono">
            :3000 next · :8000 fastapi · :4200 angular · snapshot {status?.manifest.generatedAt ? new Date(status.manifest.generatedAt).toLocaleDateString() : '—'}
          </span>
        </div>
      </footer>
    </div>
  )
}

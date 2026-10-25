import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import net from 'node:net'
import { NextResponse } from 'next/server'
import manifest from '@/../../setup-status.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROOT = process.cwd()
const FASTAPI_PORT = 8000
const ANGULAR_PORT = 4200

/** Cooldown map so we never spawn-storm a slow-booting service. */
const lastAttempt = new Map<string, number>()
const COOLDOWN_MS = 8_000

function checkPort(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, '127.0.0.1')
  })
}

function spawnDetached(name: string, cmd: string, args: string[], cwd: string, logFile: string) {
  const now = Date.now()
  const last = lastAttempt.get(name) ?? 0
  if (now - last < COOLDOWN_MS) return false
  lastAttempt.set(name, now)

  try {
    const logFd = openSync(logFile, 'a')
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    })
    child.unref()
    return true
  } catch {
    return false
  }
}

async function startFastApi(): Promise<boolean> {
  return spawnDetached(
    'fastapi',
    `${ROOT}/backend/.venv/bin/python`,
    ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', String(FASTAPI_PORT)],
    `${ROOT}/backend`,
    `${ROOT}/backend/uvicorn.log`,
  )
}

async function startAngular(): Promise<boolean> {
  return spawnDetached('angular', 'bun', ['run', 'start'], `${ROOT}/angular-app`, `${ROOT}/angular-app/angular-dev.log`)
}

async function fetchFastApiHealth(): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)
    const res = await fetch(`http://127.0.0.1:${FASTAPI_PORT}/health`, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function GET() {
  // 1) Probe ports.
  const [nextUp, fastapiUpBefore, angularUp] = await Promise.all([
    checkPort(3000),
    checkPort(FASTAPI_PORT),
    checkPort(ANGULAR_PORT),
  ])

  // 2) Auto-start (idempotent, cooldown-guarded) — the persistent Next.js
  //    server supervises the side services so the whole stack stays live.
  let fastapiStarted = false
  let angularStarted = false
  if (!fastapiUpBefore) fastapiStarted = await startFastApi()
  if (!angularUp) angularStarted = await startAngular()

  // 3) Wait briefly for a freshly started FastAPI to come up.
  let fastapiUp = fastapiUpBefore
  if (!fastapiUp && fastapiStarted) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 600))
      if (await checkPort(FASTAPI_PORT)) {
        fastapiUp = true
        break
      }
    }
  }

  const health = fastapiUp ? await fetchFastApiHealth() : null

  return NextResponse.json({
    time: new Date().toISOString(),
    node: process.version,
    services: {
      next: { up: nextUp, port: 3000 },
      fastapi: {
        up: fastapiUp,
        port: FASTAPI_PORT,
        started: fastapiStarted,
        health,
      },
      angular: {
        up: angularUp,
        port: ANGULAR_PORT,
        started: angularStarted,
        // Angular takes ~15-30s on cold start; report booting state.
        booting: !angularUp && angularStarted,
      },
    },
    manifest,
  })
}

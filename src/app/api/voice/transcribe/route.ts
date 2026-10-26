import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

import { requireUserId } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_AUDIO_BYTES = 15 * 1024 * 1024

/** Cached SDK instance — saves re-initialization on every request. */
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null
function getZai() {
  zaiPromise ??= ZAI.create()
  return zaiPromise
}

async function transcribe(buffer: Buffer): Promise<string> {
  const zai = await getZai()
  const result = await zai.audio.asr.create({ file_base64: buffer.toString('base64') })
  return (result as { text?: string }).text ?? ''
}

/** POST /api/voice/transcribe — multipart audio → transcript (z.ai ASR). */
export async function POST(req: Request) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('audio')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 })
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio too large (max 15 MB)' }, { status: 413 })
    }
    // Sub-1 KB uploads are silence/noise — skip the round-trip entirely.
    if (file.size < 1024) {
      return NextResponse.json({ text: '' })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // One retry: the upstream occasionally returns transient 4xx/5xx.
    let text = ''
    try {
      text = await transcribe(buffer)
    } catch (first) {
      console.error('[voice/transcribe] attempt 1 failed:', first instanceof Error ? first.message : first)
      text = await transcribe(buffer)
    }

    return NextResponse.json({ text })
  } catch (error) {
    console.error('[voice/transcribe] failed:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Speech recognition is unavailable right now. You can type instead.' },
      { status: 502 },
    )
  }
}

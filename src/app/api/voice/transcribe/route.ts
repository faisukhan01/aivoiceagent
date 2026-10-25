import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

import { requireUserId } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_AUDIO_BYTES = 15 * 1024 * 1024

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

    const buffer = Buffer.from(await file.arrayBuffer())
    const zai = await ZAI.create()
    const result = await zai.audio.asr.create({ file_base64: buffer.toString('base64') })

    return NextResponse.json({ text: (result as { text?: string }).text ?? '' })
  } catch (error) {
    console.error('[voice/transcribe]', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Speech recognition is unavailable right now. You can type instead.' },
      { status: 502 },
    )
  }
}

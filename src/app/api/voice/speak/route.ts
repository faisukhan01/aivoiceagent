import { NextResponse } from 'next/server'
import { z } from 'zod'
import ZAI from 'z-ai-web-dev-sdk'

import { requireUserId } from '@/lib/session'
import { chunkForTts, concatWav } from '@/lib/voice/tts-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SpeakSchema = z.object({
  text: z.string().min(1).max(8000),
  voice: z.string().regex(/^[a-z]+$/).max(24).optional().default('tongtong'),
  speed: z.number().min(0.5).max(2.0).optional().default(1.0),
})

const VOICES = new Set(['tongtong', 'chuichui', 'xiaochen', 'jam', 'kazi', 'douji', 'luodo'])

/**
 * POST /api/voice/speak — text → speech audio (audio/wav).
 * Long text is chunked on sentence boundaries; PCM segments are joined under
 * a single WAV header so playback is gapless.
 */
export async function POST(req: Request) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = SpeakSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { text, voice, speed } = parsed.data
  const safeVoice = VOICES.has(voice) ? voice : 'tongtong'

  try {
    const zai = await ZAI.create()
    const chunks = chunkForTts(text)
    const parts: Buffer[] = []

    for (const chunk of chunks) {
      const response = await zai.audio.tts.create({
        input: chunk,
        voice: safeVoice,
        speed,
        response_format: 'wav',
        stream: false,
      })
      const arrayBuffer = await response.arrayBuffer()
      parts.push(Buffer.from(new Uint8Array(arrayBuffer)))
    }

    const audio = concatWav(parts)
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[voice/speak]', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Speech synthesis is unavailable right now. The transcript is still shown.' },
      { status: 502 },
    )
  }
}

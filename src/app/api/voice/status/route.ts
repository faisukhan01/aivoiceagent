import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

import { requireUserId } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const VOICE_INFO = {
  stt: { provider: 'zai-asr', formats: ['wav', 'mp3', 'webm', 'm4a'], maxBytes: 15 * 1024 * 1024 },
  tts: {
    provider: 'zai-tts',
    voices: [
      { id: 'tongtong', label: 'Tongtong — warm' },
      { id: 'xiaochen', label: 'Xiaochen — calm professional' },
      { id: 'jam', label: 'Jam — British' },
      { id: 'kazi', label: 'Kazi — clear standard' },
      { id: 'douji', label: 'Douji — natural flow' },
      { id: 'luodo', label: 'Luodo — expressive' },
      { id: 'chuichui', label: 'Chuichui — lively' },
    ],
    maxCharsPerRequest: 1024,
  },
  elevenlabs: { available: false },
  livekit: { available: Boolean(process.env.LIVEKIT_URL) },
}

/** GET /api/voice/status — capability matrix for the voice UI. */
export async function GET() {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let sttOk = false
  let ttsOk = false
  try {
    const zai = await ZAI.create()
    sttOk = typeof zai.audio?.asr?.create === 'function'
    ttsOk = typeof zai.audio?.tts?.create === 'function'
  } catch {
    // SDK unavailable — voice degraded, chat still works
  }

  return NextResponse.json({
    ready: sttOk && ttsOk,
    ...VOICE_INFO,
  })
}

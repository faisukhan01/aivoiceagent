import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/session'
import { createConversation, listConversations } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/conversations?q=... — paginated list (optionally searched) */
export async function GET(req: Request) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)

  const conversations = await listConversations(userId, q, 50, offset)
  return NextResponse.json({ conversations })
}

/** POST /api/conversations — create an empty conversation */
export async function POST() {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const conversation = await createConversation(userId)
  return NextResponse.json({ conversation }, { status: 201 })
}

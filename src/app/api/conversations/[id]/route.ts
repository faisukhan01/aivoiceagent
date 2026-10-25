import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/session'
import { deleteConversation, getConversation, listMessages, renameConversation } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** GET — conversation metadata + messages (ownership enforced) */
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const conversation = await getConversation(id, userId)
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const messages = await listMessages(id, userId)
  return NextResponse.json({ conversation, messages })
}

const PatchSchema = z.object({ title: z.string().min(1).max(120) })

/** PATCH — rename */
export async function PATCH(req: Request, { params }: Params) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid title' }, { status: 400 })

  const conversation = await getConversation(id, userId)
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  await renameConversation(id, userId, parsed.data.title)
  return NextResponse.json({ ok: true })
}

/** DELETE — remove conversation + messages (ownership enforced) */
export async function DELETE(_req: Request, { params }: Params) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteConversation(id, userId)
  return NextResponse.json({ ok: true })
}

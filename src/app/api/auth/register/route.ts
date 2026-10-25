import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { createUser, findUserByEmail, getSettings } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = RegisterSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input. Email must be valid and password at least 8 characters.' },
        { status: 400 },
      )
    }

    const { email, password, name } = parsed.data
    const existing = await findUserByEmail(email)
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await createUser(email, name ?? null, passwordHash)
    await getSettings(user.id) // ensure settings row exists

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } }, { status: 201 })
  } catch (error) {
    console.error('[register]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'

/** Server-side session guard — returns the authenticated user id or null. */
export async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

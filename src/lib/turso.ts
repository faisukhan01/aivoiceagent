/**
 * Turso (libSQL) client singleton.
 * Falls back to a local libSQL file database when Turso env vars are absent,
 * so development works offline. Swap-in of cloud creds is zero-code.
 */
import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

export function isTursoCloud(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL)
}

export function getTursoClient(): Client {
  if (client) return client

  client = isTursoCloud()
    ? createClient({
        url: process.env.TURSO_DATABASE_URL as string,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    : createClient({ url: 'file:./db/local-turso.db' })

  return client
}

export async function tursoHealth(): Promise<{ ok: boolean; mode: 'turso-cloud' | 'local-file'; error?: string }> {
  try {
    await getTursoClient().execute('SELECT 1')
    return { ok: true, mode: isTursoCloud() ? 'turso-cloud' : 'local-file' }
  } catch (error) {
    return { ok: false, mode: isTursoCloud() ? 'turso-cloud' : 'local-file', error: String(error) }
  }
}

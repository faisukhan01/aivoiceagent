import { createClient, type Client } from '@libsql/client'

/**
 * Turso (libSQL) client — single source of truth for Auralis data.
 * Falls back to a local libSQL file when Turso env vars are absent so the
 * app always runs (dev/sandbox), while production uses the cloud replica.
 */
let client: Client | null = null
let migrationPromise: Promise<void> | null = null

export function isCloudDb(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL)
}

export function getDb(): Client {
  if (client) return client
  client = isCloudDb()
    ? createClient({
        url: process.env.TURSO_DATABASE_URL as string,
        authToken: process.env.TURSO_AUTH_TOKEN,
      })
    : createClient({ url: 'file:./db/auralis-local.db' })
  return client
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auralis_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS auralis_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auralis_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New conversation',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auralis_conversations_user ON conversations(user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS auralis_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES auralis_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES auralis_users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
    content TEXT NOT NULL,
    meta TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auralis_messages_conversation ON messages(conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS auralis_settings (
    user_id TEXT PRIMARY KEY REFERENCES auralis_users(id) ON DELETE CASCADE,
    default_model TEXT NOT NULL DEFAULT 'auralis-core',
    voice TEXT NOT NULL DEFAULT 'tongtong',
    theme TEXT NOT NULL DEFAULT 'system',
    preferences TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE TABLE IF NOT EXISTS auralis_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES auralis_users(id) ON DELETE CASCADE,
    conversation_id TEXT,
    filename TEXT NOT NULL,
    mime TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    extracted_chars INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auralis_documents_user ON documents(user_id, created_at DESC)`,
]

/** Idempotent schema migration — safe to call on every cold start. */
export function migrate(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const db = getDb()
      for (const stmt of SCHEMA) {
        await db.execute(stmt)
      }
    })().catch((error) => {
      migrationPromise = null
      throw error
    })
  }
  return migrationPromise
}

import { randomUUID } from 'node:crypto'
import type { InValue, Row } from '@libsql/client'

import { getDb, migrate } from './client'

/* ---------------------------------- types --------------------------------- */

export interface UserRow {
  id: string
  email: string
  name: string | null
  password_hash: string
  created_at: string
}

export interface ConversationRow {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface MessageRow {
  id: string
  conversation_id: string
  user_id: string
  role: MessageRole
  content: string
  meta: string | null
  created_at: string
}

export interface SettingsRow {
  user_id: string
  default_model: string
  voice: string
  theme: string
  preferences: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  user_id: string
  conversation_id: string | null
  filename: string
  mime: string | null
  size: number
  extracted_chars: number
  content: string
  created_at: string
}

/* ---------------------------------- users --------------------------------- */

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await migrate()
  const result = await getDb().execute({ sql: 'SELECT * FROM auralis_users WHERE email = ? LIMIT 1', args: [email.toLowerCase().trim()] })
  return (result.rows[0] as Row & UserRow) ?? null
}

export async function findUserById(id: string): Promise<UserRow | null> {
  await migrate()
  const result = await getDb().execute({ sql: 'SELECT * FROM auralis_users WHERE id = ? LIMIT 1', args: [id] })
  return (result.rows[0] as Row & UserRow) ?? null
}

export async function createUser(email: string, name: string | null, passwordHash: string): Promise<UserRow> {
  await migrate()
  const id = randomUUID()
  await getDb().execute({
    sql: 'INSERT INTO auralis_users (id, email, name, password_hash) VALUES (?, ?, ?, ?)',
    args: [id, email.toLowerCase().trim(), name, passwordHash],
  })
  const user = await findUserById(id)
  if (!user) throw new Error('user insert failed')
  return user
}

/* ------------------------------ conversations ----------------------------- */

export async function createConversation(userId: string, title = 'New conversation'): Promise<ConversationRow> {
  await migrate()
  const id = randomUUID()
  await getDb().execute({
    sql: 'INSERT INTO auralis_conversations (id, user_id, title) VALUES (?, ?, ?)',
    args: [id, userId, title],
  })
  return (await getConversation(id, userId))!
}

export async function getConversation(id: string, userId: string): Promise<ConversationRow | null> {
  await migrate()
  const result = await getDb().execute({
    sql: 'SELECT * FROM auralis_conversations WHERE id = ? AND user_id = ? LIMIT 1',
    args: [id, userId],
  })
  return (result.rows[0] as Row & ConversationRow) ?? null
}

export async function listConversations(userId: string, search = '', limit = 50, offset = 0): Promise<ConversationRow[]> {
  await migrate()
  const pattern = `%${search.trim()}%`
  const result = search.trim()
    ? await getDb().execute({
        sql: `SELECT c.* FROM auralis_conversations c
              WHERE c.user_id = ? AND c.title LIKE ?
              ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
        args: [userId, pattern, limit, offset],
      })
    : await getDb().execute({
        sql: 'SELECT * FROM auralis_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
        args: [userId, limit, offset],
      })
  return result.rows as unknown as ConversationRow[]
}

export async function renameConversation(id: string, userId: string, title: string): Promise<void> {
  await migrate()
  await getDb().execute({
    sql: "UPDATE auralis_conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?",
    args: [title.slice(0, 120), id, userId],
  })
}

export async function touchConversation(id: string, userId: string): Promise<void> {
  await migrate()
  await getDb().execute({
    sql: "UPDATE auralis_conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?",
    args: [id, userId],
  })
}

export async function deleteConversation(id: string, userId: string): Promise<void> {
  await migrate()
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM auralis_messages WHERE conversation_id = ? AND user_id = ?', args: [id, userId] })
  await db.execute({ sql: 'DELETE FROM auralis_conversations WHERE id = ? AND user_id = ?', args: [id, userId] })
}

/* --------------------------------- messages -------------------------------- */

export async function insertMessage(
  conversationId: string,
  userId: string,
  role: MessageRole,
  content: string,
  meta?: unknown,
): Promise<MessageRow> {
  await migrate()
  const id = randomUUID()
  await getDb().execute({
    sql: 'INSERT INTO auralis_messages (id, conversation_id, user_id, role, content, meta) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, conversationId, userId, role, content, meta ? JSON.stringify(meta) : null],
  })
  const result = await getDb().execute({ sql: 'SELECT * FROM auralis_messages WHERE id = ? LIMIT 1', args: [id] })
  return result.rows[0] as unknown as MessageRow
}

export async function listMessages(conversationId: string, userId: string, limit = 200): Promise<MessageRow[]> {
  await migrate()
  const result = await getDb().execute({
    sql: `SELECT m.* FROM auralis_messages m
          JOIN auralis_conversations c ON c.id = m.conversation_id
          WHERE m.conversation_id = ? AND m.user_id = ?
          ORDER BY m.created_at ASC LIMIT ?`,
    args: [conversationId, userId, limit],
  })
  return result.rows as unknown as MessageRow[]
}

export async function updateMessageContent(id: string, userId: string, content: string, meta?: unknown): Promise<void> {
  await migrate()
  await getDb().execute({
    sql: 'UPDATE auralis_messages SET content = ?, meta = ? WHERE id = ? AND user_id = ?',
    args: [content, meta ? JSON.stringify(meta) : null, id, userId],
  })
}

/* --------------------------------- settings -------------------------------- */

export async function getSettings(userId: string): Promise<SettingsRow> {
  await migrate()
  const result = await getDb().execute({ sql: 'SELECT * FROM auralis_settings WHERE user_id = ? LIMIT 1', args: [userId] })
  if (result.rows[0]) return result.rows[0] as unknown as SettingsRow
  await getDb().execute({ sql: 'INSERT OR IGNORE INTO auralis_settings (user_id) VALUES (?)', args: [userId] })
  const created = await getDb().execute({ sql: 'SELECT * FROM auralis_settings WHERE user_id = ? LIMIT 1', args: [userId] })
  return created.rows[0] as unknown as SettingsRow
}

export async function updateSettings(userId: string, patch: Partial<Pick<SettingsRow, 'default_model' | 'voice' | 'theme' | 'preferences'>>): Promise<SettingsRow> {
  await getSettings(userId)
  const current = await getSettings(userId)
  const next = {
    default_model: patch.default_model ?? current.default_model,
    voice: patch.voice ?? current.voice,
    theme: patch.theme ?? current.theme,
    preferences: patch.preferences ?? current.preferences,
  }
  await getDb().execute({
    sql: `UPDATE auralis_settings SET default_model = ?, voice = ?, theme = ?, preferences = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?`,
    args: [next.default_model, next.voice, next.theme, next.preferences, userId],
  })
  return getSettings(userId)
}

/* --------------------------------- documents ------------------------------- */

export async function insertDocument(
  userId: string,
  filename: string,
  mime: string | null,
  size: number,
  content: string,
  conversationId?: string,
): Promise<DocumentRow> {
  await migrate()
  const id = randomUUID()
  await getDb().execute({
    sql: `INSERT INTO auralis_documents (id, user_id, conversation_id, filename, mime, size, extracted_chars, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, conversationId ?? null, filename, mime, size, content.length, content.slice(0, 400_000)],
  })
  const result = await getDb().execute({ sql: 'SELECT * FROM auralis_documents WHERE id = ? LIMIT 1', args: [id] })
  return result.rows[0] as unknown as DocumentRow
}

export async function getDocument(id: string, userId: string): Promise<DocumentRow | null> {
  await migrate()
  const result = await getDb().execute({
    sql: 'SELECT * FROM auralis_documents WHERE id = ? AND user_id = ? LIMIT 1',
    args: [id, userId],
  })
  return (result.rows[0] as unknown as DocumentRow) ?? null
}

export async function listDocuments(userId: string, limit = 50): Promise<DocumentRow[]> {
  await migrate()
  const result = await getDb().execute({
    sql: 'SELECT * FROM auralis_documents WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    args: [userId, limit],
  })
  return result.rows as unknown as DocumentRow[]
}

export async function deleteDocument(id: string, userId: string): Promise<void> {
  await migrate()
  await getDb().execute({ sql: 'DELETE FROM auralis_documents WHERE id = ? AND user_id = ?', args: [id, userId] })
}

/* ------------------------------- helpers ---------------------------------- */

export function rowsToIn(values: InValue[]): InValue[] {
  return values
}

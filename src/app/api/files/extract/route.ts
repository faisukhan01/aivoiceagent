import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/session'
import { insertDocument } from '@/lib/db/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'html', 'htm'])

/**
 * POST /api/files/extract — multipart upload → extracted text stored in Turso.
 * PDF/DOCX/HTML go to the FastAPI service (pypdf/python-docx/bs4) through the
 * internal gateway; text formats are parsed in-process.
 */
export async function POST(req: Request) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file')
    const conversationId = form.get('conversationId')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })

    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported format ".${ext}". Supported: pdf, docx, txt, md, csv, json, html.` },
        { status: 415 },
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    let text = ''

    if (['txt', 'md', 'csv', 'json'].includes(ext)) {
      text = bytes.toString('utf-8')
    } else {
      const fastApiBase = process.env.FASTAPI_INTERNAL_URL ?? 'http://127.0.0.1:8000'
      const upstream = new FormData()
      upstream.append('file', new File([new Uint8Array(bytes)], file.name, { type: file.type || 'application/octet-stream' }))
      const res = await fetch(`${fastApiBase}/api/documents/fulltext`, {
        method: 'POST',
        body: upstream,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { detail?: string }
        return NextResponse.json(
          { error: detail.detail ?? 'Document parsing service is unavailable. Try a text file.' },
          { status: 502 },
        )
      }
      const data = (await res.json()) as { text?: string }
      text = data.text ?? ''
    }

    if (!text.trim()) return NextResponse.json({ error: 'No readable text found in this file.' }, { status: 422 })

    const doc = await insertDocument(
      userId,
      file.name,
      file.type || null,
      file.size,
      text,
      typeof conversationId === 'string' && conversationId.length > 0 ? conversationId : undefined,
    )
    return NextResponse.json({
      document: { id: doc.id, filename: doc.filename, size: doc.size, extracted_chars: doc.extracted_chars },
    })
  } catch (error) {
    console.error('[files/extract]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'File processing failed. Please try again.' }, { status: 500 })
  }
}

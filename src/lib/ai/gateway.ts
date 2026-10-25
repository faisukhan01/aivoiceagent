import { readFile } from 'node:fs/promises'
import type { GatewayEvent, GatewayMessage, StreamOptions } from './types'

/**
 * First-party streaming client for the OpenAI-compatible LLM gateway.
 *
 * Why not the SDK helper: it buffers the whole SSE body. Owning the fetch
 * gives true incremental token streaming, AbortController cancellation, and
 * tool-call deltas — the same contract the hosted providers (OpenAI,
 * Anthropic, Gemini) implement, so swapping providers never touches callers.
 */

interface GatewayConfig {
  baseUrl: string
  apiKey: string
  token?: string
  chatId?: string
  userId?: string
}

let cachedConfig: GatewayConfig | null = null

async function loadConfig(): Promise<GatewayConfig> {
  if (cachedConfig) return cachedConfig
  for (const path of ['.z-ai-config', `${process.env.HOME ?? '/home/z'}/.z-ai-config`, '/etc/.z-ai-config']) {
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<GatewayConfig>
      if (parsed.baseUrl && parsed.apiKey) {
        cachedConfig = {
          baseUrl: parsed.baseUrl.replace(/\/$/, ''),
          apiKey: parsed.apiKey,
          token: parsed.token,
          chatId: parsed.chatId,
          userId: parsed.userId,
        }
        return cachedConfig
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('LLM gateway configuration not found')
}

/** The gateway requires X-Token (present in the platform config) in addition to the bearer key. */
async function gatewayHeaders(): Promise<Record<string, string>> {
  const config = await loadConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  if (config.token) headers['X-Token'] = config.token
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  return headers
}

function sseLines(buffer: string): { complete: string[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  return { complete: parts, rest }
}

/** Yield provider-agnostic events from a streaming chat completion. */
export async function* streamGateway(options: StreamOptions): AsyncGenerator<GatewayEvent> {
  const res = await fetch(`${(await loadConfig()).baseUrl}/chat/completions`, {
    method: 'POST',
    headers: await gatewayHeaders(),
    body: JSON.stringify({
      messages: options.messages,
      ...(options.tools?.length ? { tools: options.tools } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.max_tokens ? { max_tokens: options.max_tokens } : {}),
      stream: true,
      thinking: { type: 'disabled' },
    }),
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    yield { type: 'error', message: `gateway ${res.status}: ${detail.slice(0, 200)}` }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason = 'stop'
  // Accumulate streamed tool-call fragments into complete calls.
  const toolAcc = new Map<number, { id: string; name: string; args: string }>()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { complete, rest } = sseLines(buffer)
      buffer = rest

      for (const line of complete) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          const calls = [...toolAcc.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)
          if (calls.length) {
            yield {
              type: 'tool_calls',
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: c.args || '{}' },
              })),
            }
          }
          yield { type: 'done', finish_reason: calls.length ? 'tool_calls' : finishReason }
          return
        }
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>
          }
          const choice = chunk.choices?.[0]
          if (choice?.finish_reason) finishReason = choice.finish_reason
          const delta = choice?.delta
          if (delta?.content) yield { type: 'delta', text: delta.content }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const existing = toolAcc.get(idx) ?? { id: tc.id ?? `call_${idx}`, name: '', args: '' }
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name += tc.function.name
              if (tc.function?.arguments) existing.args += tc.function.arguments
              toolAcc.set(idx, existing)
            }
          }
        } catch {
          // non-JSON keepalive or partial frame — skip
        }
      }
    }
    // Stream ended without [DONE] — flush accumulated tool calls if any.
    const calls = [...toolAcc.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)
    if (calls.length) {
      yield {
        type: 'tool_calls',
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.args || '{}' },
        })),
      }
    }
    yield { type: 'done', finish_reason: calls.length ? 'tool_calls' : finishReason }
  } catch (error) {
    if (options.signal?.aborted) {
      yield { type: 'done', finish_reason: 'aborted' }
      return
    }
    yield { type: 'error', message: error instanceof Error ? error.message : 'stream failed' }
  } finally {
    reader.releaseLock()
  }
}

/** One-shot (non-streaming) completion — used for titles and utilities. */
export async function completeGateway(
  messages: GatewayMessage[],
  opts: { signal?: AbortSignal; max_tokens?: number } = {},
): Promise<string> {
  const res = await fetch(`${(await loadConfig()).baseUrl}/chat/completions`, {
    method: 'POST',
    headers: await gatewayHeaders(),
    body: JSON.stringify({
      messages,
      thinking: { type: 'disabled' },
      ...(opts.max_tokens ? { max_tokens: opts.max_tokens } : {}),
    }),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`gateway ${res.status}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

import { z } from 'zod'
import ZAI from 'z-ai-web-dev-sdk'

import type { GatewayMessage, GatewayToolCall, SearchHit, ToolDefinition } from './types'

/**
 * Tool system: registry → zod-validated execution → bounded agent loop.
 *
 * Security model:
 * - every tool declares a zod schema; malformed model output is rejected
 * - per-user rate limits + per-request round caps (MAX_TOOL_ROUNDS)
 * - retrieved web/document content is untrusted: always fenced + truncated
 * - consequential external actions would sit behind a user-confirmation flag
 */

export const MAX_TOOL_ROUNDS = 3

export interface ToolContext {
  userId: string
}

export interface RegisteredTool {
  definition: ToolDefinition
  rateLimitPerMinute: number
  execute: (args: unknown, ctx: ToolContext) => Promise<string>
}

/* ------------------------------- web search ------------------------------- */

const WebSearchArgs = z.object({
  query: z.string().min(2).max(400),
  count: z.number().int().min(1).max(8).optional().default(5),
})

async function webSearch(args: unknown, ctx: ToolContext): Promise<string> {
  const parsed = WebSearchArgs.parse(args)
  const zai = await ZAI.create()
  const invoke = zai.functions.invoke as (name: string, payload: Record<string, unknown>) => Promise<unknown>
  const hits = (await invoke('web_search', {
    search_engine: 'search_std',
    query: parsed.query,
    count: parsed.count,
  })) as SearchHit[]

  if (!Array.isArray(hits) || hits.length === 0) return 'No results found.'

  // Untrusted external content: structured, truncated, and clearly attributed.
  const lines = hits.slice(0, parsed.count).map((h, i) => {
    const snippet = (h.snippet ?? '').replace(/\s+/g, ' ').slice(0, 300)
    const date = h.date ? ` (${h.date})` : ''
    return `[${i + 1}] ${h.name}${date}\n    source: ${h.url}\n    ${snippet}`
  })
  void ctx
  return lines.join('\n\n')
}

export const WEB_SEARCH_TOOL: RegisteredTool = {
  definition: {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the public web for current information. Returns ranked results with title, source URL, date, and a short excerpt. Use for news, facts that may have changed, documentation lookups, and anything beyond your training data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          count: { type: 'integer', description: 'Number of results (1-8)', minimum: 1, maximum: 8 },
        },
        required: ['query'],
      },
    },
  },
  rateLimitPerMinute: 12,
  execute: webSearch,
}

/* ------------------------------ registry ---------------------------------- */

const registry = new Map<string, RegisteredTool>([[WEB_SEARCH_TOOL.definition.function.name, WEB_SEARCH_TOOL]])

const userToolBudget = new Map<string, { minute: number; count: number }>()

function checkRate(userId: string, tool: RegisteredTool): boolean {
  const minute = Math.floor(Date.now() / 60_000)
  const entry = userToolBudget.get(`${userId}:${tool.definition.function.name}`)
  if (!entry || entry.minute !== minute) {
    userToolBudget.set(`${userId}:${tool.definition.function.name}`, { minute, count: 1 })
    return true
  }
  entry.count += 1
  return entry.count <= tool.rateLimitPerMinute
}

export function availableTools(enabled: string[] = ['web_search']): ToolDefinition[] {
  return enabled
    .map((name) => registry.get(name)?.definition)
    .filter((d): d is ToolDefinition => Boolean(d))
}

export async function executeToolCall(call: GatewayToolCall, ctx: ToolContext): Promise<string> {
  const tool = registry.get(call.function.name)
  if (!tool) return `Error: unknown tool "${call.function.name}"`
  if (!checkRate(ctx.userId, tool)) return 'Error: tool rate limit reached for this minute. Ask the user to retry shortly.'

  try {
    const args: unknown = JSON.parse(call.function.arguments || '{}')
    return await tool.execute(args, ctx)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return `Error: invalid arguments for ${call.function.name}: ${error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    }
    return `Error: ${error instanceof Error ? error.message : 'tool execution failed'}`
  }
}

/* --------------------------- agent loop helper ----------------------------- */

export interface ToolLoopResult {
  messages: GatewayMessage[]
  toolInvocations: Array<{ name: string; args: unknown }>
}

/** Executes one round of model-requested tool calls and appends role:"tool" results. */
export async function runToolRound(
  assistantToolCalls: GatewayToolCall[],
  ctx: ToolContext,
): Promise<ToolLoopResult> {
  const messages: GatewayMessage[] = []
  const toolInvocations: Array<{ name: string; args: unknown }> = []

  for (const call of assistantToolCalls) {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(call.function.arguments || '{}')
    } catch {
      parsed = null
    }
    toolInvocations.push({ name: call.function.name, args: parsed })
    const result = await executeToolCall(call, ctx)
    messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result })
  }

  return { messages, toolInvocations }
}

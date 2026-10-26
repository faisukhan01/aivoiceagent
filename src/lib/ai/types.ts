/** Wire-format contracts shared by the gateway client, tools, and API routes. */

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: GatewayToolCall[]
  tool_call_id?: string
  name?: string
}

export interface GatewayToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type GatewayEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool_calls'; tool_calls: GatewayToolCall[] }
  | { type: 'done'; finish_reason: string }
  | { type: 'error'; message: string }

export interface StreamOptions {
  messages: GatewayMessage[]
  tools?: ToolDefinition[]
  signal?: AbortSignal
  temperature?: number
  max_tokens?: number
}

export interface SearchHit {
  url: string
  name: string
  snippet: string
  host_name?: string
  date?: string
}

'use client'

/**
 * Minimal SSE-over-fetch reader for the chat stream.
 * Supports AbortSignal (stop generation) and incremental JSON frames.
 */
export async function* readSse(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new Error('No response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal?.aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith('data:')) continue
        try {
          yield JSON.parse(line.slice(5).trim()) as Record<string, unknown>
        } catch {
          // ignore malformed frame
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

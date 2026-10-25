'use client'

import { useCallback, useRef } from 'react'

import { readSse } from '@/lib/sse'
import { useStore, type UiMessage, type UiSource } from '@/lib/store'

/**
 * Chat orchestration: optimistic user message, SSE consumption, tool/source
 * surfacing, stop (AbortController → server persists partial), regenerate.
 */
export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(async (text: string) => {
    const store = useStore.getState()
    const trimmed = text.trim()
    if (!trimmed || store.streaming) return

    const tempUserId = `u-${Date.now()}`
    const tempAssistantId = `a-${Date.now()}`
    const activeId = store.activeId

    store.appendMessage({ id: tempUserId, role: 'user', content: trimmed })
    store.appendMessage({ id: tempAssistantId, role: 'assistant', content: '', pending: true })
    store.setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeId ?? undefined,
          message: trimmed,
          webSearch: store.webSearch,
          voiceMode: store.voiceMode,
          attachmentIds: store.attachments.map((a) => a.id),
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        store.updateMessage(tempAssistantId, {
          content: data.error ?? 'The request failed. Please try again.',
          pending: false,
        })
        store.setStreaming(false)
        return
      }

      let content = ''
      let sources: UiSource[] = []
      const toolActive: Array<{ name: string; args: unknown }> = []

      for await (const frame of readSse(res, controller.signal)) {
        const type = frame.type as string
        if (type === 'start') {
          if (!activeId && typeof frame.conversationId === 'string') {
            useStore.getState().setActiveId(frame.conversationId)
          }
        } else if (type === 'delta' && typeof frame.text === 'string') {
          content += frame.text
          useStore.getState().updateMessage(tempAssistantId, { content, pending: false })
        } else if (type === 'tool_round') {
          useStore.getState().updateMessage(tempAssistantId, {
            meta: { tools: [...toolActive], sources: [] },
          })
        } else if (type === 'done') {
          const meta = {
            sources: (frame.sources as UiSource[]) ?? sources,
            tools: toolActive.length ? toolActive : undefined,
            stopped: Boolean(frame.stopped),
            model: 'auralis-core',
          }
          useStore.getState().updateMessage(tempAssistantId, {
            id: typeof frame.messageId === 'string' ? frame.messageId : tempAssistantId,
            content: content || '(no response)',
            meta,
            pending: false,
          })
        } else if (type === 'title' && typeof frame.title === 'string') {
          const convoId = (frame.conversationId as string) ?? activeId
          if (convoId) {
            useStore.getState().upsertConversation({
              id: convoId,
              title: frame.title,
              updated_at: new Date().toISOString(),
            })
          }
        } else if (type === 'error' && typeof frame.message === 'string') {
          useStore.getState().updateMessage(tempAssistantId, {
            content: content + `${content ? '\n\n' : ''}⚠️ ${frame.message}`,
            pending: false,
          })
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        useStore.getState().updateMessage(tempAssistantId, {
          content: 'Connection lost. Your message was saved — try again.',
          pending: false,
        })
      }
    } finally {
      useStore.getState().setStreaming(false)
      useStore.getState().setAttachments([])
      abortRef.current = null
      void refreshConversations()
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const regenerate = useCallback(
    (messageId: string) => {
      const messages = useStore.getState().messages
      const index = messages.findIndex((m) => m.id === messageId)
      const target = messages[index]
      if (!target) return
      const source = target.role === 'assistant' ? messages[index - 1] : target
      if (source?.role === 'user') void send(source.content)
    },
    [send],
  )

  return { send, stop, regenerate }
}

export async function refreshConversations() {
  const { setConversations } = useStore.getState()
  try {
    const res = await fetch('/api/conversations', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { conversations: Array<{ id: string; title: string; updated_at: string }> }
    setConversations(data.conversations)
  } catch {
    // offline — keep current list
  }
}

export type { UiMessage }

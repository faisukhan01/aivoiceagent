'use client'

import { create } from 'zustand'

export interface UiConversation {
  id: string
  title: string
  updated_at: string
}

export interface UiSource {
  url: string
  name: string
  snippet?: string
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  meta?: {
    sources?: UiSource[]
    tools?: Array<{ name: string; args: unknown }>
    stopped?: boolean
    model?: string
  } | null
  pending?: boolean
}

export interface Attachment {
  id: string
  filename: string
  extracted_chars: number
}

interface AuralisState {
  // sidebar
  sidebarOpen: boolean
  toggleSidebar: () => void
  conversations: UiConversation[]
  setConversations: (list: UiConversation[]) => void
  upsertConversation: (c: UiConversation) => void
  removeConversation: (id: string) => void

  // active chat
  activeId: string | null
  setActiveId: (id: string | null) => void
  messages: UiMessage[]
  setMessages: (m: UiMessage[]) => void
  appendMessage: (m: UiMessage) => void
  updateMessage: (id: string, patch: Partial<UiMessage>) => void
  streaming: boolean
  setStreaming: (v: boolean) => void

  // composer prefs
  webSearch: boolean
  toggleWebSearch: () => void
  attachments: Attachment[]
  setAttachments: (a: Attachment[]) => void
  addAttachment: (a: Attachment) => void

  // voice
  voiceMode: boolean
  setVoiceMode: (v: boolean) => void
  voice: string
  setVoice: (v: string) => void

  // settings dialog
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
}

export const useStore = create<AuralisState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  conversations: [],
  setConversations: (list) => set({ conversations: list }),
  upsertConversation: (c) =>
    set((s) => {
      const rest = s.conversations.filter((x) => x.id !== c.id)
      return { conversations: [c, ...rest] }
    }),
  removeConversation: (id) => set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id) })),

  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
  messages: [],
  setMessages: (m) => set({ messages: m }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateMessage: (id, patch) =>
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  streaming: false,
  setStreaming: (v) => set({ streaming: v }),

  webSearch: false,
  toggleWebSearch: () => set((s) => ({ webSearch: !s.webSearch })),
  attachments: [],
  setAttachments: (a) => set({ attachments: a }),
  addAttachment: (a) => set((s) => ({ attachments: [...s.attachments, a] })),

  voiceMode: false,
  setVoiceMode: (v) => set({ voiceMode: v }),
  voice: 'tongtong',
  setVoice: (v) => set({ voice: v }),

  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}))

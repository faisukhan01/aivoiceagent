'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { PanelLeftOpen } from 'lucide-react'

import { ChatArea } from '@/components/app/chat-area'
import { Composer } from '@/components/app/composer'
import { SettingsDialog } from '@/components/app/settings-dialog'
import { Sidebar } from '@/components/app/sidebar'
import { VoiceMode } from '@/components/app/voice-mode'
import { useChatStream } from '@/hooks/use-chat-stream'
import { useStore } from '@/lib/store'

export function Workspace({ user }: { user: { name?: string | null; email?: string | null } }) {
  const { sidebarOpen, toggleSidebar, voiceMode, setVoiceMode, settingsOpen, setSettingsOpen, streaming } = useStore()
  const { send, stop, regenerate } = useChatStream()

  return (
    <div className="flex h-dvh overflow-hidden bg-stone-50 dark:bg-stone-950">
      <Sidebar user={user} />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
          <div className="flex items-center gap-1">
            {!sidebarOpen && (
              <button
                onClick={toggleSidebar}
                aria-label="Open sidebar"
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <span className="hidden text-xs text-stone-400 sm:inline">Auralis Core · streaming</span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-700 dark:hover:text-emerald-400"
          >
            Settings
          </button>
        </header>

        <ChatArea onRegenerate={regenerate} onPrompt={(p) => void send(p)} />

        <Composer onSend={(t) => void send(t)} onStop={stop} streaming={streaming} onVoice={() => setVoiceMode(true)} />
      </main>

      <AnimatePresence>{voiceMode && <VoiceMode key="voice" onSend={(t) => void send(t)} />}</AnimatePresence>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} user={user} />
    </div>
  )
}

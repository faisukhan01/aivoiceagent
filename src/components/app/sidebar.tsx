'use client'

import { useEffect, useRef, useState } from 'react'
import { signOut } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AudioLines,
  Check,
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { refreshConversations } from '@/hooks/use-chat-stream'
import { useStore } from '@/lib/store'

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null } }) {
  const { sidebarOpen, toggleSidebar, conversations, setConversations, activeId, setActiveId, messages, setMessages, removeConversation } = useStore()
  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void refreshConversations()
  }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      const { setConversations: set } = useStore.getState()
      fetch(`/api/conversations?q=${encodeURIComponent(search)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { conversations?: typeof conversations } | null) => {
          if (d?.conversations) set(d.conversations)
        })
        .catch(() => {})
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search])

  async function openConversation(id: string) {
    setActiveId(id)
    try {
      const res = await fetch(`/api/conversations/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; meta: string | null }> }
      const mapped = (data.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        meta: m.meta ? (JSON.parse(m.meta) as never) : null,
      }))
      setMessages(mapped)
    } catch {
      // keep current view
    }
  }

  function newChat() {
    setActiveId(null)
    setMessages([])
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    removeConversation(id)
    if (activeId === id) newChat()
  }

  async function submitRename(id: string) {
    const title = renameValue.trim()
    setRenaming(null)
    if (!title) return
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const { upsertConversation } = useStore.getState()
    const existing = useStore.getState().conversations.find((c) => c.id === id)
    if (existing) upsertConversation({ ...existing, title })
  }

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleSidebar}
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ width: sidebarOpen ? 288 : 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-stone-200 bg-white lg:static dark:border-stone-800 dark:bg-stone-900 ${
          sidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div className="flex w-72 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600 text-white">
                <AudioLines className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-50">Auralis</span>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Collapse sidebar" className="h-8 w-8 text-stone-500">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* New chat */}
          <div className="px-3 pb-2">
            <Button
              onClick={newChat}
              className="w-full justify-start gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              size="sm"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New conversation
            </Button>
          </div>

          {/* Search */}
          <div className="px-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="h-8 border-stone-200 bg-stone-50 pl-8 text-sm dark:border-stone-700 dark:bg-stone-800"
              />
              {search && (
                <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Conversation list */}
          <nav aria-label="Conversations" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
            {conversations.length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-stone-400">No conversations yet — start one below.</p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group relative flex items-center rounded-lg text-sm transition-colors ${
                  activeId === c.id
                    ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-50'
                    : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-stone-800/50'
                }`}
              >
                {renaming === c.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitRename(c.id)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => void submitRename(c.id)}
                    className="mx-1 h-7 border-emerald-300 px-2 text-sm dark:border-emerald-700"
                  />
                ) : (
                  <button
                    onClick={() => void openConversation(c.id)}
                    className="flex-1 truncate px-3 py-2 text-left"
                    title={c.title}
                  >
                    {c.title}
                  </button>
                )}
                <button
                  onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                  aria-label={`Options for ${c.title}`}
                  className={`mr-1 rounded p-1 text-stone-400 opacity-0 transition-opacity hover:bg-stone-200 group-hover:opacity-100 dark:hover:bg-stone-700 ${
                    menuFor === c.id ? 'opacity-100' : ''
                  }`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuFor === c.id && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                    <div className="absolute right-2 top-9 z-50 w-36 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-800">
                      <button
                        onClick={() => {
                          setRenaming(c.id)
                          setRenameValue(c.title)
                          setMenuFor(null)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Rename
                      </button>
                      <button
                        onClick={() => {
                          void deleteConversation(c.id)
                          setMenuFor(null)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </nav>

          {/* User */}
          <div className="border-t border-stone-200 p-3 dark:border-stone-800">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600 dark:bg-stone-700 dark:text-stone-200">
                {(user.name ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{user.name ?? 'Member'}</p>
                <p className="truncate text-xs text-stone-400">{user.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                onClick={() => useStore.getState().setSettingsOpen(true)}
                className="h-8 w-8 text-stone-500"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={() => void signOut({ callbackUrl: '/' })}
                className="h-8 w-8 text-stone-500"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  )
}

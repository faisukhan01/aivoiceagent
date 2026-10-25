'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

import { Landing } from '@/components/app/landing'
import { Workspace } from '@/components/app/workspace'
import { refreshConversations } from '@/hooks/use-chat-stream'
import { useStore } from '@/lib/store'

export default function Home() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (session?.user) void refreshConversations()
  }, [session?.user])

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      {session?.user ? (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Workspace user={session.user} />
        </motion.div>
      ) : (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Landing />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

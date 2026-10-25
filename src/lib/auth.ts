import type { NextAuthOptions } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

import { findUserByEmail } from '@/lib/db/queries'

/**
 * Authentication: NextAuth v4 with the credentials provider.
 * - Passwords: bcrypt (cost 12) — never stored or logged in plaintext.
 * - Sessions: signed JWT cookies (stateless), httpOnly + same-site.
 * - User records live in Turso via the data layer.
 */
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 3600 },
  pages: { signIn: '/' },
  providers: [
    Credentials({
      name: 'Email & password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim()
        const password = credentials?.password
        if (!email || !password || password.length < 8) return null

        const user = await findUserByEmail(email)
        if (!user) return null

        const valid = await bcrypt.compare(password, user.password_hash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name ?? user.email.split('@')[0] }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.name = user.name ?? undefined
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string
      }
      return session
    },
  },
}

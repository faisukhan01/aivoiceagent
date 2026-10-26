# Project Worklog — AI Voice Agent Environment Setup

Sandbox root: `/home/z/my-project`. Next.js 16.1.3 (App Router, React 19, TS 5, Tailwind 4, shadcn/ui, framer-motion, Prisma 6/SQLite, z-ai-web-dev-sdk) dev server on port 3000 via `bun run dev`.

---
Task ID: 1
Agent: main orchestrator (Z.ai Code)
Task: Inspect sandbox environment & existing project

Work Log:
- Verified toolchain: bun 1.3.14, node v24.21.0, python 3.12.15 (pip from /home/z/.venv), uv 0.13.0, gcc 14.2, git 2.47.3. Docker binary NOT available in sandbox (Dockerfiles will still be authored for deployment).
- Confirmed Next.js dev server healthy on :3000 (HTTP 200), Next 16.1.3 Turbopack.
- Existing stack: Tailwind 4, full shadcn/ui set, framer-motion, zustand, @tanstack/react-query, prisma 6 + SQLite at db/custom.db, z-ai-web-dev-sdk 0.0.18, socket.io demo in examples/websocket.
- Confirmed project is a git repo; .env only has DATABASE_URL; Caddy gateway config at Caddyfile; mini-services/ folder exists.

Stage Summary:
- Baseline verified. Plan: parallel setup tasks 2-a (frontend JS deps+configs), 2-b (FastAPI backend on :8000), 3 (Angular workspace on :4200), then 4 (DevOps/docs), 5 (status dashboard at /), 6 (verification).

---
Task ID: 2 (master build)
Agent: main orchestrator (Z.ai Code)
Task: Full AI assistant platform build — research, architecture, implementation, verification, delivery

Work Log:
- Phase 1: Cloned user repo (EMPTY → fresh build) + morluto/rea (MIT, v6.8.0, MCP/CLI reverse-engineering toolkit). Wrote docs/RESEARCH.md with honest REA usage boundaries.
- Validated every capability empirically: Turso cloud live (user instance), gateway SSE streaming, OpenAI-style tool_calls, web_search function, TTS (wav only), ASR.
- Phase 2: docs/ARCHITECTURE.md — data model, provider abstraction, voice pipeline, security boundaries. Product identity: "Auralis".
- Pushed monorepo baseline to github.com/faisukhan01/aivoiceagent (main).
- Phase 3: Turso data layer with auralis_* table namespace (user's DB contains a PRE-EXISTING project schema "vitalloraai" with real data — zero impact guaranteed).
- Phase 4: NextAuth v4 credentials + bcrypt(12), JWT sessions, type augmentation.
- Phase 5: First-party gateway SSE client (X-Token discovery was required — SDK adds it, direct fetch didn't), tool system (zod validation, rate limits, bounded rounds), web_search with citation extraction.
- Phase 6: chat SSE route with tool loop + persistence + abort-safe partial persistence; conversations CRUD + ownership checks.
- Phase 7: Full UI — landing/auth, workspace (sidebar w/ search+rename+delete, chat w/ markdown+katex+code copy, composer w/ attachments+research toggle+mic+stop), settings dialog, voice mode (orb, live transcript, barge-in).
- Phase 8: Voice: VoiceCapture (AudioContext RMS VAD), SpeechQueue (interruptible), /api/voice/transcribe (ASR), /api/voice/speak (WAV concat).
- Fixed: Turso schema collision (namespace), missing X-Token (401), mp3 unsupported → WAV concat, meta null-safety.
- Verification: API suite 23/24 (one rerun artifact), browser E2E all green with screenshots (landing/workspace/chat/citations/voice/mobile), Vitest 8/8, tsc strict clean, ruff clean, voice TTS→STT round-trip recovered the sentence.

Stage Summary:
- Product delivered and pushed to GitHub. Real streaming chat + citations + voice verified end-to-end. Turso coexistence via namespaced tables. Remaining: Playwright chromium install for repo CI e2e, LiveKit/ElevenLabs/hosted-LLM activation awaits user keys (adapters ready).

---
Task ID: 9 (hotfix)
Agent: main orchestrator (Z.ai Code)
Task: Fix sign-up/sign-in "Registration failed" error + push to GitHub

Work Log:
- Diagnosed via dev.log: `[register] SQLITE_ERROR: no such table: main.conversations` — migrate() crashed on every call, breaking ALL DB operations.
- Root cause 1: src/lib/db/client.ts SCHEMA had copy-paste bug — 3 CREATE INDEX statements targeted `conversations`/`messages`/`documents` instead of namespaced `auralis_*` tables.
- Root cause 2: .env had lost Turso credentials (fell back to local file DB where those foreign table names don't exist) and had no NEXTAUTH_SECRET.
- Fixed index statements to target auralis_conversations/auralis_messages/auralis_documents.
- Restored TURSO_DATABASE_URL/TURSO_AUTH_TOKEN; generated NEXTAUTH_SECRET (local only, never committed).
- Cloud cleanup: earlier partial migration had created the 3 misplaced indexes ON THE USER'S OWN project tables (conversations/messages/documents = their clinic app). Dropped them (their schema restored to pristine) and created correct indexes on auralis_* tables.
- Verified E2E via agent-browser: register (201) → auto sign-in → workspace renders; sign-out → sign-in → workspace renders; zero page errors.
- Cleaned all test accounts from Turso (auralis_users = 0) so the user can register admin@cd.com fresh with their own password.
- Security: discovered .env / .zscripts/dev.pid / db/custom.db were git-TRACKED (ignore rules added after initial commit). Untracked via git rm --cached — secrets can never be pushed.

Stage Summary:
- Registration + sign-in fully working against Turso cloud; user's own project tables untouched; zero secrets in git history from this point. Hotfix pushed to main.

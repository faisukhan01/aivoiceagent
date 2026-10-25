# Auralis — Architecture

> **Auralis** · the AI assistant that listens. General-purpose text + voice AI
> platform. Original product identity; leading assistants used only as
> functional references.

## 1. System overview

```
┌────────────────────────────── Browser ──────────────────────────────┐
│  Next.js 16 App Router (React 19, TS strict, Tailwind 4, shadcn/ui, │
│  Framer Motion)  ·  /  = landing + auth + full workspace            │
│  voice: MediaRecorder + AudioContext VAD + playback queue           │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ HTTPS (same-origin)          │ same-origin gateway
               ▼                              ▼
┌──────────────────────────────┐   ┌───────────────────────────────┐
│  Next.js server (port 3000)  │   │  FastAPI backend (port 8000)  │
│  · /api/auth/*  NextAuth v4  │   │  · /api/documents/extract     │
│  · /api/chat     SSE stream  │   │    pdf/docx/html → text       │
│  · /api/voice/*  ASR + TTS   │   │  · /ws/voice  VAD pipeline    │
│  · /api/conversations CRUD   │   │  (voice orchestration home)   │
│  · /api/files/*  upload      │   └───────────────────────────────┘
│  · provider abstraction      │
└──────┬───────────────┬───────┘
       │               │
       ▼               ▼
┌──────────────┐  ┌─────────────────────────────────────────────┐
│ Turso (libSQL)│ │ AI providers (server-side only, keys in env)│
│ users, convos │ │ · z-ai gateway (default, streaming + tools) │
│ messages,     │ │ · OpenAI / Anthropic / Google (AI SDK)      │
│ settings, docs│ │ · ElevenLabs (voice, adapter ready)         │
└──────────────┘  │ · LiveKit WebRTC (adapter ready)             │
                  └─────────────────────────────────────────────┘
```

## 2. Data model (Turso / libSQL — SQLite-compatible)

```sql
users        (id TEXT PK, email TEXT UNIQUE NOT NULL, name TEXT,
              password_hash TEXT NOT NULL, created_at TEXT DEFAULT now)
sessions     — not needed: NextAuth JWT strategy (stateless, signed cookie)
conversations(id TEXT PK, user_id TEXT NOT NULL REFERENCES users(id),
              title TEXT NOT NULL DEFAULT 'New conversation',
              created_at TEXT, updated_at TEXT)            -- idx: user_id, updated_at
messages     (id TEXT PK, conversation_id TEXT NOT NULL REFERENCES conversations(id),
              role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
              content TEXT NOT NULL, meta TEXT,            -- JSON: tool calls, citations, model
              created_at TEXT)                             -- idx: conversation_id, created_at
settings     (user_id TEXT PK, default_model TEXT, voice TEXT, theme TEXT,
              preferences TEXT, updated_at TEXT)
documents    (id TEXT PK, user_id TEXT, conversation_id TEXT, filename TEXT,
              mime TEXT, size INTEGER, extracted_chars INTEGER, content TEXT,
              created_at TEXT)
```

Migrations are idempotent `CREATE TABLE IF NOT EXISTS` applied on first data
access (see `src/lib/db/migrate.ts`). All access goes through typed query
modules in `src/lib/db/` — no raw SQL in route handlers.

## 3. Provider abstraction

```
src/lib/ai/
├── gateway.ts     # first-party SSE client for the default gateway
│                  # streamChat(): AsyncGenerator<GatewayEvent>, AbortSignal
├── providers.ts   # registry: zai (default) + openai/anthropic/google (AI SDK)
├── tools.ts       # tool registry + zod validation + execution loop + limits
└── types.ts       # ChatMessage, StreamEvent, ToolCall contracts
```

- **Contract** mirrors the OpenAI wire format (messages, tools, deltas) so any
  provider slots in without touching UI code.
- **Streaming**: `ReadableStream` → incremental SSE decode → `data:` frames →
  `delta` events → client `EventSource`-style reader. Cancellation = client
  aborts fetch → server `AbortSignal` → gateway request aborted → partial
  assistant message persisted with `meta.stopped = true`.
- **Tools**: `web_search` (validated query, result cap, per-user rate limit).
  Tool calls are executed server-side in a bounded loop (max 3 rounds),
  results fed back as `role:"tool"` messages; final answer cites sources.
  Consequential external actions would require user confirmation (design
  reserved in the registry).

## 4. Voice pipeline (works today, no media server)

```
 ┌─ input ─────────────────────────────────────────────────────────┐
 │ mic → AudioContext analyser (RMS VAD, 200ms frames)             │
 │   speech start → MediaRecorder starts (webm/opus)               │
 │   silence 900ms → recorder stops → blob → base64                │
 │ POST /api/voice/transcribe → zai.audio.asr → text               │
 └─────────────────────────────────────────────────────────────────┘
 ┌─ brain ─────────────────────────────────────────────────────────┐
 │ /api/chat (same stream as text chat, voice-optimized system     │
 │ prompt: short spoken-style sentences)                           │
 └─────────────────────────────────────────────────────────────────┘
 ┌─ output ────────────────────────────────────────────────────────┐
 │ sentence boundary detector streams chunks →                     │
 │ POST /api/voice/speak {text≤1024, voice} → audio/mpeg           │
 │ playback queue (sequential <audio>) — interruption: user speech │
 │ or Stop → clear queue + abort fetch + resume listening          │
 └─────────────────────────────────────────────────────────────────┘
```

- **Turn detection**: client-side energy VAD (works everywhere; server-side
  webrtcvad exists in FastAPI for future server-loop mode).
- **Interruption (barge-in)**: while speaking, VAD stays armed; detected
  speech >250ms cancels TTS queue and the in-flight chat request, then starts
  a new turn.
- **Degradation**: if TTS/ASR fail, voice mode falls back to text with a
  clear status; the chat always works.
- **Future phone/programmatic agents**: the same three stages map to
  LiveKit room tracks (publish mic track, subscribe agent track) — the
  `src/lib/voice/livekit.ts` adapter + FastAPI `/ws/voice` orchestration
  socket are the seam. ElevenLabs swap-in is a provider flag.

## 5. Security boundaries

| Threat | Control |
| --- | --- |
| Credential theft | bcrypt (cost 12) hashes; secrets only in env; no keys ever serialized to client |
| Session forgery | NextAuth JWT with `NEXTAUTH_SECRET`, httpOnly/same-site cookies |
| IDOR | every conversations/messages/documents query filters by `user_id` from session — enforced in the data layer, not per-route |
| Prompt injection via docs/web | retrieved content is wrapped in fenced, quoted context blocks with an instruction firewall in the system prompt; tool results truncated |
| Injection/XSS | react-markdown (no raw HTML), syntax-highlighted code escaped, strict TS, zod validation on every route |
| Abuse | per-user rate limits on chat/voice/files; request size caps; tool round caps |
| Input size | upload ≤ 10 MB, audio ≤ 15 MB, text ≤ 32 KB per message |

## 6. Performance budget (targets, measured during verification)

- TTFT (text chat): ≤ 1.2 s typical, first delta rendered immediately.
- Voice round-trip: capture-stop → transcript ≤ 1.5 s; sentence → audio start
  ≤ 2.0 s (network-bound).
- Streaming UI: message virtualization not needed at current scope;
  conversation list paginated (LIMIT/OFFSET, 50/page).

## 7. Repository layout (monorepo)

```
src/app/            Next.js app (the product) + API routes
src/components/     UI: landing, workspace, chat, voice, settings (shadcn/ui base)
src/lib/db/         Turso data layer + migrations
src/lib/ai/         gateway, providers, tools
src/lib/voice/      capture (VAD), playback, livekit adapter
backend/            FastAPI service (docs/voice orchestration), pytest + ruff
angular-app/        Angular 20 workspace (secondary frontend shell)
docs/               RESEARCH, ARCHITECTURE, API notes
```

## 8. Deferred / activated-by-credentials (documented honestly)

| Feature | Blocker | Activation |
| --- | --- | --- |
| LiveKit WebRTC transport | LiveKit server URL/keys | set `LIVEKIT_*` env → voice mode switches transport |
| ElevenLabs voices | API key | set `ELEVENLABS_API_KEY` → TTS provider flag |
| OpenAI/Anthropic/Gemini direct | API keys | set provider keys → selectable in model menu |
| Sentry | DSN | DSN-gated init already wired |
| Phone (PSTN) agents | LiveKit SIP + telephony account | out of scope this phase |

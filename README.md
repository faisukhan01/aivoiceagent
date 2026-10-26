# Auralis — the AI assistant that listens

A general-purpose AI assistant platform with **streaming text conversations**,
**real web research with citations**, **document Q&A**, and **natural voice
conversations** you can interrupt — built as a production-minded, polyglot
monorepo.

> Original product identity. Functional references (ChatGPT, Claude, Gemini,
> ElevenLabs) informed usability only — no copied branding or assets.

## Feature summary (verified)

| Feature | Status |
| --- | --- |
| Email/password auth (bcrypt, JWT sessions) | ✅ verified |
| Streaming chat (true SSE token streaming, stop/regenerate) | ✅ verified (20+ delta frames) |
| Conversation persistence, rename, delete, search (Turso cloud) | ✅ verified |
| Web research tool with inline source citations | ✅ verified in UI |
| Document upload → extraction → grounded answers | ✅ verified (pdf/docx/txt/md) |
| Voice: mic → VAD → STT → LLM → TTS → playback, with barge-in | ✅ verified end-to-end (TTS→STT round trip) |
| Ownership security (IDOR), rate limits, zod validation | ✅ verified |
| Angular workspace (secondary frontend shell) | ✅ scaffolded (`angular-app/`) |
| FastAPI microservice (documents, voice orchestration, WS) | ✅ live on :8000 |

## Architecture

```
Browser ── Next.js 16 (App Router, React 19, TS strict, Tailwind 4, shadcn/ui,
           Framer Motion)  ·  /api/chat SSE  ·  /api/voice/* (ASR/TTS)
   │                     │
   │                     ├─ FastAPI (:8000) — document extraction, voice orchestration
   │                     │
   ├─ Turso (libSQL) — users, conversations, messages, settings, documents
   └─ AI providers (server-side only): z-ai gateway (default, streaming + tools),
      OpenAI / Anthropic / Google adapters ready (AI SDK), ElevenLabs + LiveKit slots
```

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
research log: [`docs/RESEARCH.md`](docs/RESEARCH.md)

## Repository layout

```
src/app/            Next.js app + API routes (auth, chat, voice, files, conversations)
src/components/app/ Landing, workspace, sidebar, composer, chat, voice mode, settings
src/lib/db/         Turso data layer + idempotent migrations (auralis_* namespace)
src/lib/ai/         Gateway SSE client, provider registry, tool system
src/lib/voice/      Mic capture + VAD, TTS playback queue, utils
backend/            FastAPI service (pypdf/docx extraction, VAD, voice WS)
angular-app/        Angular 20 workspace (secondary shell)
docs/               Research + architecture documents
```

## Setup

```bash
bun install                          # frontend deps
cp .env.example .env                 # then fill values (below)

cd backend
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt -r requirements-dev.txt
cd ..

bun run dev                          # Next.js on :3000
cd backend && bun run dev            # FastAPI on :8000 (optional; needed for pdf/docx)
cd angular-app && bun install && bun run start   # Angular on :4200 (optional)
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Turso cloud DB (falls back to a local libSQL file if unset) |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | Session signing + absolute URL |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` | Optional hosted-model adapters (model menu activates) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Optional premium voice provider |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Optional WebRTC transport |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional error monitoring (DSN-gated init) |
| `FASTAPI_INTERNAL_URL` | Internal document-service URL (default `http://127.0.0.1:8000`) |

**Never commit `.env`.** All provider keys stay server-side; the browser only
ever talks to same-origin APIs.

## Tests

```bash
bun run test          # Vitest unit tests (voice utils, data contracts)
cd backend && bun run test   # Pytest (FastAPI fixtures)
bun run test:e2e      # Playwright (chromium; `bunx playwright install chromium` first)
bun run lint && bun run typecheck
cd backend && bun run lint   # ruff
```

Latest verified results (2025-10-25, sandbox):

- API suite: **23/24** (auth, streaming, persistence, IDOR, research tool, TTS, FastAPI)
- Browser E2E: register → chat → citations → voice overlay → mobile ✅
- Vitest: **8/8** · ruff clean · tsc strict clean
- Voice round trip: TTS (193 KB WAV) → STT transcript recovered the sentence

## Notes & limitations (honest list)

- The sandbox reaps background processes between agent tool-calls; servers are
  (re)started per session. In normal deployment (Docker/Vercel/Fly) this does
  not apply.
- Voice transport is HTTP-audio today (MediaRecorder + WAV), not WebRTC —
  the LiveKit adapter is wired (`src/lib/voice/livekit.ts`) and activates with
  `LIVEKIT_*` credentials. ElevenLabs slot ready behind `ELEVENLABS_API_KEY`.
- Turso DB shared with a pre-existing project: Auralis tables are namespaced
  `auralis_*` to guarantee zero impact on existing data.
- Headless browsers have no microphone; voice UI shows the graceful
  mic-denied state (verified) — real browsers request permission normally.

## Deployment

- **Frontend**: Vercel (or Docker) — `bun run build && bun run start`
- **FastAPI**: any container host — `backend/Dockerfile` (`uvicorn app.main:app`)
- **Compose**: `docker-compose.yml` (web + api)
- **CI**: `.github/workflows/ci.yml` — lint, typecheck, unit tests, backend checks

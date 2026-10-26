# Technical Research — Auralis AI Assistant Platform

Date: 2025-10-25 · Status: foundational research for Phase 1/2 of the build

## 1. Repository inspection

### 1.1 Target product repository (`faisukhan01/aivoiceagent`)
Cloned with the supplied access token. **The repository is empty** (no commits, no
branches). Consequences:

- We design the product identity, architecture, and codebase from scratch in the
  sandbox monorepo and push it to `main` on the target remote.
- The sandbox already contains a verified environment scaffold (Next.js 16,
  FastAPI backend, Angular workspace, Turso client, tooling). That scaffold is
  the starting point, not a constraint.

### 1.2 REA — `morluto/rea` ("Reverse Engineer Anything")

Verified facts (from repository at clone date, MIT license):

| Property | Finding |
| --- | --- |
| What it is | One MCP server + CLI (`rea-agents` npm, v6.8.0) exposing reverse-engineering tools for native binaries, JavaScript/Electron apps, .NET assemblies, Android/APKs, and websites |
| License | MIT (permissive; attribution preserved in `THIRD_PARTY_NOTICES.md`) |
| Analysis engines | Optional Hopper / Ghidra / IDA for native code; static JS/ASAR analysis needs no native engine; browser-observation module for websites |
| Maturity signals | Multi-language docs, changelog, security policy, CI, third-party notices — actively maintained |
| Installation | `npx rea-agents setup` registers an MCP server with coding agents |

**How REA is used on this project** — as a *research instrument under permitted
analysis*, per the brief:

1. **Interaction research**: REA's browser-observation tools can record how a
   permitted target app implements a UX flow (e.g., streaming transcript
   rendering in a voice product), producing evidence (timings, DOM/network
   traces) that informs our original implementation.
2. **Own-stack introspection**: the same tools profile *our* own bundles and
   runtime behavior during development (chunk analysis, runtime tracing) — a
   legitimate self-reverse-engineering use.
3. **Boundary (explicitly honored)**: REA does not "reproduce any software".
   We do not decompile, copy, or imitate protected assets/branding of any
   proprietary product. All Auralis interfaces are original implementations;
   competitor products (ChatGPT/Claude/Gemini/ElevenLabs) are used only as
   *functional usability references*.

In this sandbox REA is not installed (native analysis engines are out of scope
for the runtime); the integration path is documented above for the team's
research workstations.

## 2. Provider and capability research (validated empirically in-sandbox)

| Capability | Candidate | Verified result |
| --- | --- | --- |
| LLM (streaming) | z-ai gateway (OpenAI-compatible `/v1/chat/completions`) | ✅ works; SDK helper buffers SSE, so Auralis calls the gateway directly with `stream: true` and parses SSE incrementally → true token streaming + `AbortController` cancellation |
| Tool calling | same gateway | ✅ OpenAI-style `tools` param returns well-formed `tool_calls` with JSON arguments (validated with a weather-tool probe) |
| Web search | `zai.functions.invoke("web_search", {query, num})` | ✅ available; wrapped as a validated, rate-limited tool |
| STT | `zai.audio.asr.create({file_base64})` | ✅ available (WAV/MP3/M4A); used for the browser voice pipeline |
| TTS | `zai.audio.tts.create({input, voice, speed, response_format})` | ✅ available; 1024-char chunks; mp3/wav non-streaming, pcm streaming — chunker implemented |
| Voice transport | LiveKit (WebRTC SFU) | ✅ `livekit-client` + server SDK installed; requires a LiveKit server + keys → *config path ready, activation deferred* (documented limitation) |
| Premium voice | ElevenLabs (JS + Python SDK installed) | adapter interface ready; activates with `ELEVENLABS_API_KEY` |
| Database | Turso (libSQL) | ✅ **live connection verified against the owner's instance** (`vitalloraai-…turso.io`), writes + reads confirmed |
| Auth | NextAuth v4 (credentials + JWT sessions, bcryptjs) | established library; avoids hand-rolled crypto |
| Doc processing | FastAPI + pypdf/python-docx/bs4 (Python backend, port 8000) | ✅ scaffold verified; reached same-origin via gateway (`?XTransformPort=8000`) |

## 3. Design choices driven by this research

1. **Own the SSE stream** — the AI SDK's provider packages are wired for the
   hosted providers (OpenAI/Anthropic/Gemini adapters are installed and
   activate with keys), but the sandbox's available gateway streams raw SSE;
   a first-party parser gives cancellation, backpressure-safe piping, and
   provider parity. This is the same contract OpenAI uses, so the hosted
   adapters slot behind the same interface.
2. **Turso as the single source of truth** for users, conversations, messages,
   settings, documents — SQLite-compatible, edge-replicated, and already
   provisioned by the owner.
3. **Voice pipeline without a media server**: browser MediaRecorder + server
   ASR + sentence-chunked TTS gives a genuinely working end-to-end loop today;
   WebRTC/LiveKit transport activates when voice keys exist (architecture in
   `ARCHITECTURE.md §7`).
4. **Python FastAPI backend retained** for document processing (pypdf/docx)
   and as the future home of server-side VAD/STT/TTS orchestration — the
   sandbox gateway routes make it a same-origin service.

## 4. References consulted

OpenAI platform docs (chat completions + streaming SSE contract) · Anthropic
docs (messages API, tool use) · Google AI docs (Gemini) · Vercel AI SDK docs
(provider abstraction, `useChat` patterns) · Next.js 16 App Router docs (route
handlers, streaming) · React 19 docs · FastAPI docs (async, SSE, WebSockets) ·
MDN (MediaRecorder, AudioContext, Web Audio, RTCPeerConnection) · LiveKit docs
(tokens, rooms, WebRTC transport) · ElevenLabs docs (TTS/STT endpoints) ·
Turso docs (libSQL client, auth tokens) · REA repository (this document §1.2).

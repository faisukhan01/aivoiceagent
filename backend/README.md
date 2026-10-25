# AI Voice Agent API (FastAPI)

Python backend for the AI Voice Agent: multi-provider LLM (OpenAI / Anthropic / Gemini),
STT / TTS (ElevenLabs, Whisper), VAD (WebRTC), RAG, Turso (libSQL) — REST + WebSockets.

## Run

```bash
cd backend
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt -r requirements-dev.txt
bun run dev        # uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Provider/Turso/VAD status JSON |
| POST | `/api/chat` | One-shot chat completion (tool-calling passthrough) |
| POST | `/api/chat/stream` | Streaming chat (SSE) |
| GET | `/api/voice/capabilities` | STT/TTS/VAD/LiveKit capability matrix |
| POST | `/api/voice/tts?text=...` | Text → MP3 (ElevenLabs) |
| POST | `/api/voice/stt` | Audio upload → transcript |
| POST | `/api/documents/extract` | Upload pdf/docx/txt/md/html → text + chunks |
| POST | `/api/documents/ingest` | Upload → chunk → embed → vector store |
| WS | `/ws/voice` | Voice pipeline socket: ping / audio(VAD) / text(LLM) |
| GET | `/docs` | OpenAPI Swagger UI |

## Notes

- Every integration degrades gracefully without API keys (503 + machine-readable detail), so the stack boots in sandbox/dev mode.
- Turso: set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`; without them a local SQLite file (`local.db`) is used.
- Frontend (Next.js on :3000) reaches this API through the sandbox gateway with `?XTransformPort=8000`.

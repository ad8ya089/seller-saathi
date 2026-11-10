# AGENTS.md — Snapdeal Virtual KAM

Voice-first AI Virtual Key Account Manager demo for the Snapdeal "AI First Intern" assignment. Browser voice call → Sarvam STT → Gemini agent (function calling) → deterministic domain engine → Sarvam TTS. One Next.js service. Mock data only.

## Source of truth (read before coding; if code and docs disagree, docs win unless told otherwise)
| Topic | File |
|---|---|
| Requirements, data maths, hypotheses, assumptions | `docs/01-problem-analysis.md` |
| Conversation design, diagnosis rules, action catalog, system prompt, UI | `docs/02-product-and-conversation-design.md` |
| Architecture, API/SSE contracts, tools, chunker, failure matrix, repo layout | `docs/03-architecture.md` |
| Decisions, cost | `docs/04-tech-decisions.md` |
| Mock data & invariants, test personas | `docs/05-data-spec.md` |
| Deploy | `docs/06-deployment.md` |
| Tests/evals | `docs/07-test-and-eval-plan.md` |

## Commands (create in P1; keep working forever)
```
npm run dev | build | start
npm run lint | typecheck | test | test:watch
npm run verify-data          # scripts/verify-data.ts
npm run smoke:sarvam | smoke:gemini
npm run chat                 # text-mode agent CLI (real Gemini)
npm run eval                 # persona evals
npm run bench                # latency benchmark
```

## Hard rules
1. **TypeScript strict**, no `any`, no `@ts-ignore`. Zod at every boundary (HTTP in/out, env, tool args, LLM output, provider responses).
2. **Domain is pure**: `src/lib/domain/**` has no I/O, no `Date.now()` (inject `today`), no env. Weights/thresholds are data tables, not scattered `if`s.
3. **Numbers never come from the LLM or are hardcoded in prompts/UI.** Derive from domain functions. Spoken numbers follow `docs/02 §6`.
4. **Providers behind interfaces** (`SttProvider`, `TtsProvider`, `LlmProvider`) with fakes for tests. Unit/integration tests never call real providers.
5. **Streaming is sacred**: `/api/turn` emits SSE incrementally; never buffer the whole reply; set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`; `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
6. **No secrets** in repo, logs, client bundle, errors. Env parsed once in `src/lib/server/config.ts`. Never log transcripts unless `LOG_TRANSCRIPTS=true`.
7. **State**: in-memory sessions (Map + TTL) and a JSONL ledger. No database, no localStorage for app state, no vector store, no agent framework, no n8n.
8. **LLM safety**: user text is data. Phase-filtered tools. `commit_action_plan` guards live in code and are tested. The assistant never claims to change Snapdeal systems.
9. **No CDN at runtime** for VAD/ONNX assets; self-host under `/public/vad` via postinstall script.
10. **Model/provider names are env-configured** (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL`, …). Docs disagree on some Sarvam field names — resolve them with `scripts/smoke-sarvam.ts`, record the result in `docs/provider-notes.md`, don't guess.
11. Add dependencies sparingly; list every new one with a reason in your final summary.
12. Keep files small and named by responsibility; colocate tests in `tests/` mirroring `src/`.

## Style
Prettier + ESLint (next/core-web-vitals + typescript-eslint strict). Absolute imports via `@/`. Functional, explicit return types on exported functions. Errors are typed (`AppError{code,message,retryable}`); never leak stack traces or provider bodies to clients.

## Voice/UX rules
Replies ≤2 short sentences (findings ≤3, plan ≤4), one question per turn, plain speakable text (no markdown, emojis, symbols, SKU codes). Greeting discloses it's an AI. See `docs/02 §6-7`.

## Workflow per task
1. Read the referenced docs. 2. Write/extend tests first for pure logic. 3. Implement. 4. Run `lint`, `typecheck`, `test` (+ any script named in the task). 5. Final message: *what changed*, *how verified (commands + results)*, *deviations from docs and why*, *open questions*. Do not start the next phase's work.

## Out of scope (do not build)
Telephony, auth/multi-tenant, DB, real Snapdeal APIs, native speech-to-speech, multi-agent, RAG, analytics dashboards, mobile app.

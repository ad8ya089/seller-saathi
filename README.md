# SellerSaathi — Snapdeal Virtual KAM

## Implementation status — P4 seller recovery dashboard

SellerSaathi runs the seller recovery conversation: local Silero VAD → WAV → Sarvam STT → Gemini function calls → guarded deterministic domain tools → sentence-streamed Sarvam TTS → Web Audio. The responsive dashboard pairs that conversation with Snapshot, Diagnosis and Recovery Plan tabs. Metrics, evidence, confidence, seller statements and commitments update from server data. Server sessions enforce phases, three investigation questions, eligible plans and explicit acceptance before a JSONL commitment. All seller data is mock data; saved plans do not change Snapdeal systems.

Use Node.js 22.12 or later within Node 22 and npm. From the repository root:

```sh
npm ci
# Copy .env.example to .env and privately set GEMINI_API_KEY and SARVAM_API_KEY.
npm run dev
```

Open `http://localhost:3000/?debug=1` in Chrome. Click Call, allow the microphone and hear the AI greeting. Explain a sales drop, answer the stock and restock questions, review the spoken plan and explicitly accept it. Capture pauses during processing/playback and resumes after a short cooldown. End Call cancels server work and releases microphone tracks. English-India is the P3 call language. Localhost or HTTPS is required for microphone access. Debug measures the last VAD speech frame to scheduled playback; device output delay is not measured.

Use the tabs alongside the call to inspect the business comparison, evidence behind each hypothesis and action owners/dates. Confirm Plan and Not Now use the existing guarded API. Saved status appears only after server confirmation; the accepted actions and actual follow-up date are read from the ledger. The footer contains the documented assumptions. Hindi remains disabled and there is no barge-in control. P3's measured Chrome median first audio of **11.77 seconds** remains the P4 baseline.

`npm ci` copies pinned VAD/ONNX assets into ignored `public/vad/` through postinstall; the app configures local URLs for all four assets. `npm run smoke:sarvam` makes a bounded live audition (five TTS + four STT calls), saves ignored WAVs under `.data/audition/`, and records observed results in [provider notes](docs/provider-notes.md). Ordinary tests use fakes and reject live network calls.

Production locally: `npm run build`, then `npm start`. Startup copies static assets and mock data into the generated standalone directory and launches its server. Set `PORT` and `HOSTNAME` in `.env` or the shell. Set an absolute `DATA_DIR` when sharing the same ledger between development, CLI and standalone: the generated standalone server changes its working directory. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run verify-data`, and `npm run build` for verification. `npm run test:watch` starts Vitest watch mode.

`/api/health` reports provider **configuration**, not connectivity, and the live in-memory session count. It returns HTTP 200 with absent optional credentials and HTTP 503 for invalid explicit configuration. `/api/session` creates the UUID used by `/api/turn`; every turn also needs a client UUID `turnId`. Identical retries replay for 60 seconds. Sessions are process-local and capped at 25 turns, ten active minutes and a 30-minute TTL. `DATA_DIR` is writable ledger storage; `MOCK_DATA_DIR` is the read-only fixture source. Server modules use the `server-only` marker.

`npm run chat` opens the real Gemini text REPL. `npm run chat -- --scenario S1` runs the scripted seller acceptance check without speech providers and writes its synthetic trace under ignored `.data/chat/`. `npm run smoke:gemini` verifies a small signed function-call round trip on the configured primary model; `-- --fallback` explicitly tests the configured fallback. Both commands use paid providers. Ordinary tests use fakes. `eval` and `bench` remain P5 placeholders. See the [P3 report](docs/p3-report.md) for real-provider traces, measured latency and manual-check limits.

After `npm run build`, run `npm run test:browser` for the P4 Chrome smoke suite. It starts a separate standalone server on port 4200 with provider keys empty and mocks requests in Playwright only. It requires Google Chrome installed. Production has no fake-provider activation path. Screenshots, accessibility scores and the P4 verification details are in the [P4 report](docs/p4-report.md).

See [P1 decisions](docs/p1-decisions.md) for resolved documentation conflicts and policy choices. The design pack below describes the complete planned application, including work beyond P1.

Voice-first **Seller Recovery Agent**: a seller says "my sales dropped"; the bot reads their numbers, finds the real driver, asks ≤3 plan-changing questions, proposes 2–3 owned actions, saves the plan on a verified spoken "yes", and sets a 7-day review.

## Files
| File | Purpose |
|---|---|
| `AGENTS.md` | Rules Codex follows in the repo (conventions, commands, hard constraints) |
| `prompt.md` | Step 0 + 8 ordered Codex prompts with acceptance checks and a 24 h plan |
| `docs/01-problem-analysis.md` | Brief vs email requirements, data maths, hypotheses, assumptions A1–A10 |
| `docs/02-product-and-conversation-design.md` | State machine, diagnosis rules, question bank, action catalog, system prompt, UI, demo narrative |
| `docs/03-architecture.md` | Components, turn pipeline, API/SSE contracts, tools & guards, chunker, failure matrix, security |
| `docs/04-tech-decisions.md` | Decisions with rejected options, cost model, references |
| `docs/05-data-spec.md` | Exact mock data, invariants, 10 test personas |
| `docs/06-deployment.md` | AWS EC2 + Docker + Caddy + DuckDNS: files, runbook, checklist |
| `docs/07-test-and-eval-plan.md` | Test pyramid, persona evals, latency bench, voice QA, release gate |
| `docs/08-submission-pack.md` | Email, one-page note, recording script, interview Q&A |

## Decisions (defended in docs/04)
Cascaded voice pipeline · Sarvam Saaras STT + Bulbul TTS · Gemini 3.5 Flash-Lite with tools · deterministic TypeScript diagnosis engine · one Next.js service, in-memory sessions + JSONL ledger · hands-free VAD, sentence-streamed TTS, barge-in · EC2 t4g.small Mumbai + Caddy + DuckDNS · ≈ ₹6–7 per 4-minute call · ≈ $13.5/month infra.

## What I changed from the earlier plan (and why)
1. **Deadline:** brief says **24 h**, email says 48 h → plan for 24 h.
2. **LLM:** `gemini-2.5-flash-lite` → **`gemini-3.5-flash-lite`** (current, GA 21 Jul 2026), fallback `gemini-3.6-flash`; the 2.5 family is being retired/rerouted (1 Dec 2026), and preview TTS/live IDs already have shutdown dates. Model IDs are env-configured.
3. **Sarvam pricing corrected:** TTS is ₹30 per 10K chars (₹3/1K), not ₹1/1K; STT ₹30/hour. Per-call cost ≈ ₹6–7 (was ₹3.5–4.5).
4. **P2 provider correction:** current docs recommend `bulbul:v4-flash` and `saaras:v4`. Live smoke accepted five v4 persona speakers and both v4/v3 STT in `transcribe`/`codemix`. REST TTS uses `language_code`; details and observations are in `docs/provider-notes.md`.
5. **Per-turn JSON response → streaming plain text + tool calls.** A JSON blob can't be spoken until complete; this keeps validation and restores streaming.
6. **Voice mechanics upgraded** (30 marks): hands-free VAD, sentence-pipelined TTS, barge-in, cached greeting/fillers.
7. **Sharper analysis:** net-of-cancellation bridge (−₹67,900; 88% volume / 12% cancellations) and Pareto insight (3 of 60 listings ≈ 95% of lost orders) built into the data design.
8. **Ownership made concrete:** verified-quote commit guard, ledger, follow-up checkpoint, optional Day-7 call.
9. **Deployment:** kept EC2+Caddy+DuckDNS (your verified pattern), but build on-instance with swap (as in Roster Sync) instead of adding a GHCR pipeline; Mumbai region; no access-code wall (caps instead).
10. **Cut:** Seller Health Score, localStorage sessions, WebSocket stack, anything multi-seller.

## Verification status and remaining checks
- Gemini minimal thinking and signed tool continuation passed the live P3 smoke; the final S1 run also used the configured fallback successfully. See `docs/provider-notes.md`.
- P2 manual Chrome testing was reported complete in the P3 brief. The P3 Chrome run supplied three completed voice turns and a saved-plan screen; see the P3 report for the exact evidence and listening limits.
- Sarvam free credits (docs say ₹100; one page says ₹1,000) → dashboard.
- Papers cited in docs/04 were from the earlier research pass; re-read before quoting.
- Deployment snippets in docs/06 are adapted, **untested**; P6 + your runbook verify them.
- Brief's "1–2 hours expected effort" vs this scope: the core path (P1–P3 + minimal UI) already satisfies the brief; everything after is differentiation. Don't let it threaten the deadline.

## Start
P1–P4 are implemented locally. Start the English-India dashboard/call preview or run the real Gemini S1 text scenario. P5 and later phases remain out of scope for this change.

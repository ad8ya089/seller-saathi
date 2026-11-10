# Snapdeal Virtual KAM — design pack

## Implementation status — P1 complete

SellerSaathi now includes the Next.js foundation, exact validated mock datasets, deterministic diagnosis and recovery planning, speech validation, an append-only committed-plan ledger, and an initial branded shell. Voice, provider adapters, the agent and deployment remain pending their assigned phases.

Use Node.js 22.12 or later within Node 22 and npm. From the repository root:

```sh
npm ci
# Optional: copy .env.example to .env; P1 does not need provider keys.
npm run dev
```

Production locally: `npm run build`, then `npm start`. Startup copies static assets and mock data into the generated standalone directory and launches its server. Set `PORT` and `HOSTNAME` in `.env` or the shell. `npm run verify-data` and the domain tests require no provider calls. `npm run lint`, `npm run typecheck`, `npm test`, and `npm run verify-data` are the P1 verification commands. `npm run test:watch` starts Vitest watch mode.

`/api/health` reports provider **configuration**, not connectivity. It returns HTTP 200 with absent optional credentials, HTTP 503 for invalid explicit configuration, and zero active sessions in P1. `DATA_DIR` is writable ledger storage; `MOCK_DATA_DIR` is the read-only fixture source. Server modules use the `server-only` marker. The verifier runs with Node's `react-server` condition so CLI loading preserves that boundary.

Later-phase scripts (`smoke:sarvam`, `smoke:gemini`, `chat`, `eval`, `bench`) identify the pending phase and exit with status 1. No successful provider smoke, eval, deployment or latency result is claimed.

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
4. **No "Bulbul v4 Flash"** found in docs — TTS is `bulbul:v3`; STT `saaras:v3`/`v4` both documented → smoke script decides.
5. **Per-turn JSON response → streaming plain text + tool calls.** A JSON blob can't be spoken until complete; this keeps validation and restores streaming.
6. **Voice mechanics upgraded** (30 marks): hands-free VAD, sentence-pipelined TTS, barge-in, cached greeting/fillers.
7. **Sharper analysis:** net-of-cancellation bridge (−₹67,900; 88% volume / 12% cancellations) and Pareto insight (3 of 60 listings ≈ 95% of lost orders) built into the data design.
8. **Ownership made concrete:** verified-quote commit guard, ledger, follow-up checkpoint, optional Day-7 call.
9. **Deployment:** kept EC2+Caddy+DuckDNS (your verified pattern), but build on-instance with swap (as in Roster Sync) instead of adding a GHCR pipeline; Mumbai region; no access-code wall (caps instead).
10. **Cut:** Seller Health Score, localStorage sessions, WebSocket stack, anything multi-seller.

## Things to verify yourself (I could not)
- Gemini 3.x thinking-parameter name and thought-signature handling → `smoke:gemini` (P3).
- Sarvam TTS language field name and STT model/mode combo → `smoke:sarvam` (P2).
- Sarvam free credits (docs say ₹100; one page says ₹1,000) → dashboard.
- Papers cited in docs/04 were from the earlier research pass; re-read before quoting.
- Deployment snippets in docs/06 are adapted, **untested**; P6 + your runbook verify them.
- Brief's "1–2 hours expected effort" vs this scope: the core path (P1–P3 + minimal UI) already satisfies the brief; everything after is differentiation. Don't let it threaten the deadline.

## Start
Do **Step 0** in `prompt.md`, then P1.

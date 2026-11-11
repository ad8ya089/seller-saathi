# SellerSaathi — Snapdeal Virtual KAM

## Implementation status — P7 language and simulated Day-7 review

SellerSaathi runs the seller recovery conversation: local Silero VAD → WAV → Sarvam STT → Gemini function calls → guarded deterministic domain tools → sentence-streamed Sarvam TTS → Web Audio. The responsive dashboard pairs that conversation with Snapshot, Diagnosis and Recovery Plan tabs. Metrics, evidence, confidence, seller statements and commitments update from server data. Server sessions enforce phases, three investigation questions, eligible plans and explicit acceptance before a JSONL commitment. All seller data is mock data; saved plans do not change Snapdeal systems.

Use Node.js 22.12 or later within Node 22 and npm. From the repository root:

```sh
npm ci
# Copy .env.example to .env and privately set GEMINI_API_KEY and SARVAM_API_KEY.
npm run dev
```

Open `http://localhost:3000/?debug=1` in Chrome. Click Call, allow the microphone and hear the AI greeting. Explain a sales drop, answer the stock and restock questions, review the spoken plan and explicitly accept it. Interruptions are enabled by default. Turn off Allow interruptions to use half-duplex capture, which pauses during processing/playback and resumes after a short cooldown. End Call cancels server work and releases microphone tracks. English-India is the P3 call language. Localhost or HTTPS is required for microphone access. Debug measures the last VAD speech frame to scheduled playback; device output delay is not measured.

Use the tabs alongside the call to inspect the business comparison, evidence behind each hypothesis and action owners/dates. Confirm Plan and Not Now use the existing guarded API. Saved status appears only after server confirmation; the accepted actions and actual follow-up date are read from the ledger. The footer contains the documented assumptions. English is the default; Hindi/Hinglish remains disabled until the operator verifies its provider profile and enables `HINGLISH_ENABLED`. P3's measured Chrome median first audio was **11.77 seconds**. The P5 single-turn HTTP pilot measured **13.93 seconds**, with a different measurement boundary; no voice-latency improvement or twenty-sample gate is claimed. See the [P5 report](docs/p5-report.md).

`npm ci` copies pinned VAD/ONNX assets into ignored `public/vad/` through postinstall; the app configures local URLs for all four assets. `npm run smoke:sarvam -- --preflight` prints the English audition scope; live runs require `--confirm-spend`. The smaller `--hinglish --preflight` path plans only one short TTS request and one STT request from its synthetic audio, with retries disabled. Private WAVs stay under `.data/audition/`; aggregate observations go in [provider notes](docs/provider-notes.md). Ordinary tests use fakes and reject live network calls.

Production locally: `npm run build`, then `npm start`. Startup copies static assets and mock data into the generated standalone directory and launches its server. Set `PORT` and `HOSTNAME` in `.env` or the shell. Set an absolute `DATA_DIR` when sharing the same ledger between development, CLI and standalone: the generated standalone server changes its working directory. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run verify-data`, and `npm run build` for verification. `npm run test:watch` starts Vitest watch mode.

`/api/health` reports provider **configuration**, not connectivity, and the live in-memory session count. It returns HTTP 200 with absent optional credentials and HTTP 503 for invalid explicit configuration. `/api/session` creates the UUID used by `/api/turn`; every turn also needs a client UUID `turnId`. Identical retries replay for 60 seconds within a bounded audio cache. An expired/evicted ID is rejected without repeating provider work. Sessions are process-local and capped at 25 turns, ten active minutes and a 30-minute idle TTL. Accepted attempts also consume the process-local daily budget, resetting at midnight Asia/Kolkata; it resets on restart. `DATA_DIR` is writable ledger storage; `MOCK_DATA_DIR` is the read-only fixture source. Server modules use the `server-only` marker.

`npm run chat` opens the real Gemini text REPL. `npm run chat -- --scenario S1` runs the scripted seller acceptance check without speech providers and writes its synthetic trace under ignored `.data/chat/`. `npm run smoke:gemini` verifies a small signed function-call round trip on the configured primary model; `-- --fallback` explicitly tests the configured fallback. Both commands use paid providers. Ordinary tests use fakes. `eval` and `bench` now provide bounded real-provider runners. They print preflight usage and require `--confirm-spend`; ordinary tests remain offline. See the [P3 report](docs/p3-report.md) for real-provider traces, measured latency and manual-check limits.

After `npm run build`, run `npm run test:browser` for the dashboard and P5 interruption Chrome suite. It starts a separate standalone server on port 4200 with provider keys empty and mocks requests in Playwright only. It requires Google Chrome installed. Production has no fake-provider activation path. Screenshots, accessibility scores and the P4 verification details are in the [P4 report](docs/p4-report.md).

P6 adds locally verified Docker/Compose packaging and an instance-only AWS preparation kit. Follow the [manual EC2 runbook](deploy/aws-ec2/README.md), [local Docker checks](tests/deployment/README.md) and [P6 results](docs/p6-report.md). No AWS resources were created and nothing was pushed. Deployment cannot fetch these local commits until a later user-approved push. The outstanding P5 release gates remain open.

```sh
# Fresh checkout only; preserve an existing .env.
cp .env.example .env
docker compose up --build -d --wait
# App binds localhost:3000; set APP_PORT if already occupied.
docker compose down # retains the ledger volume
```

See [P1 decisions](docs/p1-decisions.md) for resolved documentation conflicts and policy choices. The design pack below describes the complete planned application, including work beyond P1.

Voice-first **Seller Recovery Agent**: a seller says "my sales dropped"; the bot reads their numbers, finds the real driver, asks ≤3 plan-changing questions, proposes 2–3 owned actions, saves the plan on a verified spoken "yes", and sets a 7-day review.

## P5 controls and paid runners

The server caches six English recovery clips and the greeting, limits TTS to two shared slots, limits unverified peers to a shared token bucket unless a trusted proxy identifies their IP, and enforces the daily attempt cap before providers. Optional access codes are entered by the user and checked on the server. Set `INTERNAL_METRICS_TOKEN` privately for bearer-authenticated `/api/health?verbose=1`; Host/forwarded headers never grant verbose access. Debug reads actual per-session metrics. No exchange rate or missing bill is invented.

```sh
npm run eval -- --preflight
npm run eval -- --persona S1 --runs 1 --max-tokens 600000 --max-requests 60 --confirm-spend
npm run bench -- --count 1 --preflight
npm run bench -- --count 1 --base-url http://localhost:3000 --generate-fixtures --confirm-spend
```

Run paid commands only after reviewing their preflight and approving the spend. P7 adds S8: the full scope is now ten personas times three runs (30), with a 27/30 gate. Earlier P5 pilots and the interim 25/27 gate do not satisfy it. WAV generation skips existing fixtures and validates 3–8 second PCM recordings. Private evaluation ledgers/traces and benchmark details stay under ignored `.data/`. The selected synthetic recording in `tests/fixtures/voice/` is deliberately committed. `COMPACT_TOOL_HISTORY=false` is the default. The opt-in completed-tool summary reduced history bytes in the pilot, but that evaluation failed before saving; it remains disabled pending a successful live acceptance check. Model Content, signatures, proposals and commitment results remain preserved in either mode.

## P7 language and follow-up

Hindi calls use immutable `hi-IN` sessions, a respectful Roman-script Hinglish prompt, preserved literal transcripts, Hindi-aware fact/consent guards and separate language/configuration audio caches. `.env.example` documents the configurable `SARVAM_HI_*` profile. Technical provider verification and physical listening quality are separate checks; see [P7 results and manual checklist](docs/p7-report.md).

After saving a plan, **Fast-forward 7 days** opens an illustrative review of that exact durable commitment. Only accepted seller actions are audited. The original plan is unchanged; audit records append to `DATA_DIR/followup-audits.jsonl`. The separate review phases audit progress, recompute the deterministic diagnosis and propose at most two eligible actions. New actions need fresh explicit acceptance. Order pace, overall cancellations and remaining stock come from the unchanged synthetic fixture; cancellation reasons and a new monthly recovery forecast are unavailable.

```sh
npm run smoke:sarvam -- --hinglish --preflight
# Only after approving the two-request paid scope:
npm run smoke:sarvam -- --hinglish --confirm-spend
npm run eval -- --persona S8 --runs 1 --preflight
# Live S8 needs fresh approval and --confirm-spend.
npm run eval -- --scenario followup --fake
npm run eval -- --scenario followup --preflight
```

F1 is a separate Day-7 evaluation, seeded by a guarded synthetic S1 commitment. Its default fake path makes no external calls; the optional live text-only path requires its own `--confirm-spend`. It does not contribute to the 30-run persona gate.

The cost/infra figures in the original design pack below are historical planning inputs. Current model-specific price units, verification dates and measurement limits are recorded in the P5 report.

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
- P6 Docker, Caddy and local HTTPS checks passed; AWS bootstrap, public source-IP trust and cloud/reboot acceptance await a separately approved deployment. See the P6 report.
- Brief's "1–2 hours expected effort" vs this scope: the core path (P1–P3 + minimal UI) already satisfies the brief; everything after is differentiation. Don't let it threaten the deadline.

## Start
P1–P7 are local, with P6 limited to deployment preparation. Paid P5 runs were limited to pilots at the user's request: the full persona gate, 20-turn benchmark and remaining recordings are pending. The approved S1 simulator pilot failed (0/1); its explicit-consent rejection was fixed offline and awaits a live rerun. The separate scripted S1 baseline passed. Physical speaker/headphone and language QA are unverified. Deployment packaging and P7 do not satisfy those release gates. No P8 work is included.

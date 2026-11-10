# 04 — Tech Decisions, Costs, References

Each decision: **choice → why → rejected → revisit if**. Verified-today items are marked ✔ (checked against vendor docs on 2026-11-10); the rest are judgement.

## Summary

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript strict, Node 22, one service |
| Voice in | Browser mic + Silero VAD (vad-web) → WAV → Sarvam **Saaras** STT ✔ |
| Reasoning | Gemini **3.5 Flash-Lite** (`gemini-3.5-flash-lite`) ✔ w/ fallback `gemini-3.6-flash` ✔, via `@google/genai` function calling |
| Voice out | Sarvam **Bulbul v3** TTS ✔, sentence-streamed |
| Brain logic | Deterministic TS domain engine + zod-validated tools |
| State | In-memory sessions + JSONL ledger |
| Deploy | AWS EC2 t4g.small, Mumbai, Docker Compose + Caddy + DuckDNS, SSM secrets |

## Decisions

### D1 — Cascaded STT → LLM → TTS, not speech-to-speech
- **Why:** transcript is visible/debuggable; tool calls and guards sit between hearing and speaking; per-component swap; predictable cost; Indic STT/TTS quality; the research on enterprise voice agents favours cascaded streaming pipelines for control.
- **Rejected:** Gemini Live (`gemini-3.8-live` ✔ exists) — lower raw latency but weaker control over tool gating/transcript, harder Hinglish/INR-specific TTS quality, model IDs churn (the 2.5 native-audio and 3.1 live previews already have shutdown dates ✔). OpenAI Realtime / Vapi / ElevenLabs agents — hosted orchestration hides the logic the interviewers want to hear explained; extra vendor/cost.
- **Revisit if:** p50 first-audio > 4 s after optimisations → hybrid: Live API for chit-chat, in-process tools unchanged.

### D2 — Sarvam for STT + TTS
- **Why:** Indian English + Hindi + code-mix, INR billing, ₹100 free credits ✔ (one Sarvam marketing page says ₹1,000 — check dashboard), simple REST, ≤30 s sync STT ✔, TTS returns base64 WAV ✔, 30+ voices.
- **Risks (mitigated):** model/field naming differs across doc pages (`saaras:v3` vs `v4`; `language_code` vs `target_language_code`; TTS `bulbul:v3` is what pricing/docs show — I found **no** "Bulbul v4 Flash" page) → env-configured + `smoke-sarvam.ts` picks the working combination before any code depends on it.
- **Rejected:** browser Web Speech API (inconsistent, Chrome-only, poor Indic accents) → kept only as TTS fallback; Gemini TTS (preview IDs rotate: `gemini-3.1-flash-tts-preview` shuts down 17 Nov 2026 ✔); ElevenLabs/Deepgram (stronger English, weaker Indic/₹ billing).
- **Revisit if:** voice sounds robotic after speaker audition → try other Bulbul speakers/pace; or Sarvam streaming TTS (WebSocket).

### D3 — Gemini 3.5 Flash-Lite for reasoning
- **Why:** cheapest current Gemini ($0.30/M in, $2.50/M out ✔), 1M ctx, function calling, one key. Released 21 Jul 2026 ✔; earlier plan's `gemini-2.5-flash-lite` still exists but is the old generation, and neighbouring 2.5 models are being rerouted on 1 Dec 2026 ✔ — don't pin to it.
- **Rejected:** Sarvam-105B (cheap, Indian; tool-calling reliability unverified for this flow); Claude Haiku/Sonnet (strong instruction following; you already use Claude API — higher latency/cost for 10 calls per session). Keep `LlmProvider` so either can be dropped in.
- **Eval-driven pick:** P5 harness runs the 10 personas on `gemini-3.5-flash-lite` vs `gemini-3.6-flash`; choose by pass-rate then latency.
- **Gotchas:** thinking tokens bill as output → set minimal/low; free tier = rate-limited and "used to improve products" (fine for mock data, bad for a public demo) → enable billing on the key for the demo window.

### D4 — One Next.js service (not FastAPI+React, not n8n)
- Same language end to end (TS), SSE via route handlers, you already ship Next/React/TS. n8n (KodeKloud) is wrong here: per-turn latency, audio, and streaming control. Python/FastAPI would be fine but doubles tooling for no gain.

### D5 — Hands-free VAD, barge-in, sentence-streamed TTS (30 marks live here)
- Push-to-talk feels like a walkie-talkie. Silero VAD in-browser gives natural turn-taking; sentence pipelining cuts perceived latency by ~50%; barge-in is the single most "human" behaviour. Fallback toggles exist (half-duplex, text).

### D6 — Streaming plain text + tools for state (not per-turn JSON)
- The earlier plan had the model return a JSON object each turn. A JSON blob can't be spoken until complete → kills streaming. Instead: speech = plain streamed text; structured state changes = tool calls (zod-validated). Same safety, lower latency.

### D7 — Deterministic domain engine decides, LLM verbalises
- Numbers, thresholds, hypothesis ranking, question choice, plan eligibility, commit validity are code (tested). LLM picks wording and chooses among allowed options. This is the answer to "how do you avoid hallucination?" and "how does it take ownership?" (like your Verdex pattern: rules + bounded AI).

### D8 — In-memory sessions + JSONL ledger
- Single container, ≤ dozens of concurrent demo calls. A DB adds ops for zero marks. Sessions are lost on restart (acceptable, TTL 30 min); ledger persists on a volume. Scale path: Redis for sessions, Postgres for ledger, sticky routing not needed.

### D9 — Deployment: EC2 + Docker + Caddy + DuckDNS (your proven pattern)
- Persistent process (SSE, in-memory sessions, no function timeouts), full control, HTTPS for the mic, same runbook you already verified on 2026-10-30 (Roster Sync).
- **Rejected:** Vercel — viable for stateless turns but in-memory sessions break across instances and a 4.5 MB body limit/timeouts constrain streaming; Lambda — same SSE/state issues; Cloud Run/Railway — fine, but you'd re-learn tooling under a 24 h clock.
- **Not same instance as Roster Sync.** Own instance + own SSM path (`/snapdeal-kam/*`).
- **Build on the instance** with 2 GB swap (your `deploy.sh` flow) — simpler than a GHCR pipeline; GHCR/ARM64 build in Actions is an optional later upgrade if builds are slow.
- **Region Mumbai (`ap-south-1`)** — closest to Indian evaluators; t4g.small ≈ $0.0112/h ✔ (Sydney would add ~150 ms per hop and the turn makes two).
- **DuckDNS risk:** free DNS occasionally flaps → the screen recording + `docker compose up` local run are the fallbacks; mic needs HTTPS or localhost.

### D10 — No access-code gate by default
- Evaluators should click and talk. Protect budget with per-IP/session/daily caps; flip `DEMO_ACCESS_CODE` on if abused.

### D11 — Keep scope inside the brief
- Cut from the earlier plan: Seller Health Score (replaced by live hypothesis panel), localStorage sessions (server state needed for SSE), WebSocket realtime stack, multi-seller anything.

## Cost model

Rates ✔: Sarvam STT ₹30/hour (per second), Bulbul v3 ₹30 per 10K chars (₹3 per 1K), Gemini 3.5 Flash-Lite $0.30 in / $2.50 out per 1M, cache read $0.03. FX assumed ₹88/$.

**One ~4-minute call (7 KAM turns):**
| Item | Qty | ₹ |
|---|---|---|
| STT | ~100 s of detected speech (VAD trims silence) | 0.83 |
| TTS | ~1,300 chars (greeting + fillers cached) | 3.90 |
| Gemini | ~10 calls × 3.5K in + ~3K out total | ~1.5 |
| **Total** | | **≈ ₹6–7** |

Earlier estimate (₹3.5–4.5) used a wrong TTS rate (₹1/1K); corrected to ₹3/1K.

| Scenario | Calls | ₹ |
|---|---|---|
| Dev + evals (incl. harness text-mode) | ~120 | ~800 (evals are text → no STT/TTS, much cheaper) |
| Evaluator window | ~30 | ~200 |
| **Budget to top up** | | **₹1,000 Sarvam + ~$3 Gemini** |

**Infra (Mumbai):** t4g.small $8.18/mo ✔ + public IPv4 $3.65/mo + 20 GB gp3 ≈ $1.6 → **≈ $13.5/mo (~₹1,200)**; prorated by the hour. Stop/terminate and **release the Elastic IP** after evaluation. Add an AWS Budget alert at ~₹1,500 (alerts only, not a hard cap).

**Self-hosting open models?** No: GPU + ops cost ≫ ₹7/call at this volume.

## Where AI writes code vs where you think

| Area | Codex writes | You decide / verify |
|---|---|---|
| Scaffold, types, zod, adapters, SSE plumbing, UI components, Dockerfile, scripts | ✅ | review diffs, run |
| Domain math + tests | ✅ from spec | **verify numbers vs `docs/01`** |
| Hypothesis weights, question order, action catalog | implements | **you tune** (this is the "thinking" the panel will probe) |
| System prompt wording | drafts | **you audition aloud**, trim |
| TTS voice, pace, VAD thresholds | wires | **you listen & tune** |
| Demo script & recording | — | you |
| Interview narrative | — | you (`docs/08`) |

## References
Provider docs checked 2026-11-10: Sarvam STT REST (`docs.sarvam.ai/api-reference/speech-to-text/transcribe`), Sarvam TTS REST + best-practices, Sarvam pricing, Gemini deprecations page, Gemini pricing, vad-web API (`docs.vad.ricky0123.com`), AWS t4g pricing aggregators.
Papers/benchmarks (from the earlier research pass — **not re-opened in this pass; re-read before quoting**): ReAct (Yao et al., ICLR 2023, arXiv 2210.03629) — interleave reasoning and tool use; *Building Enterprise Realtime Voice Agents from Scratch* (Qiu et al., 2026, arXiv 2603.05413) — streaming cascaded pipelines and latency; τ-Voice (ICML 2026) — voice agents lose task accuracy under realistic audio, so test behaviour, not just voice; EVA (ServiceNow, 2026) — separate *accuracy* from *experience*. Design consequences: cascaded streaming (D1/D5), tool loop with guards (D7), two-axis eval (`docs/07`).
Snapdeal context: AceVector FY26 MD&A, Snapdeal seller-API docs, Snapdeal MSME blog (earlier pass).

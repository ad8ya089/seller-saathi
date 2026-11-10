# prompt.md — Build plan as Codex prompts

8 prompts + a manual Step 0. Each prompt is self-contained, small enough to keep Codex accurate, and ends with acceptance checks. Run them **in order**, one branch/commit per prompt.

## How to use
1. Create the repo, copy this whole folder in (`AGENTS.md`, `docs/`, `prompt.md`). Commit. Codex auto-reads `AGENTS.md`.
2. For each prompt: new branch → paste the prompt block → let it run → **you** run the acceptance commands and do the manual checks → commit/merge.
3. If Codex drifts from the docs, reply: *"Re-read docs/0X §Y and conform; do not change the contract."*
4. Use the highest reasoning setting for **P3**; default for the rest.
5. Never paste real keys into prompts. Keys live in `.env` (gitignored).

## Time plan (24 h clock; brief says 24 h, email says 48 h — don't use the extra)
| Block | Work | Budget |
|---|---|---|
| H0–1 | Step 0 (manual) | 1 h |
| H1–2 | P1 domain | 1 h |
| H2–4.5 | P2 voice slice | 2.5 h |
| H4.5–7.5 | P3 agent | 3 h |
| H7.5–9 | P4 UI | 1.5 h |
| H9–11.5 | P5 hardening + evals | 2.5 h |
| H11.5–14 | P6 deploy artifacts + AWS rollout | 2.5 h |
| H14–16 | Voice tuning (you), prompts trimmed, recording | 2 h |
| H16–19 | P7 stretch (only if healthy) | 3 h |
| H19–22 | P8 + note + submit | 3 h |
Two hours of slack are deliberate. **Cut order if behind:** P7 → P5 barge-in/fillers polish → Playwright e2e → LLM-judge → debug overlay. **Never cut:** voice loop, tool guards, a public URL *or* a clean local `docker compose up` + recording.

---

## Step 0 — Manual (you, ~1 h)
1. **Keys:** Sarvam (dashboard; check free credits; add ₹500), Google AI Studio key (enable billing for the demo window).
2. **Repo:** GitHub `snapdeal-virtual-kam`; add folder contents; `.gitignore` (node_modules, .next, .env*, .data, public/vad).
3. **DuckDNS:** reserve `snapdeal-kam-<you>.duckdns.org`; keep token private.
4. **AWS:** CLI profile + SSM plugin; Budget alert; (provisioning itself happens in P6).
5. **Read** `docs/01` and `docs/02` once. Decide: do you agree with the 3 actions and weights? Edit the docs *now* if not — Codex implements whatever the docs say.
6. **Voice audition (after P2's smoke script):** listen to 4–5 Bulbul speakers at pace 1.0 and 1.1 on the greeting line; pick one.

---

## P1 — Scaffold, data, deterministic domain engine

```text
Read AGENTS.md and docs/01, docs/02 (§3-4), docs/05, docs/07 (§2). Implement ONLY the scaffold + pure domain layer. No UI, no providers, no LLM.

1) Scaffold
- Next.js (latest stable, App Router), TypeScript strict, Tailwind, Node 22. npm only. ESLint (strict), Prettier, Vitest, zod, pino.
- package.json scripts exactly as listed in AGENTS.md "Commands" (stub the ones for later phases with a clear "not implemented yet" exit 0 message).
- next.config: output "standalone". .env.example with every variable from docs/03 §6, docs/04 summary, docs/06 (Gemini/Sarvam keys blank, models per docs, caps, thresholds).
- src/lib/server/config.ts: zod-parsed env, typed, defaults per docs, never throws for missing provider keys at import time (health reports configured=false).
- GET /api/health → { ok, version, uptimeS, providers:{gemini:boolean,sarvam:boolean}, sessions:0 }. Placeholder src/app/page.tsx ("Virtual KAM — coming up").

2) Data
- Create data/seller.json, data/skus.json, data/cancellations.json, data/followup_day7.json EXACTLY per docs/05. Include "synthetic" flags.
- scripts/verify-data.ts asserting every invariant in docs/05 §2-3 (sums, OOS counts, orders×ASP=sales, derived 123 / 94.6% / 47.5% / ₹61,500). npm run verify-data must exit non-zero on violation.

3) Domain (src/lib/domain, pure, no I/O, no Date.now – inject `today: Date`)
- types.ts (zod schemas + inferred types), data.ts (loader/validator).
- metrics.ts: bridge() and netBridge() per docs/01 §2 (return numbers, percentages with 1 decimal, shares).
- signals.ts: all 7 signals from docs/02 §3.1 with thresholds from a config object (defaults per docs).
- hypotheses.ts: evidence-weights table as DATA (docs/02 §3.2), scoreHypotheses(evidence[]) → [{id,score,level}] sorted; facts update scores; margin(); level thresholds ≥4 high, ≥2 medium.
- questions.ts: bank (docs/02 §3.4) + pickNextQuestion(state) per §3.3 + readyToRecommend(state) + maxQuestions=3.
- actions.ts: catalog table (docs/02 §4) with eligibility predicates, owners, due offsets, metrics; buildPlan(state, today) selects top 3 (min 2) + always A_FOLLOWUP; fills parameters from data (spoken SKU names, order counts, ceiling "up to ₹61,500 if fully recovered"); price action only if competitor_undercut=yes.
- diagnosis.ts: computeDiagnosis(state) → { signals, hypotheses, suggestedNextQuestion, questionsLeft, readyToRecommend, evidence[] } where state = { facts, questionsAsked, toolsCalled }.
- ledger.ts: appendPlan(plan, dataDir) → JSONL line; listLatest(n). (This is the only file here allowed to do fs I/O; keep it separate and injectable.)
- speech.ts: lintSpeech(text, phase) rules from docs/07 §2 (markdown, symbols/₹/Rs/%, SKU-code regex, word limits per phase, ≤1 '?').

4) Tests (tests/domain/*.test.ts) with the exact numbers in docs/07 §2 (bridge −65000/−32.5%; net 368→232.2, −67900/−36.9%, shares 88.1/11.9; hypothesis scores 4/1/1/1/−1 then 9 then 11; picker order; plan composition for S1; guards not here yet).

Acceptance (run and paste results): npm run lint && npm run typecheck && npm test && npm run verify-data all green. Do not implement anything outside this scope. Final message per AGENTS.md workflow.
```

Manual check: open `docs/01 §2` numbers vs test output; tweak weights only in the table.

---

## P2 — Voice I/O vertical slice (echo bot) ★ de-risks 30 marks

```text
Read AGENTS.md, docs/03 (§2, §3 turn/SSE, §6, §7, §8), docs/04 D1/D2/D5, docs/06 §8 (troubleshooting). Build a working voice loop with NO LLM yet: speak → STT → server replies "You said: <transcript>" → TTS → hear it. Measure latency.

Server
- src/lib/voice/sarvam-stt.ts: SttProvider { transcribe(wav: Buffer, lang): Promise<{text, ms}> }. POST https://api.sarvam.ai/speech-to-text multipart (file, model=SARVAM_STT_MODEL, mode, language_code) with header api-subscription-key. Timeout 6 s, 1 retry on 429/5xx, typed AppError, zod-validated response ({request_id, transcript}).
- src/lib/voice/sarvam-tts.ts: TtsProvider { synthesize(text, lang): Promise<{wav: Buffer, ms}> }. POST https://api.sarvam.ai/text-to-speech JSON {text, model, speaker, pace, speech_sample_rate:24000, <language field>}; response audios[] base64 → join → decode. The language field name differs across Sarvam docs pages (language_code vs target_language_code) — make it a config switch, default via smoke result.
- scripts/smoke-sarvam.ts: (a) synthesize a Hinglish + English test line with 5 speakers (priya, shubh, roopa, aditya + one more from the docs list) → write wavs to .data/audition/; (b) feed the produced wav back to STT with saaras:v3 and saaras:v4 and mode variants; print which combos work, transcripts, and ms; (c) try both TTS language field names. Exit non-zero if nothing works. Write findings to docs/provider-notes.md.
- src/lib/agent/chunker.ts: streaming sentence chunker per docs/03 §7 (+ tests: no split on 1.35, min first chunk 20 chars, Devanagari danda, long-clause split, markdown/₹/% stripping).
- src/lib/voice/wav.ts: helpers to validate RIFF/WAVE and size caps.
- src/app/api/turn/route.ts (v0): multipart audio → STT → reply text "You said: …" → chunker → TTS → SSE events transcript / sentence / audio / done{timings} exactly as docs/03 §3. Headers for non-buffered SSE. Validate with zod, cap audio 1 MB, 28 s.
- Fake providers (src/lib/voice/fakes.ts) used by tests/integration/turn-echo.test.ts (event order, ordering of audio events under out-of-order TTS completion, error → `error` event).

Client
- scripts/copy-vad-assets.mjs (postinstall): copy vad.worklet bundle, silero_vad_v6.onnx and onnxruntime-web wasm/mjs files from node_modules into public/vad (gitignored). Use the installed @ricky0123/vad-web version's real file names.
- src/lib/client/: audio-queue.ts (Web Audio gapless scheduling via start(nextTime), stopAll(), onended callbacks; single AudioContext unlocked on user gesture), wav-encode.ts (Float32 16 kHz → PCM16 WAV; use vad-web's util if present), sse.ts (fetch-based POST SSE parser with AbortController), useVoiceCall.ts (state machine idle→listening→processing→speaking→listening; getUserMedia with echoCancellation/noiseSuppression/autoGainControl, MicVAD with baseAssetPath/onnxWASMBasePath="/vad/", starting values positiveSpeechThreshold 0.5, negativeSpeechThreshold 0.35, minSpeechMs 250, preSpeechPadMs 300, ~700 ms redemption — use the option names of the installed version; config constants in one file; pause VAD while speaking when half-duplex=true; mic-denied → text-input fallback).
- Minimal src/components/VoiceConsole.tsx on the home page: "Call" button (unlocks AudioContext), orb/state label, transcript list, text fallback input, `?debug=1` overlay showing endOfSpeech→firstAudio ms and server timings.

Tests: pure parts only (chunker, wav, sse parser, audio-queue scheduling math, turn route with fakes). 

Acceptance: lint/typecheck/test green; `npm run smoke:sarvam` prints a working combo; manual: in Chrome on http://localhost:3000 I speak and hear the echo; transcript appears; debug overlay shows timings; mic-denied path shows text fallback; no CDN requests in the network tab. Report the measured firstAudio ms for 5 turns.
```

Manual check: run smoke, audition voices (Step 0.6), set `SARVAM_TTS_SPEAKER`; tune VAD redemption with a 1-second mid-sentence pause.

---

## P3 — Agent core (LLM, tools, phases, streaming pipeline) ★ highest reasoning

```text
Read AGENTS.md, docs/02 (all), docs/03 (all), docs/05 §6, docs/07 (§2 guards, §4). Replace the echo with the real agent.

LLM
- src/lib/llm/provider.ts: LlmProvider interface (stream turn with tool declarations; yields text deltas and function calls; returns usage). src/lib/llm/gemini.ts using @google/genai with GEMINI_MODEL and GEMINI_FALLBACK_MODEL (retry once on 5xx/timeout 8 s then fall back). Requirements: (a) keep each model response Content object (including any thought-signature parts) and replay it verbatim in history on tool continuation — do NOT rebuild parts; (b) configure minimal/low thinking via env after verifying the real parameter name for the chosen model with scripts/smoke-gemini.ts; (c) maxOutputTokens ≈300, temperature 0.4; (d) stream text deltas. src/lib/llm/fake.ts: scripted FakeLlm for tests.
- scripts/smoke-gemini.ts: one call with a function declaration; prints model id, thinking param used, tool-call round trip, ms, token usage. Document findings in docs/provider-notes.md.

Agent
- src/lib/agent/prompts/system.ts: system prompt from docs/02 §7 with {{shopName}}; export PROMPT_VERSION. Per-turn system note builder: [PHASE: x | QUESTIONS_LEFT: n | MUST_DO: …] + compact facts/hypotheses summary (no long history dumps).
- src/lib/agent/tools.ts: zod schemas + Gemini function declarations + executors for the 7 tools in docs/03 §5 using src/lib/domain. Every executor returns {ok:true,…}|{ok:false,error}. Include `synthetic:true` on SKU/cancel results. record_seller_fact updates session facts and returns recomputed diagnosis. propose_action_plan and commit_action_plan guards EXACTLY as docs/03 §5 (propose: ids subset of eligible, 2–3, ready, no price action w/o undercut; commit: plan proposed in an EARLIER turn, confirmationQuote substring of normalised lastUserText, affirmative+negation check, accepted ⊂ plan). commit appends to ledger via domain/ledger and sets followUpDate = today+7.
- src/lib/agent/phases.ts: phase machine + guards + per-phase tool filtering (e.g., commit tool only offered in CONFIRM) per docs/02 §2.
- src/lib/server/session-store.ts: Map + TTL 30 min, caps (25 turns, 10 min), history trimming (last ~12 messages + compact facts summary; summarise tool results after use).
- src/lib/agent/orchestrator.ts: runTurn(session, input, emit): (audio→STT if needed) → LLM loop (≤4 tool rounds) → text deltas → chunker → TTS (≤2 in flight, strictly ordered emit) → `state` event after tool calls and at turn end → `done` with timings. Emit `tool` events with human labels ("Checking your numbers", "Checking stock by product", "Checking cancellation reasons", "Saving your plan"). Idempotency per (sessionId, turnId) for 60 s.
- Routes: POST /api/session (creates session; greeting text per docs/02 §8 row 1; greeting audio synthesized once at boot per language and cached; returns snapshot DTO from domain), POST /api/turn (audio multipart or JSON text; SSE per docs/03 §3), POST /api/confirm (UI button; same commit guard; 'accept' sets confirmationQuote to a synthetic "[ui-confirm]" accepted only via this route), GET /api/ledger.
- scripts/chat-cli.ts: text-mode REPL against the real orchestrator + Gemini (no STT/TTS) printing phase, tools, hypotheses.

Tests (Vitest with FakeLlm + fake voice): S1 happy path end-to-end event order & ledger line; S6 decline→replan (no ledger); S10 injection (no commit); commit-before-propose rejected; commit same-turn rejected; quote not in last utterance rejected; phase tool filtering; malformed tool args → {ok:false} and loop cap; idempotent turnId; caps → wrap-up event, fakes not called; history trimming keeps latest tool-derived facts.

Acceptance: lint/typecheck/test green; `npm run chat` completes the S1 conversation with ≤3 questions and a ledger entry; each KAM line passes lintSpeech; manual voice call on localhost completes S1 end-to-end. Report: tool traces for S1, time to first audio for 5 turns, token usage per call.
```

Manual check: have a real conversation by voice; read the transcript aloud for naturalness; trim the system prompt, not the guards.

---

## P4 — UI (panels that explain the reasoning)

```text
Read AGENTS.md, docs/02 §9, docs/03 §3 (SSE `state` event), docs/05 §1-3. Build the full UI on top of the existing hook/SSE; no domain logic in components.

- Client store (reducer or zustand) fed by SSE events: transcript, tool feed, state{phase, questionsAsked, hypotheses, facts, plan, committed}, fallback, error. Snapshot from POST /api/session.
- Layout per docs/02 §9: header (title, "Mock data · not connected to Snapdeal" badge, language toggle [EN active, HI disabled with tooltip until P7], barge-in toggle, debug link), left VoiceConsole (Call/End, animated orb with 4 states, transcript bubbles with aria-live, mic-denied + error banners, collapsed text fallback), right tabs: Snapshot (last vs this table, deltas, sales-bridge bar: volume −₹65,000 vs price ₹0, "synthetic" tags), Diagnosis (hypothesis bars + level chips, evidence chips labelled "data" / "seller said", tool-activity feed, "questions used n/3"), Recovery plan (action cards with owner/due/metric/impact "up to", Confirm / Not now → POST /api/confirm; after commit: "Saved to demo ledger — not sent to Snapdeal", follow-up date, last ledger entries). Footer: collapsible assumptions A1–A10 from a single TS constant mirrored from docs/01 §6.
- All numbers/labels come from the snapshot/state payloads (no hardcoding). Currency formatting helper for Indian grouping (₹2,00,000).
- Tailwind; neutral palette with a red accent; responsive (≥1024 two-column, mobile stacked at 390 px); respects prefers-reduced-motion; keyboard accessible; visible focus; sufficient contrast.
- Debug overlay (?debug=1): timings split + cost estimate + phase + raw hypotheses.
- Tests: reducer unit tests; component tests for plan card states and phase-dependent rendering; Playwright smoke that loads the page, starts a call with fake providers via a test flag, and checks panels update (keep light).

Acceptance: lint/typecheck/test green; manual run of S1 shows panels updating in sync with speech; screenshots at 1280 px and 390 px; Lighthouse accessibility ≥90 (report). Do not change the SSE contract.
```

---

## P5 — Hardening: barge-in, fallbacks, caps, metrics, evals, benchmark

```text
Read AGENTS.md, docs/03 (§8-11), docs/07 (all). Implement robustness + proof.

1) Barge-in: on speech start while speaking → audioQueue.stopAll(), abort in-flight /api/turn, send playedSentences on next turn; server truncates the assistant message in history to played sentences and notes "[interrupted]". Raise VAD threshold (0.6) during playback; half-duplex toggle works; test on laptop speakers.
2) Fillers & cached audio: at server boot synthesize and cache short clips per language: filler ("One moment, let me check."), reprompt ("Sorry, I didn't catch that — could you say it again?"), apology ("I'm having trouble right now — could you try again?"), wrap-up lines for caps. Client plays a filler if no audio within 1.5 s of end-of-speech (only once per turn). Bytes served via /api/session config or cached endpoint.
3) Fallbacks per docs/03 §9: empty/low STT → reprompt (no history pollution, ≤2 then suggest text), TTS failure → browser speechSynthesis for that sentence + `fallback` event, LLM failure → fallback model then apology, SSE drop → client retries once with same turnId.
4) Abuse/cost controls: per-IP token bucket (40 turns/10 min), session caps, DAILY_TURN_CAP, audio ≤1 MB RIFF/WAVE sniff, same-origin check on POSTs, optional DEMO_ACCESS_CODE gate (off by default).
5) Observability: pino JSON logs (session id, turn, timings, tools, error codes; no transcripts by default); in-memory metrics (turns, errors by code, fallbacks, p50/p95 firstAudioMs, token and char counters, estimated ₹ cost) exposed at /api/health?verbose=1; debug overlay uses them.
6) Evals: scripts/eval.ts per docs/07 §3 — LLM seller simulator (cheap model, temp 0) for personas S1–S7, S9, S10 from docs/05 §6; trace capture (tools+args, phases, plan, ledger, utterances); automated must/must-not assertions; lintSpeech on every KAM utterance; 3 runs each; summary table + JSON in .data/evals/. Support `--model` to compare GEMINI_MODEL vs fallback.
7) scripts/bench-latency.ts per docs/07 §5 with 20 sample wavs (generate with Sarvam TTS into tests/fixtures once, commit them).
8) Failure-injection tests listed in docs/07 §4. Optional: Playwright e2e using Chrome fake mic file (--use-fake-device-for-media-stream --use-file-for-fake-audio-capture) running S1 against fakes.

Acceptance: all tests green; `npm run eval` ≥27/30 (report table, model, prompt version; fix PROMPT or guards, not the assertions); `npm run bench` prints p50/p95; manual interruption test works; caps tested. Summarise measured numbers for docs/08.
```

Manual check: speak over the bot on laptop speakers; if it self-interrupts, enable half-duplex default or raise threshold.

---

## P6 — Deployment artifacts (AWS EC2 + Caddy + DuckDNS)

```text
Read AGENTS.md, docs/06 fully. Produce deployment artifacts adapted from the pattern in docs/06; do not run AWS commands.

- Dockerfile (multi-stage, node:22-alpine, Next standalone, non-root uid 10001, /data volume, copies public/ incl. generated vad assets and data/), .dockerignore, compose.yml for local one-command run (`docker compose up --build`, port 3000, env_file .env, volume for /data, healthcheck via wget on /api/health).
- deploy/aws-ec2/: bootstrap.sh, deploy.sh, start-caddy.sh, compose.prod.yml, Caddyfile (SSE-safe: no encode and flush_interval -1 on /api/turn; verbose health blocked; security headers incl. Permissions-Policy microphone=(self) and a CSP that works with vad-web: worker-src blob:, wasm-unsafe-eval — verify in a real browser and adjust), instance-policy.template.json (ap-south-1, /snapdeal-kam/*), README.md runbook (provision → bootstrap → DNS → start-caddy → verify → update → teardown) mirroring docs/06 §3-9 with placeholders for domain/repo.
- next.config: standalone + any needed headers; ensure /vad/* assets are served with correct MIME (wasm, onnx, js worklet).
- .github/workflows/ci.yml: Node 22, npm ci, lint, typecheck, test, build (no deploy, no secrets). 
- Validate: `docker build` succeeds (also try `docker buildx build --platform linux/arm64` if available), `docker compose up` serves the app on localhost, `/api/health` ok, VAD assets reachable, `caddy validate` passes for the Caddyfile (run caddy:2-alpine container with a dummy DOMAIN). No secrets baked into image or repo.

Acceptance: report image size, startup time, memory at idle (docker stats), and the exact commands to run on the EC2 box. Do not modify application behaviour.
```

Then **you** execute `docs/06 §3-7` (provision, bootstrap, DNS, start-caddy) and tick the §7 checklist.

---

## P7 — Stretch: Hinglish mode + Day-7 follow-up call (only if ≥4 h left)

```text
Read AGENTS.md, docs/02 §5, docs/05 §5-6 (S8), docs/03 §3. Add two features without breaking contracts.

A) Hinglish/Hindi mode: enable language toggle (en-IN | hi-IN). Session lang drives: STT language_code, TTS language code + speaker (config), system prompt addendum (mirror the seller's language; Hinglish = Roman-script Hindi with English business terms; same style rules; numbers in lakh), cached greeting/filler/reprompt per language, chunker handles danda, lintSpeech adapted (no Devanagari digits issues). Add persona S8 to evals.

B) Day-7 follow-up: after a committed plan, UI shows "Fast-forward 7 days". POST /api/session {mode:"followup", planId}. Load data/followup_day7.json; new phase set FOLLOWUP_INTRO → AUDIT (per action: done/partial/not done from data + one confirming question max) → RE_DIAGNOSE (recompute hypotheses with new stock/cancel signals) → NEXT_STEPS (≤2 new actions from catalog) → DONE. New tool get_followup_status. UI shows Δ vs this-month pace (orders/day 9.0 → 11.9) and statuses. Tests + one eval persona.

Acceptance: tests/evals green incl. S8 and follow-up; manual Hinglish call ("Meri sale gir gayi hai") works; follow-up call completes. If Hinglish STT/TTS quality is poor, keep it behind the toggle and say so in the final report.
```

---

## P8 — Submission polish

```text
Read AGENTS.md, docs/06 §7, docs/07 §7, docs/08.

- README.md: what it is (3 lines), live URL placeholder, one-command run, architecture diagram (mermaid from docs/03), demo flow, env table (from .env.example), measured latency table (from npm run bench; machine + region), eval summary (from last npm run eval), cost per call, assumptions A1–A10, limitations, what's next, repo map.
- scripts/docs-numbers-check.ts: assert the key numbers quoted in docs/01, docs/02, docs/05, docs/08 (−65,000; −32.5%; 368/232.2; −67,900; 88.1/11.9; 123/130; 47.5%; ₹61,500) match domain outputs; wire into `npm test`.
- Repo hygiene: no secrets (grep history & tree), .env.example complete, licenses, remove dead code and TODOs, consistent scripts, tag v1.0.0.
- Produce docs/08 "Measured" section values as a JSON snippet I can paste into the note (p50/p95, eval pass rate, tokens/call, ₹/call).

Acceptance: fresh clone → `cp .env.example .env` (+keys) → `docker compose up --build` → working call; all checks in docs/07 §7 listed with pass/fail.
```

Then you: fill the note placeholders in `docs/08`, record, run the pre-submit checklist, send.

---

## Reusable follow-up prompts

- **Tune the voice:** *"Trim the system prompt and per-turn note to cut first-sentence latency without changing guards; show before/after bench p50 and eval pass rate."*
- **Debug latency:** *"Add per-stage timestamps to the SSE `done` event and the debug overlay; find the slowest stage over 20 turns and propose the smallest fix."*
- **Review pass:** *"Review the diff against docs/03 §3 contracts and docs/02 guards; list mismatches only."*

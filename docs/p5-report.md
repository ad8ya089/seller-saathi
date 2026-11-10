# P5 — Hardening, latency and evaluation evidence

Verification date: **2026-11-11, Asia/Kolkata**. P5 implementation and offline verification are complete within the approved scope. **Release gates are not satisfied:** the approved simulator S1 pilot failed, the one-turn voice pilot exceeded the latency target, and the full paid runs and physical device QA remain pending. The user authorized “S1 and one-turn pilots only” and delegated the available browser checks. No additional paid pilot was run after its failure; no P6 work was started.

## Interruption and playback

Full duplex is enabled by default and can be disabled with **Allow interruptions**. The call has a lifetime AbortController and each turn has its own controller. Confirmed user speech stops every queued/current Web Audio source or browser speech utterance, aborts the active turn, and leaves microphone capture open for the new utterance. Late events from the aborted generation are ignored. The half-duplex path pauses VAD during processing and playback and retains its cooldown.

`playedSentences` counts completed playback callbacks, not received SSE events or audio scheduling. The next turn carries that integer. Server history records only completed spoken sentences plus an interruption marker while preserving original signed model Content objects and executed tool exchanges. An unheard question becomes eligible again. An incompletely heard proposal is invalidated and must be presented again before later acceptance; a quick “yes” cannot commit it. A durable ledger append that has already crossed the existing commit point remains irreversible.

The installed VAD uses `onSpeechRealStart`, after its minimum speech confirmation, with positive/negative thresholds 0.5/0.35, minimum speech 250 ms, pre-padding 300 ms and redemption 700 ms. Playback raises the positive threshold to 0.6. Echo cancellation, noise suppression, automatic gain control, mono capture and local VAD/ONNX assets remain enabled. Redemption was not shortened; a physical one-second thinking-pause check is still needed.

The Playwright harness injects the real production VoiceCallController and Web Audio implementation into Chrome, with fake VAD callbacks and fake backend dependencies only in the runner. It measures callback entry through synchronous playback-stop dispatch and verifies an aborted request, one subsequent submission and exact completed-sentence receipts. The final measured values are recorded in the automated verification section. These software measurements exclude VAD confirmation, acoustic detection and physical output latency; they do not establish a speaker/headphone stop time below 300 ms.

## Cached speech, recovery and streaming

The English greeting and six clips are cached in process by language/model/speaker: one filler, one reprompt, one generic apology and turn/time/daily wrap-ups. Initialization coalesces concurrent requests; failed clips degrade to browser speech. Missing keys and an enabled access gate do not cause unauthenticated startup provider work. Greeting and clip warming share the same **two-slot TTS limiter** as turn sentences. Aborted queued work is removed before invoking a provider.

The filler timer is 1.5 seconds from the captured end-of-speech boundary, fires at most once, is suppressed by real response audio, and stops when real audio/fallback/error takes over. It has its own playback queue and never becomes model history, a normal turn, a completed response sentence or the response first-audio measurement. Its telemetry records a client playback attempt, not proven physical audibility.

Real production HTTP checks observed all six valid cached 24 kHz WAV clips ready. Two subsequent session requests reused identical greeting audio and took **49.3 ms and 46.4 ms** locally. This measures warm session responses, not cold greeting latency or heard onset. The CLI voice benchmark does not play fillers, so its filler count is correctly zero.

`/api/turn` remains incremental SSE, Node runtime, force-dynamic, with no-cache/no-transform and buffering disabled. The client reconnects once with the same turn UUID and suppresses already delivered replay events. A bounded 32 MiB replay cache retains successful/error event sequences for 60 seconds. Expired or evicted IDs retain a fingerprint tombstone and return REPLAY_EXPIRED instead of repeating provider calls or ledger writes. Changed content under the same ID is rejected.

## Failure matrix and deterministic coverage

| Condition                           | Result and verified guard                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty/invalid STT                   | At most two cached reprompts, then text-input hint; no seller facts, normal conversation turns or model history added. Paid STT attempts still consume the daily allowance. |
| Low recognition confidence          | No fabricated threshold. Sarvam documents language-detection probability, not transcript confidence; empty/invalid recovery is implemented.                                 |
| Primary LLM timeout/5xx             | One bounded primary retry, then configured fallback; no retry after delivered text. Fake adapter tests cover all failures and rollback.                                     |
| Both LLM models fail                | Typed error plus cached/browser apology, no fabricated diagnosis or save; draft phase/facts roll back.                                                                      |
| TTS sentence two fails              | Text stays available, browser-speech fallback event occupies sentence two, sentences one and three remain ordered; shared concurrency never exceeds two.                    |
| Client abort / barge-in             | TTS cancellation, stale audio ignored, completed-only receipt, signed history retained; abort before STT does not truncate an older reply.                                  |
| Unheard plan / question             | Plan invalidated before consent; unheard question released; no accidental ledger commit.                                                                                    |
| Duplicate turn / broken SSE         | Same-ID replay, no provider/admission double count, client prefix deduplication; explicit abort is not retried.                                                             |
| Malformed tool arguments            | Schema error returned to the model, bounded correction loop; no guard bypass.                                                                                               |
| 26th turn / active time / daily cap | Controlled wrap-up before providers; fakes assert zero new calls.                                                                                                           |
| Rate limit / access / origin        | Typed rejection, real Retry-After, optional-code paths, strict origin and trusted-proxy tests.                                                                              |
| Session expiry                      | Last activity controls 30-minute idle TTL; active and turn caps remain separate; expired sessions offer a new call.                                                         |
| Provider/key absence                | Honest configuration errors and healthy keyless startup; no fake production-provider mode.                                                                                  |

The suite also covers filler timing/coalescing, cache degradation, actual playback completion, repeated VAD end callbacks, half duplex, metric/schema bounds, replay eviction, price changes and response/log redaction. Ordinary Vitest runs prohibit live network access; Playwright intercepts test HTTP only.

## Admission and cost caps

The token bucket allows a burst of 40 turns and refills over ten minutes, keyed by authenticated proxy-supplied IP when available. Arbitrary forwarded headers cannot select a bucket. Next.js does not expose an authentic peer socket IP in this route, so unverified peers conservatively share one bucket. A proxy must hold `TRUSTED_PROXY_TOKEN` and supply a valid `X-Real-IP`; future proxy configuration is P6 work.

The process-local daily accepted-attempt cap defaults to 800 and resets at midnight Asia/Kolkata. It is checked before provider construction/work and resets on process restart. Conversation sessions retain 25 normal turns, ten active minutes and a 30-minute idle TTL. Replay and idempotent confirmation do not spend another allowance. Uploads retain the 1 MiB and 28-second PCM/WAV checks. Optional `DEMO_ACCESS_CODE` is empty by default; when configured, the user enters it in a password field and it stays in memory. Expected access/proxy/admin secrets are server-only and compared using timing-safe hashes.

Same-origin validation rejects cross-site browser requests and spoofed origins, permits absent Origin for CLI requests, and handles the explicitly configured HTTPS DOMAIN behind an internal HTTP listener without trusting forwarded hosts/protocols. Real production checks rejected premature confirmation with 409 and a spoofed origin with 400. Controlled fake tests cover cap/rate paths without consuming paid credits.

## Operational metrics and diagnostics

Pino emits typed operational metadata and redacts credentials, authorization headers and transcripts. `LOG_TRANSCRIPTS` remains false by default. Monotonic turn metrics include STT duration, first LLM text, total LLM work including retries, first TTS including shared-queue wait, first response audio emission, total work, actual tool/model IDs, reported input/output/thought tokens, TTS characters, provider retry/fallback counts and completeness of usage. Optional history-byte measurements describe compaction. Interrupted playback receipts correct an already successful server metric without charging its usage again.

Counters cover accepted/successful/failed/interrupted turns, errors by code, provider fallbacks, tokens, TTS characters and deduplicated filler attempts. Counters last for the process; latency samples keep the last 4,096 accepted turns and the latest report is bounded to 2,048 sessions. Filler deduplication retains 4,096 keys. Successful audio-only samples determine the in-memory first-audio p50/p95. Empty or unavailable values remain null, not zero-duration claims.

Normal health keeps its existing configuration-only shape. Verbose health additionally returns validated pricing/model-rate tables, configuration status, limits, counters and the clip-readiness endpoint, but requires an explicit bearer `INTERNAL_METRICS_TOKEN`; unauthorized requests receive 404 even with localhost Host headers. This is stricter than the old localhost-only wording because a header cannot prove the peer is local. P6 must still block verbose diagnostics at the public proxy. `?debug=1` fetches actual latest per-session metrics using the session capability and optional access code; missing or incomplete usage is shown as unavailable. The existing SSE contract did not gain invented token/cost fields.

Real production checks returned normal health 200, unauthorized verbose 404 and authorized verbose 200. Comparison against both privately configured provider key values found no response/log hits and no seller transcript in structured logs. Final source/history/client-bundle scan results appear below. Session/day combined costs remain null when failed-attempt usage, model allocation or exchange rate is unavailable.

## Paid evaluation: scope and actual outcomes

`npm run eval` now runs the actual Gemini adapter, orchestrator and deterministic tools, plus a separate configurable seller-simulator instance at temperature zero. Each persona repetition owns a fresh session and private ledger directory. Canonical openers ensure off-topic, empty and injection cases are exercised; later seller replies come from the simulator. Each run is bounded to ten turns, with smaller bounded negative-case endings. Every must/must-not rule, speech lint, question limit, eligible action, later explicit acceptance, ledger match and Day-7 date is checked. Failures and partial traces are retained.

Supported scope is **S1–S7, S9 and S10: nine personas × three runs = 27**. S8 Hinglish belongs to P7. P5's interim gate is **25/27**. The original **27/30** release gate in docs/07 is explicitly pending S8; neither 27/27 nor 27/30 is claimed. Models, prompt version, tool arguments/results, timeline, simulator usage, history, proposed/accepted actions and ledger records are stored under ignored `.data/evals/`.

Preflight prints estimated requests/tokens/cost and requires `--confirm-spend`; misspelled/repeated/missing options fail before any provider work. A shared logical request ceiling and conservative UTF-8-based token reservation cover agent/simulator work and configured attempts. Unknown failed-attempt reservations are not released as though they were free. Explicit token and request limits stop the run safely.

| Check                                 | Result                                                                                                                                               | Evidence                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Required scripted P3 S1 baseline      | **Passed**, four turns, DONE, two investigation questions, three eligible actions, exactly one matching isolated ledger record, follow-up 2026-11-18 | `.data/p5-s1-d63e1c9c548745fabb17ceb224983ec5/chat/S1-1794345531640-233cbf0b-45b2-4f47-b05c-cd351c9bb233.json` |
| Approved simulator S1, one repetition | **Failed: 0/1, 0%**; correct findings/questions/three-action proposal, no ledger write                                                               | `.data/evals/run-THqu5G/summary.json` and `S1-1.json`                                                          |
| Full supported persona gate           | **Not run**, user authorized pilots only                                                                                                             | 25/27 interim gate remains pending                                                                             |

In the failed simulator pilot, a conservative consent guard rejected “Yes, I explicitly accept the proposed plan.” The simulator then said “Yes, please save the plan.”; that fifth turn received PROVIDER_REJECTED before a successful model response. The exact provider-side rejection reason was not retained; it cannot be attributed conclusively to signatures, history compaction or the current tool set. No error was suppressed, no fake success substituted and no ledger record was written. The rejected explicit-acceptance wording was then reproduced in failing unit/integration tests and corrected offline with an anchored full-utterance alternative. Negation, conditions, questions, injection, literal-quote support, earlier-plan ownership, eligibility and heard-plan checks remain enforced. Both the original and newly supported phrases now complete the four-turn fake-provider flow with exactly one ledger line and idempotent replay. No additional live call was made after this correction, so the actual simulator result remains failed. A future bounded retry and sanitized provider-status diagnosis need paid authorization before the broader gate.

## Latency pilot and comparison

The approved command was `npm run bench -- --count 1 --base-url http://127.0.0.1:4101 --generate-fixtures --max-tokens 50000 --confirm-spend`. It generated **one** non-sensitive synthetic source WAV once, then posted it through real Sarvam STT → real Gemini tools → real Sarvam TTS. The committed source is mono 16 kHz PCM, **3.12 seconds**, with model/speaker/source text recorded in `tests/fixtures/voice/manifest.json`. Generation skips existing recordings. Nineteen remaining recordings and the complete twenty-turn benchmark were not authorized and were not run. Twenty representative source texts cover rupees/lakh/kurti/saree/supplier/stock/dispatch; their audio coverage is still pending.

Private report: `.data/bench/latency-1794346727708.json`, created **2026-11-10T21:38:47.708Z** (2026-11-11 in India). Environment: local standalone HTTP, Windows 10.0.26200, Intel Core i5-1240P, Node v22.13.1. Machine hostname is retained privately; physical/network region was not supplied. This is not an India-to-public-endpoint benchmark.

| Stage                                  |   n |       p50 ms |       p95 ms |
| -------------------------------------- | --: | -----------: | -----------: |
| STT                                    |   1 |        605.5 |        605.5 |
| First LLM text, from turn start        |   1 |     11,646.9 |     11,646.9 |
| LLM total, including tool rounds/retry |   1 |     11,078.8 |     11,078.8 |
| First TTS, including queue wait        |   1 |      2,123.4 |      2,123.4 |
| First response audio, HTTP SSE receipt |   1 | **13,926.4** | **13,926.4** |
| Server total                           |   1 |     13,855.9 |     13,855.9 |

With one sample, p50 equals p95 mechanically; these are descriptive pilot statistics, not established percentiles. Server first-audio emission was 13,838.7 ms. The client measurement begins before upload and ends when the first actual response audio SSE event arrives; it excludes filler, VAD hangover, decode/scheduling and device output. The runner records stage counts, raw timings, events, successful usage, actual model IDs, machine metadata, known cost components and partial failures. It supports local/public URLs and a supplied region, with spend confirmation and token limit.

P3's human Chrome median was **11,768 ms (11.77 seconds)** across three reported voice turns. It measures last VAD speech frame through scheduled Web Audio playback. The P5 HTTP pilot is **13.93 seconds**, with a different boundary and sample count. There is no matched before/after comparison and **no supported voice-latency improvement**. The 3.7-second p50 / six-second p95 targets are not met by this pilot; the full gate remains unmeasured.

Gemini was the bottleneck: four successful serial model invocations plus one primary retry consumed about 11.08 seconds, versus 0.61 seconds STT and 2.12 seconds first TTS. Both current models support MINIMAL thinking; the configured primary already uses it. TTS starts at the first approved complete sentence and is limited to two concurrent requests. The first numeric finding is domain-controlled; no evidence checks, seller questions or commit guards were removed to make it appear faster.

After measuring, an experimental helper summarized only large, successful, consumed unsigned tool responses after a completed turn. It retains factual whitelists, function names/IDs and original signed model Content objects without mutation; errors, interrupted/unresolved exchanges and plan/commit results remain exact. The pilot's first completed history shrank from 11,259 to 4,287 bytes (about 62%). This affects later-turn context, not the first-turn serial tool path. The simulator continued through several summarized-history turns but did not complete acceptance. **COMPACT_TOOL_HISTORY defaults to false** until a successful real acceptance continuation validates the optimization. It is tested offline and can be opted into for a later approved comparison. No matched post-change voice benchmark was authorized. The smallest next latency experiment is batching mandatory read tool calls in one model round while preserving readiness/evidence guards, followed by full persona validation; it was not implemented speculatively here.

## Models, tokens and cost

All model/provider names remain environment-configured. Actual successful agent/simulator/pilot model: **gemini-3.5-flash-lite**; configured fallback **gemini-3.6-flash** was not used in these P5 pilots. STT **saaras:v4**, TTS **bulbul:v4-flash**, speaker **shubh_enhi_ads**, 24 kHz provider output. Static system prompt version remains **3.0.0**; dynamic context adds heard/interrupted playback information. Gemini SDK is 3.0.0; MINIMAL thinking is explicit, includeThoughts is false, SDK automatic function execution/retries are disabled and application retries are bounded. The simulator is a separate instance/configuration at temperature zero.

| Run                                                    | Successful reported input | Output | Thoughts | Completeness                                                             |
| ------------------------------------------------------ | ------------------------: | -----: | -------: | ------------------------------------------------------------------------ |
| Scripted S1 baseline, twelve successful agent requests |                    54,607 |    442 |        0 | One primary retry; failed usage unknown                                  |
| Simulator S1, twelve successful agent requests         |                    36,457 |    441 |        0 | One primary retry plus rejected fifth-turn request; failed usage unknown |
| S1 seller simulator, four requests                     |                       936 |     73 |        0 | All reported single attempts                                             |
| Voice pilot, four successful agent requests            |                    10,836 |     90 |        0 | One primary retry; failed usage unknown                                  |

The simulator run used **17 logical requests** and ended with **120,426 conservatively reserved tokens** against 600,000 / 60 limits. Reserved tokens include unknown attempted usage and are not actual billed tokens. Do not compare token totals between the two S1 runs as a controlled optimization gain: their seller utterances, history and completion differ.

Prices were verified **2026-11-11** against [Google AI Studio pricing](https://aistudio.google.com/docs/pricing) and [Sarvam API pricing](https://www.sarvam.ai/api-pricing). Standard paid USD rates per million input/output tokens: 3.5 Flash Lite **0.30 / 2.50**; 3.6 Flash **0.75 / 3.75** through 2026-12-31, then 1.50 / 7.50. Output pricing includes thought tokens. Saaras v3/v4 **INR 0.49/minute**. Bulbul v4 Flash **INR 1/1,000 characters** through 2026-11-12, then INR 2; v3 INR 3. A validated `PROVIDER_PRICING_JSON` table can override defaults, with source/date and billing units explicit in `cost.ts`. Speech pricing has its separate source/date constant. No cached-token discount, grounding fee or exchange rate is assumed.

The scripted S1 successful-request subtotal is **USD 0.0174871**. The failed simulator S1 successful agent+simulator subtotal is **USD 0.0125029**. Neither is the full bill because failed/retried attempt usage is unavailable. Voice-pilot known components are **INR 0.02548 STT** (3.12 seconds) and **INR 0.208 reply TTS** (208 characters); LLM and combined cost remain null because that turn retried. These components exclude one-time source recording, greeting and cache warming. Session/day combined totals stay null with an explicit reason. No arbitrary USD→INR conversion or invented invoice is shown.

## Automated verification and real smoke checks

| Command/check                 | Actual result                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                | Passed ESLint with zero warnings and Prettier.                                                                                           |
| `npm run typecheck`           | Passed strict TypeScript.                                                                                                                |
| `npm test`                    | **338/338 tests passed across 56 files**, including the consent regression; all use fakes/offline network protection.                    |
| `npm run verify-data`         | 36/36 invariants passed, also repeated by build.                                                                                         |
| `npm run build`               | Passed production compile, TypeScript, generation and standalone output.                                                                 |
| `npm run test:browser`        | **7/7 passed in 36.3 seconds**: two real-controller/Web Audio interruption checks plus five existing dashboard/responsive/denial checks. |
| `npm run smoke:sarvam`        | Passed all five real TTS and four STT checks.                                                                                            |
| `npm run smoke:gemini`        | Passed both real signed function-call/continuation requests.                                                                             |
| `npm audit --omit=dev --json` | Zero production vulnerabilities.                                                                                                         |
| Spend preflight               | Eval/bench preflight commands passed without provider work; default compaction flag false, existing pilot fixture reused.                |

Final Chrome software stop dispatch was **0.9 ms with zero completed sentences** and **0.7 ms with one completed sentence**. These are single measurements of dispatch, not physical output latency. Private outputs are `.tmp/p5/chrome-interruption-false.json` and `chrome-interruption-true.json`; they verify played counts zero/one and two total submissions, including the replacement utterance.

Both required live provider smoke commands already passed: Sarvam five TTS and four STT checks; Gemini two streamed requests with signed function continuation. Observed timings and configured field names are summarized in [provider notes](provider-notes.md), with detailed synthetic results/auditions ignored privately. Normal tests never use these providers.

The real standalone profile reported both providers configured, valid six-clip cache, reused greetings, correct HTTP guard responses, one successful real voice turn and zero records in its isolated ledger. Final keyless standalone checks returned page/health 200, all ten referenced static assets 200, verbose unauthenticated 404 and internally authorized 200, and honest unconfigured clip state. The restarted development server returned health 200 with both providers configured and zero sessions. These last startup/health checks made no paid provider request. Provider-key comparisons found zero response/log hits and no raw seller transcript logging. Final development readiness and keyless standalone health/asset checks validate startup without additional paid provider warming. Production configuration health means keys are configured, not that a network call was made by health.

## Delegated browser QA versus physical checks

The user delegated QA to the agent. Chrome software tests and controlled fakes were run; the following distinction is deliberate. No physical speaker/headphone, mic-acoustic, background-noise or perceived voice-quality check is marked passed without user confirmation.

| Requested check                         | Observed evidence / remaining check                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Greeting without another click       | Chrome lifecycle/browser tests; real cached greeting WAV valid. Physical audibility unverified.                                         |
| 2. Natural speech with one-second pause | VAD settings preserved; physical mic/pause test not tried.                                                                              |
| 3. Vocabulary recognition               | Synthetic Sarvam smoke passed; only first benchmark fixture generated. Full vocabulary accuracy unverified.                             |
| 4. First-audio timings                  | Real HTTP pilot table above; Chrome/P3 boundary differs.                                                                                |
| 5. Later sentences without gaps         | Ordered pipeline/Chrome playback tested; audible gap quality unverified.                                                                |
| 6. Mid-sentence interruption            | Real Chrome controller/Web Audio tests pass with injected VAD callbacks.                                                                |
| 7. Audio stop under 300 ms              | Software stop-dispatch measurements above; acoustic/device stop unverified.                                                             |
| 8. Reply to the new utterance           | Controller tests verify exactly one new submission, aborted old request and completed-only receipt; no paid acoustic follow-up claimed. |
| 9. Half-duplex toggle                   | Default-on toggle and fallback pause/resume/cooldown covered offline.                                                                   |
| 10. No speaker self-interruption        | AEC and raised playback threshold configured; physical test not tried.                                                                  |
| 11. Background noise                    | Physical test not tried.                                                                                                                |
| 12. Unclear speech/text hint            | Empty recognition twice then TEXT_REQUIRED tested without history pollution.                                                            |
| 13. Browser TTS fallback                | Ordered failed-sentence fallback and cancellation tested with fakes; audible browser voice unverified.                                  |
| 14. Microphone denial/text              | Chrome test runner denial plus controller fallback coverage.                                                                            |
| 15. Offline/online interruption         | Controlled SSE/network retry/replay tests; no physical network-toggle call claimed.                                                     |
| 16. Daily cap/rate wraps                | Controlled fake HTTP tests, no paid traffic used to fill caps.                                                                          |
| 17. End Call releases microphone        | Controller destroy/track-stop lifecycle tests; physical browser indicator unverified.                                                   |
| 18. Natural spoken numbers              | Pure number formatter/style guards tested; pronunciation unverified.                                                                    |
| 19. Card matches spoken plan            | P4 Chrome server-event projection/plan checks and guarded plan speech tests pass.                                                       |
| 20. Acceptance ledger                   | Scripted real S1 baseline saved exactly one matching isolated record; simulator S1 failed and wrote none.                               |

## Deviations, blockers and next work

- Paid scope is one simulator S1 and one voice turn/recording, not 27 persona runs and twenty recordings/turns, as explicitly limited by the user. No full release pass is claimed.
- The simulator S1 failed before commitment. The exact explicit-consent rejection was reproduced and fixed offline, with positive/negative and complete-flow regression tests. Keep the failed trace and validate the correction/provider continuation in a newly authorized bounded pilot before the full gate. Tool-history optimization remains disabled.
- Latency target is unmet, and no post-optimization voice comparison exists. The measured bottleneck is serial Gemini work/retry; cached filler improves waiting feedback without changing measured response latency.
- Physical device and perception tests remain unverified. Browser/controller coverage cannot prove AEC, STT vocabulary accuracy, noisy-room performance, natural pauses or physical stop latency.
- Peer IP is unavailable in the current route; a shared unverified bucket and secret-authenticated proxy identity are conservative substitutes. Verbose health requires a bearer even locally. P6 proxy/deployment configuration remains untouched.
- No transcript-confidence threshold is invented from Sarvam language confidence. Daily/session metrics and budgets are in memory and reset on restart as required; they are not an account billing ledger.
- New direct dependency: **esbuild 0.28.2, development only**, to bundle the actual client controller into the isolated Chrome harness. It was already transitive; no new runtime package was added.

No configuration input is missing. Full paid validation, a bounded failed-pilot investigation and physical confirmation remain external acceptance gates, not assumed approvals.

## Git and private artifacts

At the documentation checkpoint: branch **main**, **46 commits**, latest implementation commit **8f86f68** (`fix: accept explicit agreement to the proposed plan`). Only README/architecture/decision/evaluation/provider/report documentation remains uncommitted. The documentation staging scan compared both configured provider keys against **237 tracked files**, all Git patch history and **14 generated browser static files**; every hit count was **zero**. This report's own final commit cannot contain its own hash; the delivery message supplies that hash, total count and verified clean status. The original 41 commits and all subsequent P5 commits are preserved. No amend, reset, clean, rebase, history rewrite or push was used.

Only the explicitly approved non-sensitive synthetic benchmark WAV and its manifest are committed as audio. Provider auditions, real synthetic traces, runtime ledgers, tokens, logs, other generated artifacts, `.env`, `.next`, `public/vad` and temporary browser outputs remain ignored under their established directories. Public documentation contains aggregate measurements, not private keys or machine hostname. The default demo ledger was not changed by isolated evaluation/benchmark ledgers.

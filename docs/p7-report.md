# P7 — Hinglish mode and simulated Day-7 follow-up

Verification date: **2026-11-11, Asia/Kolkata**. P7 implementation is complete; live Hindi verification and physical language quality are pending. Hindi remains disabled (`HINGLISH_ENABLED=false`) until the bounded smoke is explicitly approved and passes. No paid P7 provider run was authorized or executed. This report does not claim the complete release definition of done or close the P5 gates.

## 1. Language implementation

English stays the default. Session language and mode are immutable across draft replacement. The selector locks during a call and supports starting a fresh English call after Hindi. Hindi uses the Roman Hinglish prompt addendum, respectful business vocabulary, unchanged product names and deterministic Indian-number formatting. Original Roman or Devanagari transcripts/quotes are retained; normalization is for validation only. Prompt version is **4.0.0**.

Hindi evidence and consent checks preserve phase, quote, feasibility and commitment guards. Danda punctuation and decimal-safe chunking are supported. English speech validation was not relaxed. A new regression tightened both language fact validators after testing found that a statement about partial restock could incorrectly imply intermittent dispatch.

## 2. Provider profile and exact contracts

| Effective request | Model             | Language | Mode / speaker   | Pace / output |
| ----------------- | ----------------- | -------- | ---------------- | ------------- |
| English STT       | `saaras:v4`       | `en-IN`  | `transcribe`     | PCM WAV input |
| Hindi STT         | `saaras:v4`       | `hi-IN`  | `codemix`        | PCM WAV input |
| English TTS       | `bulbul:v4-flash` | `en-IN`  | `shubh_enhi_ads` | 1; 24 kHz WAV |
| Hindi TTS         | `bulbul:v4-flash` | `hi-IN`  | `shubh_enhi_ads` | 1; 24 kHz WAV |

These are the current local configured profiles, with selected-language routing applied. The base English STT setting remains `unknown` in the older configuration; the session profile now sends explicit `en-IN`. The prior auto-detect smoke does not establish the accuracy of forced-language recognition. Model, mode, speaker and pace remain configurable. Current official language/speaker documentation and conflicting older wording are recorded in [provider-notes.md](provider-notes.md). Documented Hindi compatibility is not a new live success claim.

TTS retains the verified REST fields: `text`, `language_code`, `model`, `speaker`, `pace`, `speech_sample_rate`, `output_audio_codec`. No speculative preprocessing/pitch fields were added. Greeting and filler/reprompt/apology/wrap-up audio are isolated by language, model, speaker, pace, sample rate and text/clip identity; all languages share the two-slot limiter.

## 3. Live smoke scope and result

`npm run smoke:sarvam -- --hinglish --preflight` printed a maximum of **two requests, zero retries**: one short Roman Hinglish synthesis, then one code-mixed recognition request using that synthetic WAV. The planned text is “Meri sale gir gayi hai. Supplier late hai, stock check karte hain.” No Gemini call or repeated audition is included.

Fresh approval was requested after offline tests passed. No answer approving that scope was received during this work. **Live requests attempted: 0; successful: 0; failed: 0; outcome: not run.** No Hindi audio quality claim is made and the local UI gate remains off. After approval, the exact command is `npm run smoke:sarvam -- --hinglish --confirm-spend`. Failed synthesis stops before STT; failures are reported without silently substituting providers.

## 4. English regression

The original recovery flow, required snapshot/SKU/cancellation reads, three-question cap, domain actions, later explicit consent, heard-proposal invalidation, signed model history and append-only commitment behavior remain covered by offline regressions. English greeting failure retains its prior admission failure behavior. Hindi failure keeps text and emits the existing fallback event; browser Hindi fallback requires an installed Hindi voice.

Automated Chrome covers English dashboard operation, confirmation pending/failure/decline, session reset and real Web Audio interruption with synthetic audio. This is scheduling/control evidence, not a new physical English voice test or latency benchmark.

## 5. S8 and F1 evaluation

S8's four-turn fake-provider conversation passes: Hinglish concern, quoted stock/supplier facts, “Das din,” then explicit later agreement. It performs the same required reads, asks two investigation questions, proposes the same three deterministic actions and writes one commitment. The audio path requests `hi-IN`; Devanagari recognition evidence is preserved. Pure English model text cannot switch the final response out of Hinglish.

S8 is now in the ten-persona harness. `npm run eval -- --persona S8 --runs 1 --preflight` passed without calls: one planned run, roughly sixteen successful requests, primary-only estimate US$0.019, bounded reservations/requests. The real run was **not executed**. The CLI requires `--confirm-spend`; prior P5 pilot approval is not reused. A pilot cannot satisfy the full 27/30 gate.

F1 is reported separately. `npm run eval -- --scenario followup --fake` passed with no failures and zero external calls. It seeds a synthetic S1 plan through the real UI commitment guard, then runs the full Day-7 conversation. Result: `get_followup_status` and `commit_action_plan`; all five review phases; Partial/Done/Done; one audit and one new accepted plan; original unchanged. Private trace: `.data/evals/F1-BXtiLG/F1.json`.

The optional F1 live preflight passed: four Gemini text requests, conservative maximum sixteen HTTP attempts, 150,000 reserved-token cap, four logical-request cap, primary-only estimate US$0.015. No Sarvam requests or live evaluation were made. Reports record configured/actual models, language, prompt version, tools, phases, statuses and ledger changes. Private traces stay ignored.

## 6. Follow-up session and data mapping

`POST /api/session` accepts `mode:"followup"`, the exact committed `planId`, selected language and optional UUID `followupRunId`. Production lookup reads the validated durable ledger, including older records outside the latest twenty. Missing, unknown, proposed-only and unrelated seller plans are rejected before synthesis. Original seller ID and accepted action IDs are checked.

The separate flow is **FOLLOWUP_INTRO → AUDIT → RE_DIAGNOSE → NEXT_STEPS → DONE**. The greeting discloses AI identity, the illustrative simulated review and its one audit/feasibility question. The first seller reply reads the bound status tool and advances the review. A resumed recorded audit does not ask another audit question. Internal S1 commit substates are reused only to apply the existing transaction guards; public review phases and metric phase traces remain distinct.

The simulated date is the original commitment's injected Asia/Kolkata business date plus seven days. A simulated review-plan parent carries its explicit simulated date for the next review. Real ledger timestamps remain real. The fixture is unchanged:

| Item                           |  Value |
| ------------------------------ | -----: |
| Window                         | 7 days |
| Orders                         |     83 |
| Orders/day                     |   11.9 |
| Baseline orders/day            |    9.0 |
| Overall cancellation rate      |   9.6% |
| OOS listings                   |     11 |
| Cotton printed kurti set stock |     60 |
| Printed georgette saree stock  |      0 |
| Straight kurti-pant set stock  |      0 |

Only supplied Day-7 SKU stocks enter the review's current inventory. Older SKU orders serve priority sorting, not seven-day concentration or forecasts. Equal-window derived counts/sales are internal engine inputs and are never displayed as new observed metrics. The original monthly Snapshot stays separately labelled.

## 7. Action audit

For the accepted S1 plan: restock is **Partial**, stock sync **Done**, in-stock promotion **Done**. Only accepted seller actions appear. Missing statuses show **Not available**; checkpoint/KAM actions and unaccepted proposals are excluded. Status output is parsed with Zod. `get_followup_status` takes strictly empty arguments and is exposed only in AUDIT.

Declarative seller corrections retain their entire exact quote and a seller-reported source. Negation, conflicting clauses, questions, conditional language and instructions cannot manufacture a completion status. Unrecognized wording leaves the sample source intact; the audit record retains the utterance. Status extraction is conservative and is not a general Hindi-language understanding claim.

## 8. Re-diagnosis and recommendations

The existing diagnosis engine compares equal windows using current overall cancellation rate, OOS listings, current mapped SKU stock, audited statuses and validated seller facts. Old SKU concentration and cancellation-reason counts are excluded. Review-only table weights add STOCK +2 for remaining zero-stock priority products and +1 for partial restock; S1 weights are unchanged. With no carried seller facts, the fixture yields STOCK score 3, medium. Validated carried facts remain additional inputs; missing historical facts are unknown, and old ETAs are discarded.

The fixture's eligible next step is further priority restock for saree and kurti-pant. Completed stock sync and promotion are excluded. The same catalog rechecks feasibility and price evidence; a seller who cannot restock receives no invented feasible plan. Restock can reopen despite a reported Done status only when mapped priority products still have zero stock. Plans contain at most two seller actions; ordinary S1 plans still require two or three. There is no new monthly recovery ceiling. Next review is seven simulated days later.

The fixture supports a lower **overall** cancellation rate, not reduced stock-unavailable reason counts. The requested story about stock sync causing fewer stock cancellations cannot be established from the data. Speech/UI explicitly avoid that causal claim. The model cannot invent metrics/statuses or reorder approved speech so the save question precedes the plan.

## 9. Ledger integrity and idempotency

Audits append to `DATA_DIR/followup-audits.jsonl`, with validated plan/run ID, simulated date, actual timestamp, rows, seller quote, facts and phase trace. Writes serialize per file; identical records are idempotent and conflicts fail closed. Directory/file modes remain 0700/0600. A disk test verifies the original `ledger.jsonl` bytes are unchanged by the audit.

Review proposal IDs use `review-<run UUID>`. Recorded audits restore after session removal/expiry; unfinished runs must present a proposal again. Completed runs return the existing commitment. A new plan needs an earlier complete proposal, fresh explicit quote or UI acceptance, current eligibility and successful durable append. Interruptions invalidate unheard proposals. Replay does not duplicate the audit, decline writes no new plan, and a failed audit append rolls the session back. No database or localStorage state was added; one process/one replica remains the persistence model.

## 10. Browser and mobile

All **10 Chrome tests passed** in the final browser run (about two minutes): the original seven dashboard/interruption tests, language selection/locking/fresh English reset, and desktop/mobile Day-7 acceptance. The final server-only conditional-status guard was subsequently verified by focused domain/integration/F1 tests; it does not change the dashboard bundle or browser mocks.

Keyless standalone server on loopback 4200; provider keys empty; browser routing/fakes only in tests. The test-only Hindi verification flag exercises enabled UI behavior without claiming a live verification. Production has no fake-provider activation path. Desktop 1280px and mobile 390px Day-7 views were visually inspected: statuses, comparison, stock gaps, proposal notice and explicit confirmation remain readable, with no horizontal overflow. Screenshots stay ignored under `.tmp/p7/screenshots/`.

## 11. Commands and results

| Command/check                                         | Result                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                                        | Passed; ESLint strict and Prettier                               |
| `npm run typecheck`                                   | Passed; strict TypeScript                                        |
| `npm test`                                            | 375 tests in 68 files passed after the final Hindi audit guard   |
| `npm run verify-data`                                 | 46/46 invariants passed                                          |
| `npm run build`                                       | Passed; final source revision includes mapped-only current stock |
| `npm run test:browser`                                | 10/10 passed                                                     |
| `docker build --progress=plain -t seller-saathi:p7 .` | Passed, Linux amd64; no P7 ARM runtime claim                     |
| S8/F1 paid preflights                                 | Passed, zero live requests                                       |
| F1 fake CLI                                           | Passed, zero failures                                            |
| Source/history/client secret scan                     | Passed; no configured secret value found                         |
| Exported Docker image secret scan                     | Passed; no configured secret value found                         |

One full test run under simultaneous builds/browser work hit the unchanged five-second S8 test timeout; an isolated rerun and later full suites passed without increasing that timeout. The first language browser test used an incorrect “again” selector for an unsaved ended call; the test now uses the actual Call button. No production guard was weakened to fix these checks. No new dependency was added.

The final Linux amd64 image is `sha256:e092ec3bea793256c285df26c6f90e72060d020a2a6db14c82cefb2b02117246`. The exported image scan decoded twelve layers and twenty-one archive entries, checking two privately configured secret values: zero matches. The final source/history/client scan covered 298 source files and fifteen client assets, also with zero matches. Secret values were never printed.

## 12. Physical voice checklist

All physical items below are **not tried in P7**. First approve/run the bounded Hindi smoke and enable the verified profile privately, then restart the app. Use the actual SellerSaathi localhost port or HTTPS origin; port 3000 on this machine currently belongs to another application. Automated synthetic audio cannot certify pronunciation or microphone recognition.

1. [ ] Start a Hindi/Hinglish call and hear its AI greeting.
2. [ ] Say “Meri sale gir gayi hai.”
3. [ ] Check the exact transcript; retain either returned script.
4. [ ] Hear a natural, respectful Roman Hinglish reply.
5. [ ] Check product names, numbers, rupees and lakh pronunciation.
6. [ ] Complete a short recovery conversation and explicitly accept its plan.
7. [ ] End Call and confirm the microphone indicator stops.
8. [ ] Start a fresh English call; check greeting/replies and absence of Hindi/cache contamination.
9. [ ] Commit the S1 plan with a later explicit acceptance.
10. [ ] Click Fast-forward 7 days for that saved plan.
11. [ ] Check the simulated label, date, baseline and Day-7 audit.
12. [ ] Check Partial restock, Done sync/promotion, remaining saree/kurti-pant stock gaps; try one literal correction.
13. [ ] Confirm next steps remain proposed and unsaved before acceptance.
14. [ ] Explicitly accept a new plan and check the separate saved record; also try Not Now on another run.

Repeat relevant speaking/listening checks with laptop speakers and headphones. Naturalness, audible gaps, self-interruption, physical stop latency and real microphone accuracy remain unverified. The P5 speaker/headphone/phone QA checklist remains open.

## 13. Limitations and preserved release gates

Roman Hinglish synthesis and code-mixed recognition are implemented but not live-verified here. Official native-script pronunciation guidance does not establish Roman output quality. Browser Hindi fallback needs an installed Hindi voice; otherwise text remains available. Speech guards favor conservative supported wording and cannot establish naturalness by themselves.

The corrected P5 simulator S1 rerun is still pending after its 0/1 pilot. Full paid persona evaluation (now ten × three), twenty-turn benchmark, remaining fixture recordings, public-India latency and physical QA are pending. The P5 one-turn HTTP first-audio baseline remains **13.93 seconds**; no improvement or p50 target pass is claimed. P3's **11.77-second** Chrome median used a different boundary. `COMPACT_TOOL_HISTORY=false` remains unchanged. P6 public proxy/IP trust, cloud/reboot checks and native ARM host health/capacity remain deployment acceptance work. No P5/P6 limitation was closed by this feature work.

## 14. Git verification

Started from clean `main`, 56 commits, `f485f8d`, preserving all previous commits. The verified code checkpoint is `main`, 64 commits, latest `2a96ef9` (`fix: preserve conditional Hindi audit evidence without false completion`). The documentation/report commit adds one more, bringing the final count to 65; its hash and clean-tree check are recorded in the final response. The final report commit is described in the final response rather than attempting to embed its own self-referential hash. Source changes were reviewed/staged explicitly in logical commits; private env, audio, traces, build outputs and temporary files remain ignored. No reset, clean, rebase, amend or history rewrite was used.

## 15. Scope and open work

Exactly P7 language support and simulated follow-up were implemented. No new dependency, database, real Snapdeal API, authentication, telephony, agent framework, cloud infrastructure or P8 feature was added. Nothing was pushed and **no AWS resources were created**. Existing unrelated services/containers were left alone. Remaining work requires the requested fresh Hindi-smoke approval, optional separately approved live S8/F1 evaluations and the user's physical checklist; none is reported as passed.

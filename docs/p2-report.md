# P2 implementation and verification report

Verified locally on 10 November 2026, Windows, Node.js 22.13.1 and npm 10.9.2. P1's 14 commits and domain implementation were preserved. P2 is an echo transport slice; no Gemini integration or later-phase agent work was started.

## Implemented behavior

- Browser microphone with echo cancellation, noise suppression, automatic gain control and mono capture; installed Silero v6 VAD resamples to 16 kHz. PCM16 WAV encoding reuses vad-web's utility. A capture timer and independent server validation enforce the 28-second recording limit.
- Four pinned, local VAD/ONNX assets copied by an idempotent postinstall script. Runtime paths are explicitly `/vad/`; ONNX uses one WASM thread and no proxy worker.
- Model-independent STT/TTS interfaces with abort propagation and deterministic fakes. Sarvam adapters validate requests, responses, base64 and actual WAV structure, use six-second attempts, and allow at most one retry for 429/5xx within a thirteen-second default total deadline. Other 4xx and timeouts are not retried. Retry-After values beyond the bounded wait return a controlled error rather than retrying early.
- POST `/api/turn` supports bounded multipart WAV and JSON text input, validates opaque call IDs and browser origin, streams the documented echo events incrementally, runs up to two TTS jobs in flight, and emits audio in index order. It has Node runtime, force-dynamic rendering and the required SSE caching/buffering headers. Server `turn` is 1 for each stateless request; the browser counts turns within a call.
- Incremental UTF-8 SSE parser supports LF/CRLF, fragments and final flush, with Zod payload/sequence validation and controlled malformed-stream/early-EOF errors. No EventSource is used.
- Web Audio queue serializes decoding, schedules adjacent buffers at the previous end time when available, tracks active sources, and invalidates late decodes on stop. One lazily created AudioContext is resumed after Call/Send, suspended at End Call and closed on unmount.
- Half-duplex lifecycle pauses VAD through processing and playback, waits for the audio queue plus a 200 ms tail, then resumes listening. End Call aborts requests and stops sources/tracks. Old callbacks cannot mutate a new call. A permission result granted after cancellation releases its tracks immediately. Denial, initialization, provider, network and playback errors leave an actionable text path.
- Responsive, accessible Call/End Call console, state orb, transcript, text fallback and optional `?debug=1` timing panel. No localStorage, server session persistence, LLM, diagnosis UI, barge-in, deployment or new database.
- Live smoke script uses the application adapters and validated configuration, generates five audition WAVs, compares four STT combinations, and appends factual dated notes. Missing credentials exit 1 with setup guidance; application startup remains healthy without credentials.

## Repository tree

The important P2 files below supplement the unchanged P1 domain/data/ledger foundation. The complete tracked tree is available with `git ls-files`.

```text
seller-saathi/
├── .env.example                         validated speech settings; no credentials
├── package.json / package-lock.json     pinned dependencies and real scripts
├── scripts/
│   ├── copy-vad-assets.mjs
│   └── smoke-sarvam.ts
├── public/vad/                          generated, ignored
│   ├── vad.worklet.bundle.min.js
│   ├── silero_vad_v6.onnx
│   ├── ort-wasm-simd-threaded.mjs
│   └── ort-wasm-simd-threaded.wasm
├── src/
│   ├── app/
│   │   ├── api/turn/route.ts
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── VoiceConsole.tsx
│   │   └── VoiceDebug.tsx
│   └── lib/
│       ├── agent/chunker.ts
│       ├── client/
│       │   ├── audio-queue.ts
│       │   ├── browser-audio.ts
│       │   ├── browser-microphone.ts
│       │   ├── sse-parser.ts
│       │   ├── sse.ts
│       │   ├── useVoiceCall.ts
│       │   ├── vad-settings.ts
│       │   ├── voice-call.ts
│       │   ├── voice-state.ts
│       │   └── wav-encode.ts
│       ├── server/
│       │   ├── config.ts
│       │   ├── echo-turn.ts
│       │   ├── same-origin.ts
│       │   ├── sse.ts
│       │   ├── turn-input.ts
│       │   └── voice-errors.ts
│       └── voice/
│           ├── abort.ts
│           ├── events.ts
│           ├── fakes.ts
│           ├── limits.ts
│           ├── providers.ts
│           ├── sarvam-contracts.ts
│           ├── sarvam-http.ts
│           ├── sarvam-stt.ts
│           ├── sarvam-tts.ts
│           ├── sarvam.ts
│           └── wav.ts
├── tests/
│   ├── agent/chunker.test.ts
│   ├── client/                            five files; 32 tests
│   ├── integration/turn-echo.test.ts
│   ├── voice/{providers,wav}.test.ts
│   └── setup.ts                          rejects live fetch in normal tests
└── docs/
    ├── provider-notes.md
    └── p2-report.md
```

## Actual provider smoke results

`npm run smoke:sarvam` succeeded at `2026-11-10T15:07:18.541Z`: **five TTS and four STT successes, zero API errors**. No unnecessary v3 TTS comparison was made. Results are synthetic-audio round trips, not microphone accuracy or voice-quality scores.

Working TTS: `bulbul:v4-flash`, REST `language_code=en-IN`, `speech_sample_rate=24000`, `output_audio_codec=wav`, pace 1.

| Successful speaker      | Measured request ms | Ignored audition WAV                                       |
| ----------------------- | ------------------: | ---------------------------------------------------------- |
| `shubh_enhi_ads`        |              2151.9 | `.data/audition/bulbul-v4-flash-shubh_enhi_ads.wav`        |
| `ishita_enhi_customer`  |              2118.7 | `.data/audition/bulbul-v4-flash-ishita_enhi_customer.wav`  |
| `shalini_enhi_customer` |              1538.8 | `.data/audition/bulbul-v4-flash-shalini_enhi_customer.wav` |
| `simran_enhi_customer`  |              1503.0 | `.data/audition/bulbul-v4-flash-simran_enhi_customer.wav`  |
| `sunny_enhi_customer`   |              1323.3 | `.data/audition/bulbul-v4-flash-sunny_enhi_customer.wav`   |

STT used `language_code=unknown` on the first successful generated WAV:

| Successful model | Mode         | Measured request ms |
| ---------------- | ------------ | ------------------: |
| `saaras:v4`      | `transcribe` |              1498.3 |
| `saaras:v4`      | `codemix`    |              1706.1 |
| `saaras:v3`      | `transcribe` |              1695.8 |
| `saaras:v3`      | `codemix`    |              1673.3 |

On this synthetic English/Hinglish sentence, v4 rendered the Hindi phrase in English in both modes; v3 preserved Roman Hindi. Default model selection remains configurable. All transcripts, official contract links and limitations are in [provider-notes.md](provider-notes.md); ignored machine-readable results are in `.data/audition/smoke-results.json`.

## Verification

| Command or check                   | Observed result                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                     | ESLint zero warnings; Prettier passed                                                                                                 |
| `npm run typecheck`                | strict TypeScript passed                                                                                                              |
| `npm test`                         | **204 tests passed across 25 files**, including all 115 P1 tests; fakes/injected HTTP only                                            |
| `npm run verify-data`              | **36/36** invariants passed                                                                                                           |
| `npm run build`                    | Standalone production build and data gate passed, including the final hostname regression fix                                         |
| `node scripts/copy-vad-assets.mjs` | Four actual installed assets copied; repeated invocation succeeded                                                                    |
| `npm run smoke:sarvam`             | Nine live successes listed above                                                                                                      |
| Smoke without credentials          | Exit 1; instructs private local `.env` configuration; no live request                                                                 |
| `npm audit --omit=dev`             | Zero vulnerabilities                                                                                                                  |
| Development startup                | `npm.cmd run dev -- --hostname=127.0.0.1 --port=3000`; home, health and local assets HTTP 200                                         |
| Production startup                 | `PORT=4101`, `HOSTNAME=127.0.0.1`, `npm start`; standalone server started                                                             |
| Production page/health/assets      | HTTP 200; JS/MJS `application/javascript`, ONNX `application/octet-stream`, WASM `application/wasm`                                   |
| Private key presence scan          | Zero matches in production browser assets, tracked files and Git patch history; `.env` ignored                                        |
| Browser text interaction           | Live text echo rendered; Web Audio completed and returned to Ready for text; End Call returned to Ready to start                      |
| Mobile layout                      | Isolated browser's narrow viewport rendered the input, Send button and transcript without horizontal clipping; no physical phone test |

Development HTTP streaming was observed before the UI check: transcript at 2401 ms, sentence at 2402 ms, audio/done at 5874 ms (including cold compilation). These arrival times show events were sent before TTS finished. A subsequent browser text turn recorded **2051 ms** from Send to scheduled playback, STT 0 ms, first TTS 1343 ms, server total 1366 ms. Neither result is a manual speech-to-audible-audio measurement or a guarantee of the architecture's 3.7-second target.

Production checking exposed Next standalone's normalization of `request.url` to localhost. The origin guard now compares against the validated incoming Host authority using the request protocol; it does not trust forwarded-host headers. Regression tests accept the actual same-origin host and reject different/opaque origins. This is a P2 local-server correction, not deployment configuration.

After the fix and rebuild, the real production POST using `http://127.0.0.1:4101` as Origin returned HTTP 200 with `text/event-stream`, `Cache-Control: no-cache, no-transform`, and `X-Accel-Buffering: no`. Transcript/sentence arrived at **135 ms**, audio/done at **1283 ms**; server timings were STT 0 ms, first TTS 1246.4 ms, total 1260.9 ms. Invalid text returned sanitized HTTP 400. The production page, health, four assets and key-presence scan passed again on the final build. The production server was stopped after verification; development remains available on port 3000.

All VAD/ONNX URLs are configured to local paths and asserted in the mocked browser adapter test. All four assets were fetched successfully from development and production servers. A Chrome Network-panel capture of a microphone session was **not** obtained, so absence of CDN requests is established by configuration/tests, not a recorded browser network trace. No provider key is passed by the client fetch implementation; actual browser traffic was not exported for inspection.

## Manual voice evidence and remaining checks

The user reported **five transcript/echo pairs**, four English and one Hindi in Devanagari, during the Chrome test request. Their text is not copied into repository reports. This confirms the reported console results; the user did not supply the debug table or explicitly confirm audible playback/return-to-listening.

| Reported turn | Content           | First-audio latency |
| ------------- | ----------------- | ------------------- |
| 1             | English           | Not supplied        |
| 2             | English           | Not supplied        |
| 3             | English           | Not supplied        |
| 4             | English           | Not supplied        |
| 5             | Hindi, Devanagari | Not supplied        |

**Manual first-audio p50: unavailable.** No estimates replace the missing measurements. Debug measures the last VAD speech frame to scheduled Web Audio start and omits physical device output latency. Five perceived audible-onset values still require human measurement. Mixed English/Hindi microphone quality, audition preference, audible glitches, Chrome denied-permission behavior and End Call/restart confirmation remain unreported. Automated tests cover denial/text fallback, half-duplex recovery, pending permission cancellation, old callbacks and repeated calls. The isolated browser's microphone request was ended while setup was pending; no microphone permission was granted through automation.

## Deviations and scope decisions

- Corrected older design-pack provider assumptions using current official contracts plus live results: v4 defaults, `language_code`, persona speaker IDs and one validated audio output. There is no speculative language-field switch or concatenation of unrelated outputs. README, architecture and tech decisions now reflect this.
- P2 uses a stateless call identifier and the smaller specified event set. Server sessions, LLM/tool events, browser speech-synthesis fallback, cached greetings/fillers and barge-in remain their assigned future phases. Retry is a user action at the turn level; HTTP provider retries remain bounded.
- The minimal debug panel reports measured transport/playback timings, not business metrics or a P4 dashboard. AI usage and mock-data status are disclosed in the page; the P3 spoken greeting is not implemented in the echo slice.
- No human listening quality, five-turn latency target or full manual acceptance is claimed from automated results. Audible confirmation and the remaining browser checks are the open items.

## New dependencies

- `@ricky0123/vad-web@0.0.31`: installed Silero v6 microphone segmentation/resampling and the existing PCM16 WAV encoder.
- `onnxruntime-web@1.31.1`: compatible pinned WASM inference runtime and self-hosted JavaScript/WASM assets for Silero. No provider SDK, browser-test framework or agent framework was added.

The npm lockfile also adds these required transitive runtime packages; none was separately chosen as an application dependency:

| Packages                                                                                                                                                                                                                                                     | Reason                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `onnxruntime-common@1.31.1`                                                                                                                                                                                                                                  | Shared inference tensor/session interfaces         |
| `flatbuffers@25.9.23`, `protobufjs@7.6.6`, `long@5.3.2`                                                                                                                                                                                                      | ONNX model formats and integer serialization       |
| `guid-typescript@1.0.9`, `platform@1.3.6`                                                                                                                                                                                                                    | ONNX runtime identifiers and environment detection |
| `@protobufjs/aspromise@1.1.2`, `@protobufjs/base64@1.1.2`, `@protobufjs/codegen@2.0.5`, `@protobufjs/eventemitter@1.1.1`, `@protobufjs/fetch@1.1.1`, `@protobufjs/float@1.0.2`, `@protobufjs/path@1.1.2`, `@protobufjs/pool@1.1.0`, `@protobufjs/utf8@1.1.2` | Required protobuf serialization/loading support    |

## Git

Continued on `main`; preserved all 14 P1 commits. Eight P2 implementation commits culminate in `684ba6a` (22 commits before this documentation commit). This report and the related documentation form the ninth P2 commit. Final hash and clean status are checked after committing and reported in the final response. Nothing was pushed, amended, reset or rebased. Local `.env`, generated WAVs, `.data`, VAD binaries, `.next`, `node_modules` and temporary verification scripts remain ignored.

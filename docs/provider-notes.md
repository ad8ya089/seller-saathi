# Provider verification status — P2 and P3

Official contracts checked on 10 November 2026:

- [STT reference](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe) and [REST guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api): Saaras v4 is recommended; v3 remains supported. The reference's mode description still says v3-only, while the guide describes both models accepting the same modes. The live results below show both tested modes were accepted for v4.
- [TTS reference](https://docs.sarvam.ai/api-reference/text-to-speech/convert) and [language guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/how-to/set-the-language): Bulbul v4 Flash is recommended. REST uses `language_code` and supports `output_audio_codec=wav` at 24000 Hz. Each single-text request must return exactly one usable audio output; outputs are not concatenated.
- [Voice catalog](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices): v4 uses persona IDs, while v3 uses short names. The adapters reject mixing those formats. The configuration checks v4's persona format; the API is authoritative for catalog availability.

The application defaults to `saaras:v4` / `transcribe`, auto-detected STT language, and `bulbul:v4-flash` / `shubh_enhi_ads` / `en-IN`. Models, mode, speaker and pace remain configurable. There is no speculative TTS language-field switch.

All nine calls in the first live smoke below succeeded with no API errors. On this generated sample, v4 rendered the Hinglish phrase as English even in codemix mode; v3 retained the Roman Hindi phrase. This is a measured behavior difference, not evidence of microphone transcription quality. All five WAVs are ready for human audition; no voice-quality preference has been inferred.

Missing credentials still report `false` in health and cause a controlled error only when a live operation is attempted. Keys remain server-side. Request timing includes any bounded retry/backoff: each attempt is limited to six seconds, at most one retry on 429/5xx, with an overall deadline of thirteen seconds at default settings. An excessive Retry-After is not ignored to retry early.

Gemini primary-model verification is recorded below. The fallback model has not been called unless a later dated entry explicitly says so. The P1 historical decisions remain in `p1-decisions.md`.

## Gemini contract checks — 10 November 2026

The official [model catalog](https://ai.google.dev/gemini-api/docs/models) lists both configured IDs: `gemini-3.5-flash-lite` and `gemini-3.6-flash`. The [thinking guide](https://ai.google.dev/gemini-api/docs/thinking) supports minimal thinking on both. Installed official `@google/genai@3.0.0` types and source confirm `thinkingConfig.thinkingLevel=ThinkingLevel.MINIMAL`, `config.abortSignal`, `parametersJsonSchema`, `automaticFunctionCalling.disable=true`, and HTTP retry `attempts=1` to disable hidden retries. Application code owns its primary retry and fallback.

The [thought-signature guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures) requires retaining original signed parts. The adapter stores every original streamed Content object, including empty text/signature parts, and returns them unchanged with ID-matched function responses. This follows the installed SDK chat implementation rather than reconstructing content from text. The installed SDK marks partial function-argument streaming as unsupported on the Gemini Developer API; no unsupported request flag is sent. Defensive partial-argument parsing is tested without enabling it.

Observed initial HTTP 400: `INVALID_ARGUMENT`, "Manually set deadline 8s is too short. Minimum allowed deadline is 10s." The adapter now omits the SDK server-timeout header and retains its own eight-second AbortController deadline. No model alias or configured timeout was silently changed. The successful run below used this corrected transport. The smoke prompt is synthetic and separate from the SellerSaathi system prompt; the final text is evidence of tool continuation, not a seller-diagnosis evaluation.

## Live smoke — 2026-11-10T15:07:18.541Z

These are observed API results, using the application adapters. TTS REST used language_code=en-IN, speech_sample_rate=24000 and output_audio_codec=wav. STT used language_code=unknown. Synthetic English/Hinglish input only; no microphone recording was used.

| Kind | Model           | Speaker or mode       | Result    | Request ms | Output or error                                                                       |
| ---- | --------------- | --------------------- | --------- | ---------: | ------------------------------------------------------------------------------------- |
| tts  | bulbul:v4-flash | shubh_enhi_ads        | succeeded |     2151.9 | .data/audition/bulbul-v4-flash-shubh_enhi_ads.wav                                     |
| tts  | bulbul:v4-flash | ishita_enhi_customer  | succeeded |     2118.7 | .data/audition/bulbul-v4-flash-ishita_enhi_customer.wav                               |
| tts  | bulbul:v4-flash | shalini_enhi_customer | succeeded |     1538.8 | .data/audition/bulbul-v4-flash-shalini_enhi_customer.wav                              |
| tts  | bulbul:v4-flash | simran_enhi_customer  | succeeded |     1503.0 | .data/audition/bulbul-v4-flash-simran_enhi_customer.wav                               |
| tts  | bulbul:v4-flash | sunny_enhi_customer   | succeeded |     1323.3 | .data/audition/bulbul-v4-flash-sunny_enhi_customer.wav                                |
| stt  | saaras:v4       | transcribe            | succeeded |     1498.3 | Hello, this is Seller Sathi. Namaste. My sale has fallen. Can you check my stock?     |
| stt  | saaras:v4       | codemix               | succeeded |     1706.1 | Hello, this is Seller Sathi. Namaste. My sale has fallen. Can you check my stock?     |
| stt  | saaras:v3       | transcribe            | succeeded |     1695.8 | Hello, this is Seller Sathi. Namaste, meri sale gir gayi hai. Can you check my stock? |
| stt  | saaras:v3       | codemix               | succeeded |     1673.3 | Hello, this is Seller Sathi. Namaste. Meri sale gir gayi hai. Can you check my stock? |

Audition files are local and ignored under .data/audition/. Transcripts and machine-readable results are in .data/audition/smoke-results.json. A successful round trip does not establish microphone accuracy or perceived voice quality.

## Gemini smoke — 2026-11-10T16:31:25.464Z

Model gemini-3.5-flash-lite; thinking minimal; failed: PROVIDER_REJECTED: Gemini rejected the request (HTTP 400). No model alias or substitution was used.

## Gemini smoke — 2026-11-10T16:33:26.573Z

Model: gemini-3.5-flash-lite; SDK @google/genai 3.0.0; thinkingConfig.thinkingLevel=MINIMAL, temperature=0.4, maxOutputTokens=300. Two real streamed requests; automatic function execution and SDK HTTP retries disabled. Complete original model Content objects, including signed/empty parts and call IDs, were returned for tool continuation. Fallback was not attempted.

Synthetic function/tool trace and observed timings/tokens:

```json
[
  {
    "functionCall": {
      "name": "get_demo_status",
      "id": "call_15838203754262510417",
      "args": {
        "shop": "demo"
      }
    },
    "toolResponse": {
      "ok": true,
      "status": "Stock review needed",
      "synthetic": true
    },
    "preservedContentParts": 2,
    "latencyMs": 1936.2214999999999,
    "usage": {
      "input": 81,
      "output": 18,
      "thoughts": 0
    }
  },
  {
    "text": "The demo shop is currently up, but its status indicates that a stock review is needed.",
    "latencyMs": 1360.1352000000002,
    "firstTextMs": 1314.9652,
    "usage": {
      "input": 80,
      "output": 18,
      "thoughts": 0
    }
  }
]
```

## Gemini S1 acceptance — 2026-11-10T17:32:00Z

`npm run chat -- --scenario S1` completed the real guarded agent in four seller turns, with Q_OOS_CONFIRM and Q_RESTOCK_ETA, three eligible actions and exactly one record for plan `73e1f831-f7e4-4466-8de4-c87fc94b4193`. No STT or TTS was called. The final findings included the domain-derived sales decline and cancellation evidence before the stock question.

The detailed trace contains twelve successful model invocations: eleven on `gemini-3.5-flash-lite` and one on configured fallback `gemini-3.6-flash` while recording the supplier-delay answer. The adapter reaches fallback only after its bounded timeout/5xx primary retry; the trace does not store which retryable condition occurred or the usage of failed attempts. This is a live fallback continuation success, including the existing signed primary history, rather than just a fake-provider assertion. The top-level CLI model field identifies the configured primary; per-turn `metrics.models` identifies the actual models used.

Reported successful-request usage was 54,609 input tokens, 442 output tokens and zero reported thought tokens. Turn totals were 9,196.9, 27,727.7, 15,195.9 and 10,274.2 milliseconds. These include the bounded retry/fallback delay where applicable, are not individual request deadlines, and do not establish a low-latency voice target. The synthetic local trace is ignored under `.data/chat/S1-1794331920972-e8ef12eb-8d0f-4e8b-8702-f215ce4ccc5c.json`.

## P5 provider verification — 2026-11-11 (India)

The acceptance smokes passed on 2026-11-10 at 21:12 UTC, using the configured application adapters. Private machine-readable results and synthetic auditions remain under ignored `.data/audition/`. No physical microphone or listening quality claim follows from these smokes.

Sarvam accepted REST TTS `language_code=en-IN`, `speech_sample_rate=24000`, `output_audio_codec=wav`; STT used `language_code=unknown`. All five `bulbul:v4-flash` speaker checks passed: shubh 1,946.1 ms, ishita 1,695.8 ms, shalini 1,518.9 ms, simran 1,332.1 ms and sunny 1,151.1 ms (full speaker IDs are env-configured). All four STT mode checks passed: `saaras:v4` transcribe 612.3 ms / codemix 846.6 ms; `saaras:v3` transcribe 430.2 ms / codemix 428.0 ms. These use synthetic source speech, not representative accuracy samples.

The Gemini smoke passed two streamed requests on `gemini-3.5-flash-lite`, SDK `@google/genai` 3.0.0, MINIMAL thinking, temperature 0.4, output cap 300. It preserved the original two model Content objects, including signed/empty parts and call IDs, for continuation. First request: 2,169.8 ms, input/output/thought tokens 81/18/0. Continuation: 1,503.5 ms total, 1,463.8 ms first text, tokens 80/15/0. Fallback was not attempted.

A separate scripted P3 S1 acceptance baseline passed in four turns with one matching isolated ledger record and twelve successful primary-model invocations. Successful reported tokens were 54,607 input / 442 output / zero thoughts; one primary retry has unreported failed-attempt usage. The approved P5 simulator S1 pilot subsequently failed (0/1), after one conservative consent rejection and then a provider rejection on turn five; its exact provider-side reason was not retained. The rejected explicit-consent wording was reproduced and fixed offline with regression tests; it has not been rerun live. Experimental tool-history compaction is disabled by default. See [P5 report](p5-report.md) for both results and the retained private trace locations.

The current [Sarvam STT API reference](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe) documents optional `language_probability` as confidence in auto-detected language. It is not transcript confidence; P5 therefore uses empty/invalid recognition recovery without inventing a low-confidence transcript threshold.

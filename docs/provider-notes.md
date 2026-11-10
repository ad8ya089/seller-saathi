# Provider verification status — P2

Official contracts checked on 10 November 2026:

- [STT reference](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe) and [REST guide](https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/rest-api): Saaras v4 is recommended; v3 remains supported. The reference's mode description still says v3-only, while the guide describes both models accepting the same modes. The live results below show both tested modes were accepted for v4.
- [TTS reference](https://docs.sarvam.ai/api-reference/text-to-speech/convert) and [language guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/how-to/set-the-language): Bulbul v4 Flash is recommended. REST uses `language_code` and supports `output_audio_codec=wav` at 24000 Hz. Each single-text request must return exactly one usable audio output; outputs are not concatenated.
- [Voice catalog](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices): v4 uses persona IDs, while v3 uses short names. The adapters reject mixing those formats. The configuration checks v4's persona format; the API is authoritative for catalog availability.

The application defaults to `saaras:v4` / `transcribe`, auto-detected STT language, and `bulbul:v4-flash` / `shubh_enhi_ads` / `en-IN`. Models, mode, speaker and pace remain configurable. There is no speculative TTS language-field switch.

All nine calls in the first live smoke below succeeded with no API errors. On this generated sample, v4 rendered the Hinglish phrase as English even in codemix mode; v3 retained the Roman Hindi phrase. This is a measured behavior difference, not evidence of microphone transcription quality. All five WAVs are ready for human audition; no voice-quality preference has been inferred.

Missing credentials still report `false` in health and cause a controlled error only when a live operation is attempted. Keys remain server-side. Request timing includes any bounded retry/backoff: each attempt is limited to six seconds, at most one retry on 429/5xx, with an overall deadline of thirteen seconds at default settings. An excessive Retry-After is not ignored to retry early.

Gemini model, fallback, thinking parameters and tool continuation remain unverified P3 work. The P1 historical decisions remain in `p1-decisions.md`.

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

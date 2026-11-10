# Provider verification status

P1 makes no outbound provider calls and includes no provider adapters.

| Item                      | P1 configuration                                      | Verification                            |
| ------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Gemini model              | Design-pack default, override with `GEMINI_MODEL`     | P3 `smoke:gemini` pending               |
| Gemini fallback           | Override with `GEMINI_FALLBACK_MODEL`                 | P3 pending                              |
| Gemini thinking parameter | Semantic level configured; no SDK mapping yet         | P3 pending                              |
| Sarvam STT model          | Design-pack default, override with `SARVAM_STT_MODEL` | P2 `smoke:sarvam` pending               |
| Sarvam STT mode           | Unset; no guessed default                             | P2 pending                              |
| Sarvam TTS language field | Unset; no guessed default                             | P2 must try both documented field names |
| Sarvam speaker and pace   | Configurable audition defaults from the design pack   | P2 audition pending                     |

Missing credentials report `false` in the health endpoint's boolean provider fields. A configured credential does not prove connectivity, supported models, working speech parameters or account credit. Add measured smoke results here when those phases are implemented.

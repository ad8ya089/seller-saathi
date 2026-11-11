# 11 — Northflank Sandbox manual runbook

Current **candidate**, checked against official documentation on 2026-11-11.
No account, payment method, platform resource, deployment, push or paid provider
call was made during preparation. The operator performs every dashboard action.

## Eligibility and billing: resolve before creating anything

**Conflicting official requirements:** the [pricing page](https://northflank.com/pricing)
says “No card needed”; the [billing documentation](https://northflank.com/docs/v1/application/billing/pricing-on-northflank)
says every plan requires a payment method before resources can be created.
Neither statement proves what your account will allow. Inspect the actual signup
and Billing/Plans UI. If it requests a card and you decline, **stop without resources**.
Do not upgrade or accept a payment/prepayment to continue this procedure.

Advertised Sandbox: up to **US$20/month resource allowance**, two services, two
jobs and one database/addon; always-on rather than automatic sleeping. The listed
`nf-compute-50` is **0.5 vCPU / 1 GB, US$12/month**, and egress is **US$0.06/GB**.
Disk, build storage, logs and metrics can add costs. This is neither unlimited
free usage nor a verified hard spending cap. Provider costs/credits are separate.
Confirm allowance eligibility, remaining allowance, included resource categories,
build costs, overage behavior and the total projected usage in your account first.

## Manual setup

1. Start at [Northflank signup](https://app.northflank.com), using your own account.
   Choose Sandbox, **Northflank Cloud**, not BYOC. Inspect Billing/Plans and the
   resource selector before creating anything. Confirm `nf-compute-50` is permitted
   within the available allowance without a paid upgrade. Stop if the UI differs
   or costs/eligibility are unclear; do not silently choose less than 1 GB RAM.
2. GitHub must contain the reviewed revision. At audit, local `main` was `69fab3c`
   and `origin/main` was not advertised by cached refs or `git ls-remote`.
   A later **explicitly authorized push** is required; none occurred here. After
   that approval, verify the intended commit exists in GitHub before linking it.
3. Authorize the GitHub integration for **only `ad8ya089/seller-saathi`**, rather
   than every repository. Do not put GitHub tokens in variables or Docker arguments.
4. Following [Create a project](https://northflank.com/docs/v1/application/getting-started/create-a-project),
   create **`seller-saathi-demo`** in **Asia South Delhi (`asia-south-delhi`)**.
   Confirm the region before creation; it cannot be changed afterward.
5. Following [Build and deploy](https://northflank.com/docs/v1/application/getting-started/build-and-deploy-your-code),
   choose **one combined service** named `seller-saathi`, repository above, branch
   `main`, Dockerfile build, root `Dockerfile`, root build context and final runtime
   stage. Preserve Docker CMD, Node 22 and non-root UID/GID 10001. Do not add a
   start-command override, separate build service, worker, job, addon or volume.
6. In Resources, select **`nf-compute-50`: 0.5 vCPU / 1 GB, one replica**.
   Inspect build-resource defaults as well as runtime estimates. Confirm all fit
   the allowance without an upgrade or unexpected billable resource. No autoscaling,
   larger ephemeral disk, static-egress gateway or dedicated load balancer is needed.
7. In [Networking](https://northflank.com/docs/v1/application/network/configure-ports),
   configure **one HTTP public port, 8080**, named `http`. Remove any automatically
   inferred public port 3000: `EXPOSE 3000` is the Dockerfile's local default, not
   the injected runtime port. The generated public endpoint has automatic TLS.
   Use its exact displayed hostname; do not guess its format or add a custom domain.
8. Enter the non-secret runtime settings below. Initially leave the two provider
   secrets unset. Health/startup and a keyless page check need no provider calls.
   After the generated public URL is available, set `DOMAIN` to **only its hostname**
   (no scheme/path/port). Save/redeploy as required by the UI before testing HTTPS POSTs.
   Before entering keys, a same-origin browser call attempt should reach controlled
   `PROVIDER_CONFIG` (503), not an origin rejection (400). Stop and investigate a
   hostname/origin mismatch; do not trust forwarded headers to bypass it.
9. Configure HTTP readiness and liveness [health checks](https://northflank.com/docs/v1/application/observe/configure-health-checks)
   on port 8080, path `/api/health`, expecting HTTP 200. Suggested starting values:
   30-second initial delay, 10-second interval, 5-second timeout, failure threshold 10.
   These are application recommendations, not claimed platform defaults. Preserve
   the image health probe too. Health reports configuration, not provider connectivity.
10. Inspect the build revision, successful Docker stages, deployed commit, running
    count of one and healthy state. Combined services normally build/deploy on linked
    branch changes; use the documented CI/CD controls to avoid unintended later releases.
    Build failure means inspect sanitized logs and fix a verified cause, not upgrade.
11. When you personally choose to incur provider usage, enter the two keys directly
    in the dashboard **runtime variables**, or a runtime-linked secret group, following
    [Inject secrets](https://northflank.com/docs/v1/application/secure/inject-secrets).
    Never enter keys as build arguments, GitHub Actions settings, committed YAML,
    secret files copied from the local `.env`, or visible terminal commands.
    Do not enable secrets for build inheritance. Visit the page only when ready for
    provider usage: its existing background greeting/cache warm-up can synthesize audio.

## Exact runtime configuration

Set these as **runtime variables**, not build arguments. Values are non-secret
and taken from committed configuration/provider notes; no private `.env` was read.
The English profile was verified previously, not re-tested live in this phase.

```text
NODE_ENV=production
PORT=8080
HOSTNAME=0.0.0.0
DATA_DIR=/tmp/kam
MOCK_DATA_DIR=/app/data
PROXY_MODE=caddy
DOMAIN=<exact-generated-public-hostname>
DAILY_TURN_CAP=50
RATE_LIMIT_TURNS=40
RATE_LIMIT_WINDOW_MS=600000
SESSION_TTL_MS=1800000
SESSION_MAX_TURNS=25
SESSION_MAX_MS=600000
LOG_LEVEL=info
LOG_TRANSCRIPTS=false
HINGLISH_ENABLED=false
COMPACT_TOOL_HISTORY=false
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.6-flash
GEMINI_THINKING_LEVEL=minimal
GEMINI_TIMEOUT_MS=8000
GEMINI_RETRIES=1
GEMINI_MAX_OUTPUT_TOKENS=300
GEMINI_TEMPERATURE=0.4
SARVAM_STT_MODEL=saaras:v4
SARVAM_STT_LANGUAGE=unknown
SARVAM_STT_MODE=transcribe
SARVAM_TTS_MODEL=bulbul:v4-flash
SARVAM_TTS_SPEAKER=shubh_enhi_ads
SARVAM_TTS_LANGUAGE=en-IN
SARVAM_TTS_PACE=1
SARVAM_TTS_SAMPLE_RATE=24000
SARVAM_TIMEOUT_MS=6000
SARVAM_RETRIES=1
NODE_OPTIONS=--max-old-space-size=384
```

The four core container settings are `NODE_ENV`, `PORT`, `HOSTNAME`, `DATA_DIR`;
some already match image defaults. `DOMAIN` and the safe proxy/cap settings above are
also necessary for this reviewed public setup. The remaining entries make the
existing English provider/limit profile explicit. Other domain thresholds, upload,
tool-round and language-cache settings retain validated code defaults.

Secret variable names **only**: `GEMINI_API_KEY`, `SARVAM_API_KEY`.
Leave `TRUSTED_PROXY_TOKEN`, `INTERNAL_METRICS_TOKEN`, `DEMO_ACCESS_CODE` and
`PROVIDER_PRICING_JSON` unset. Do not copy the Cloud Run YAML: its proxy mode is
not appropriate here. No Northflank platform token is needed by the application.

`caddy` is the existing conservative mode name; it does **not** mean running Caddy
on Northflank. Without a proxy-held token, all callers share the unverified rate
bucket. Arbitrary XFF/X-Real-IP/token values cannot choose an identity. This can
limit multiple evaluators together; it is intentional abuse mitigation. No trusted
Northflank IP-header contract was established. Same-origin POSTs require matching
Host/Origin against `DOMAIN`; forwarded Host/Proto never bypass that check.

## Temporary storage and public smoke

[Northflank documents](https://northflank.com/docs/v1/application/scale/increase-storage)
1 GB ephemeral storage by default, erased on restart/termination. No volume is
attached. The two append-only JSONL files in `/tmp/kam` each stop at 8 MiB, refuse
new writes when full and preserve ownership records. A failed write cannot confirm
a save. Sessions, replay and rate/daily counters are memory-only and reset too.
Always-on marketing does not guarantee container continuity or durable ledger data.

Verify actual storage allocation in Resources. After a synthetic accepted save,
the operator may inspect **only metadata** with `df -h /tmp/kam` and
`stat /tmp/kam /tmp/kam/ledger.jsonl` in the container terminal; do not print env or
ledger contents. Confirm there is no persistent mount. A controlled restart with
synthetic data should invalidate the old session and discard the ledger. This
platform test remains manual; local Docker results do not establish Northflank mounts.

Public acceptance checklist (the operator performs real voice/provider steps):

- HTTPS homepage loads; synthetic/not-connected and temporary-ledger labels visible.
- `GET /api/health` is 200 with `ok=true`; provider flags false before secret entry,
  true after. `?verbose=1` remains 404 without an internal bearer. No provider calls from health.
- ONNX `/vad/silero_vad_v6.onnx`: 200 octet-stream; WASM
  `/vad/ort-wasm-simd-threaded.wasm`: 200 application/wasm; MJS
  `/vad/ort-wasm-simd-threaded.mjs` and worklet `/vad/vad.worklet.bundle.min.js`: 200 JavaScript.
- HSTS, nosniff, Referrer-Policy, microphone self permission and CSP present;
  no CSP/worker/WASM/voice-asset errors or CDN requests.
- Click Call, allow mic, hear greeting. One real S1: sales drop → OOS bestsellers,
  supplier late → ten days → eligible 2–3 actions → explicit yes. Snapshot/diagnosis/
  evidence update, at most three plan-changing questions, no premature commitment,
  one temporary save and correct follow-up date; no real Snapdeal action claim.
- A **real HTTP stream reader** sees transcript/sentences/audio before completion,
  preserving order and SSE headers (`text/event-stream`, `no-cache, no-transform`,
  `X-Accel-Buffering: no`), with no buffering/compression. Browser fetch streaming or
  a private approved client is suitable; page load alone is not an SSE test.
- Interrupt mid-reply, confirm audio stops and new utterance works; End Call releases
  mic; retry does not duplicate a commitment. Denied mic supports text; provider
  failure yields a recoverable error without a false saved state. Use offline cap
  tests rather than deliberately making many paid turns.
- Check a mobile browser over mobile data; record extra paid usage explicitly.
  Logs must contain no keys, secret values or raw seller transcripts.
- Record actual first-audio boundary/sample count/p50/p95 separately from functional
  acceptance. No 3.7-second deployment threshold is asserted. Real call peak RAM,
  Delhi latency and platform streaming remain unverified until this smoke.

## Hard stops and teardown

Stop if card required but declined, allowance unavailable, target compute requires
a paid upgrade, an unexpected billable resource appears, or eligibility/cost is
unclear. Do not downgrade below 1 GB, add services or select BYOC. A failed public
SSE/voice/consent check means deployment success cannot be claimed; use local Compose
and a local recording instead. No recording occurs during this preparation.

After evaluation, use the combined-service **pause** control (documented to disable
CI/CD and scale to zero), or delete the intended service. Review retained build
images/storage, logs/metrics and secret groups; pausing runtime alone may leave
charges. Remove only the isolated `seller-saathi-demo` project if everything in it
is disposable; deletion is irreversible. Review Billing usage/spending and invoices
for remaining resources and incurred usage, and revoke the dedicated provider keys
and repository integration when no longer needed. Provider charges are separate
from hosting. Check actual invoices rather than assuming the allowance capped them.

# 12 — Render Free manual runbook

Prepared 2026-11-12 for a no-card evaluation attempt. No Render login, CLI/API,
resource creation, payment method, GitHub connection, push or provider call was
performed by this preparation. The operator performs dashboard and public tests.

**Conditional candidate:** read [the local report](p7.7-render-preflight-report.md)
first. Direct HTTP/browser/fake-provider checks passed at 512 MiB/0.1 CPU, but
Docker's built-in Node probe remained unhealthy under that quota. Local cold
health took 101–333 seconds; this is not a measured Render wake time. Actual
Render HTTP health must pass within five seconds and remain healthy; do not
remove health checks or select paid compute to bypass a failure.

## Account and service setup

1. [Sign up](https://dashboard.render.com/register). The official
   [first-deploy tutorial](https://render.com/docs/your-first-deploy) describes free
   resources with no payment required. **Never add a card. Stop if a card or paid
   upgrade is requested.** Select Hobby workspace and Free service compute.
2. Create one Web Service named `seller-saathi`, connecting only
   `ad8ya089/seller-saathi`, branch `main`. At audit local/remote main matched
   `7e2a974` (70 commits, not the brief's 69). This preparation's new revision
   requires a separately approved push before Render can build it. Check GitHub's
   head matches the intended reviewed revision before deploying.
3. Select **Singapore only if Free is offered there**. Singapore appears in
   [Regions](https://render.com/docs/regions); account eligibility remains manual.
   If unavailable on Free, stop and ask the user before Frankfurt or another region.
4. Language/runtime Docker, root build context, root Dockerfile (requested UI path
   `/Dockerfile`; verify the dashboard's exact root-path spelling), default CMD.
   Preserve Node 22 and non-root UID/GID 10001. [Docker](https://render.com/docs/docker)
5. Select **Free**, 512 MB / 0.1 CPU, one instance. No Starter/paid compute, disk,
   Postgres, Key Value, worker, job, second service or external uptime monitor.
6. Enter the non-secret profile below, **initially omitting DOMAIN** until Render
   assigns the URL. Never paste the hostname placeholder literally. Keep provider
   keys absent for this initial keyless deployment. `PORT=10000` overrides local
   default/EXPOSE 3000; bind `0.0.0.0:10000`. Render terminates TLS; do not add Caddy.
   [Web services](https://render.com/docs/web-services)
7. Configure HTTP health path `/api/health`. Expect 200 and `ok=true` with absent
   keys; provider flags mean configuration only. Unauthorized `?verbose=1` stays 404. Check healthy/running status and sanitized logs, not just build success.
   [Health checks](https://render.com/docs/health-checks)
8. After Render supplies the URL, set `DOMAIN` to that exact `onrender.com`
   hostname, without scheme/path/port, and apply changes. Before keys, same-origin
   POST should reach PROVIDER_CONFIG/503, not origin rejection/400. Investigate
   mismatch; never trust forwarded headers to bypass it.
9. Only when you personally choose provider usage, enter secret values manually
   in Render's Environment dashboard. Secret names **only**: `GEMINI_API_KEY`,
   `SARVAM_API_KEY`. No local `.env` import, committed Blueprint secrets, Docker
   build arguments or GitHub Actions keys. [Environment settings](https://render.com/docs/configure-environment-variables)
10. Pushes to the linked branch automatically redeploy by default. After initial
    deployment, select Off in Settings → Build & Deploy → Auto-Deploy for manual
    release control if desired; confirm current UI labels. Avoid releases during calls.

## Complete non-secret runtime profile

From committed configuration/provider notes; no private `.env` was read. Keep
existing Node heap and provider deadlines. No smaller heap or model/Hindi change
is authorized to fit Free. Other domain/upload/tool settings retain code defaults.

The DOMAIN line is a placeholder instruction, not a valid value to paste. Omit it
for initial keyless GET/health checks, then set the exact assigned hostname before
public POST/call checks. The missing hostname must not be bypassed with forwarding
headers.

```text
NODE_ENV=production
PORT=10000
HOSTNAME=0.0.0.0
DATA_DIR=/tmp/kam
MOCK_DATA_DIR=/app/data
PROXY_MODE=caddy
DOMAIN=<exact-generated-onrender-hostname>
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

Leave `TRUSTED_PROXY_TOKEN`, `INTERNAL_METRICS_TOKEN`, `DEMO_ACCESS_CODE` and
`PROVIDER_PRICING_JSON` unset. `caddy` is the existing conservative mode name, not
a Caddy process. Without a proxy-held token everyone shares an unverified peer
bucket; different evaluators can rate-limit one another. Arbitrary XFF, real-IP,
token or forwarded Host values cannot grant trust. Do not reuse Cloud Run mode or
invent a Render IP contract. Missing/malformed DOMAIN and foreign Host/Origin fail
closed. In-memory session/peer/daily limits reset on restart; they are abuse
mitigation, not authentication or a maximum provider bill.

### Provider warm-up disclosure

HTTP startup and health do not wait for synthesis. With both provider keys set and
no access gate, the first dynamic homepage request starts background greeting TTS,
then warms six English recovery clips. A cold process can make **one greeting plus
six TTS syntheses before Call**, with existing retry/failure policy. Cache hits
coalesce within a process; sleep/restart clears them and can cause fresh charges.
Entering keys alone does not synthesize at boot, but opening the page can. This
task uses empty keys/fakes only. Real Gemini/Sarvam peak memory is still unknown.

## Free limits and recording

[Free hosting](https://render.com/docs/free) is for hobby/testing, not production.
Compute is $0, [512 MB / 0.1 CPU](https://render.com/docs/compute-plans). Shared
workspace monthly allowances: 750 running Free instance hours per calendar month;
Hobby includes 5 GB outbound bandwidth and 500 pipeline minutes. Verify remaining
usage in the dashboard. [Pricing](https://render.com/pricing),
[workspace plans](https://render.com/docs/new-workspace-plans).

No payment method: bandwidth exhaustion suspends Free services for the rest of
the month; pipeline exhaustion disables new builds until reset (existing artifacts
remain). Instance-hour exhaustion also suspends Free services until next month.
With a payment method, excess bandwidth/build usage may be billed: **do not add one**.
Public responses and external API requests consume [outbound bandwidth](https://render.com/docs/outbound-bandwidth).
High service-initiated external traffic can also trigger suspension; do not upgrade
to resolve it. Gemini/Sarvam charges/credits are separate from hosting.

After 15 idle minutes the instance sleeps; a new request wakes it in about a
minute. No periodic pings or artificial uptime monitor. Open the URL and allow
waking before the demo, then complete conversation/recording while awake. Sessions,
counters, caches and the temporary demo ledger may disappear on sleep/restart/deploy.
Both JSONL files refuse growth past 8 MiB, preserve ownership records, serialize
idempotent appends and never confirm failed writes. Free offers no persistent disk,
scaling beyond one instance, SSH or dashboard shell. Do not reuse Northflank's
shell/storage commands. Monitor dashboard memory/restarts where available; missing
graphs do not prove low memory. Keep local Docker Compose as fallback.

## Mandatory public acceptance — operator only

- HTTPS homepage and health 200; synthetic/not-connected and temporary-state
  disclosures visible. Provider flags false before keys, true after; health makes
  no provider requests and exposes no transcript/ledger/internal metrics.
- `/vad/silero_vad_v6.onnx`: 200 octet-stream; `/vad/ort-wasm-simd-threaded.wasm`:
  200 application/wasm; `/vad/ort-wasm-simd-threaded.mjs` and
  `/vad/vad.worklet.bundle.min.js`: 200 JavaScript. No CDN, CSP, worker or WASM
  errors; CSP, microphone self permission, HSTS, nosniff and Referrer-Policy present.
- Click Call, allow microphone, hear greeting. One real S1: sales drop → OOS
  bestsellers/supplier late → ten days → eligible two/three actions → explicit yes.
  Snapshot/evidence/diagnosis update; at most three plan-changing questions; no
  premature commit, exactly one accepted synthetic plan and seven-day follow-up.
- Read actual public `/api/turn` with a real HTTP stream reader (browser fetch
  body reader is suitable). Transcript/sentences/audio must arrive incrementally
  before completion in order. Require text/event-stream, no-cache/no-transform,
  X-Accel-Buffering:no and no application compression/buffering. [Official SSE
  guidance](https://render.com/articles/sse-vs-websockets-llm-streaming) supports
  the protocol, not proof that this route passes through Render's edge.
- Interrupt a response and verify playback/turn cancellation and new utterance;
  End Call releases mic. Replay does not duplicate saves. Denied mic supports text.
  Provider failure is recoverable with no false saved state; use offline injection
  tests rather than intentionally paying for many turns or corrupting public state.
- Mobile browser over mobile data works; record extra paid calls explicitly.
  Logs contain no keys/secret values/raw transcripts. Monitor memory/restarts.
- Record first-audio boundary, actual samples and p50/p95, cold/warm separately:
  last VAD speech frame → scheduled Web Audio playback, not physical output;
  text starts at Send. No invented pass threshold or unmatched P5 comparison.

If public voice/SSE/consent fails, do not claim success or select paid compute.
If the local 512-MiB/0.1-CPU health/browser/assets/fake-voice gate cannot pass without
OOM/repeated restarts, **stop Render preparation** and recommend laptop-hosted
Tailscale Funnel for separate operator review. Do not launch a tunnel in this task.
No video is recorded during preparation.

## Teardown

Disable Auto-Deploy; delete only the `seller-saathi` service. Verify no paid
services, databases, disks or custom domains were created. Inspect workspace usage
and invoices; remove Render GitHub App access to this repo if no longer needed;
revoke/rotate publicly used provider credentials after evaluation. Keep the local
project, GitHub repo, unrelated resources and Render account intact.

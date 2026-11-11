# Northflank Sandbox readiness report

## Account-specific free-region correction

The operator reports that this account's Free team dashboard permits only
**Europe West / London (`europe-west`)** and **US Central / Council Bluffs
(`us-central`)**. Europe West is the recommended free-region candidate.
Delhi (`asia-south-delhi`) and the other Asia-Pacific regions display a requirement
to upgrade to pay as you go under this account. Do not upgrade to select Delhi.
These are operator-observed account UI findings, not a claim that every account
has the same regional entitlement.

For users in India, London is expected to add network round-trip delay compared
with a nearby India region. Voice turns involve sequential browser/server and
server/provider requests, so the audible effect depends on routing and provider
locations. No numeric latency increase or first-audio result has been measured;
verify actual public voice/SSE behavior from India before claiming performance.

Before creating the service, independently verify that **nf-compute-50
(0.5 vCPU / 1 GB)** is available to this Sandbox account and included in its
remaining allowance. The advertised **$20 allowance** and **$12 plan price** alone
do not establish account-level eligibility or guarantee no charges. Existing stop
conditions for declined cards, paid upgrades, unclear billing, unexpected costs
and overages remain in force.

The starting local revision for this correction is `c0260c5`. The current reviewed
local commit, including this correction, must be published to GitHub before
Northflank can build it from `main`. Publication requires separate explicit push
approval; nothing is pushed or connected by this documentation change.

Prepared 2026-11-11. **Conditional candidate readiness, not a public deployment or
verified free account.** The operator owns signup, payment decisions, repository
authorization, secret entry, deployment and paid-provider/public smoke checks.

## Starting audit

- Clean `main`, HEAD **`69fab3c`**, **68 commits**. That revision is preserved.
- Cached `origin/main` was absent; read-only `git ls-remote origin refs/heads/main`
  returned no advertised branch. The current revision is not available there for
  Northflank's `main` integration. No fetch, push, tag or history rewrite occurred.
- Existing Dockerfile is unchanged: Node 22 Alpine, Linux amd64 supported, non-root
  UID/GID 10001, Next standalone, default `HOSTNAME=0.0.0.0`, injected PORT honored.
  Docker EXPOSE is local-default 3000; manually configure public 8080 and remove
  an automatically inferred public 3000. The corrected health probe honors PORT.
- Startup opens HTTP independently of provider synthesis; the existing first-page
  warm-up is background and requires configured providers. Health makes no provider
  calls. No local private `.env` was inspected or copied.
- Reviewed AGENTS, README, prompt, docs 01–10 and P6-alt context, actual Docker/
  Compose/config/startup/health/security/session/ledger/SSE and existing tests.
  Required non-secret values come from committed `.env.example`, Compose and
  configuration/provider notes, not private credentials. Exact runtime settings
  and the two secret **names only** are in [the runbook](11-northflank-runbook.md).

## Platform findings and implementation

Official [pricing](https://northflank.com/pricing) and
[billing documentation](https://northflank.com/docs/v1/application/billing/pricing-on-northflank)
conflict on payment-method requirements. The actual account UI must resolve this
before any resource is created. The advertised allowance is not unlimited hosting
or a guaranteed spending ceiling. No signup/billing UI was accessed in this phase.

The exact target is Northflank Cloud, `seller-saathi-demo`, `europe-west`, one
combined GitHub/Dockerfile service on `main`, one replica, `nf-compute-50` only if
Sandbox permits its 0.5 vCPU / 1 GB within the verified allowance, public HTTP 8080
with generated HTTPS. No BYOC, domain, proxy, persistent volume, addon or worker.
GCP setup is stopped because the operator reports a ₹1,000 prepayment requirement.

No production application or Dockerfile change was necessary. Existing headers,
VAD MIME, streaming, interruption, consent, eligibility, ownership, idempotency and
bounded append-only ledger behavior remain unchanged. No dependency was added.

Proxy configuration deliberately uses the existing `caddy` mode **without a trusted
proxy token**, yielding a shared unverified rate bucket. It does not launch Caddy.
Northflank XFF trust was not established, so Cloud Run mode is not reused. Set
`DOMAIN` to the exact generated public hostname for same-origin HTTPS requests
normalized internally to HTTP. Forged XFF/real-IP/forwarded authority cannot grant
identity or origin permission. This can rate-limit multiple evaluators together;
per-session, shared peer and daily caps remain, resetting on process restart.

Northflank's [storage documentation](https://northflank.com/docs/v1/application/scale/increase-storage)
describes default 1 GB ephemeral storage erased on restart/termination. Actual
platform allocation and mounts remain unverified. Local tests do not establish
Northflank persistence. The ledger/audit files each refuse growth above 8 MiB
without deleting ownership records; failed appends cannot confirm a save. The
UI's temporary-ledger warning, memory-only sessions and restart-reset limits stay.

## Changed files

| File                                     | Purpose                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/11-northflank-runbook.md`          | Manual eligibility/card gates, project/build/resources, exact environment, secrets, public acceptance and teardown                                            |
| `docs/p6-northflank-report.md`           | Audit, actual verification and remaining uncertainties                                                                                                        |
| `deploy/northflank/README.md`            | Operator-only deployment pointer and reproducible local commands                                                                                              |
| `README.md`                              | Northflank candidate replaces active Cloud Run instructions                                                                                                   |
| `docs/06-deployment.md`                  | Current-path pointer; historical EC2 preserved                                                                                                                |
| `docs/09-deployment-reassessment.md`     | Current candidate/reason/sequence; prior Cloud Run decision retained as history                                                                               |
| `docs/10-cloud-run-runbook.md`           | Superseded notice; old details preserved, not executed                                                                                                        |
| `scripts/deployment/cloud-run-local.mjs` | Reuse checker with explicit Northflank profile: own container/image/result path, 0.5 CPU, conservative proxy mode, synthetic DOMAIN; legacy profile preserved |
| `tests/server/northflank.test.ts`        | Matching configured HTTPS authority, missing-domain fail-closed behavior, forged authority rejection, untrusted forwarding shared bucket                      |
| `tests/integration/sse-stream.test.ts`   | Real loopback HTTP stream verifies first event before paused producer completion, then ordered tail                                                           |

## Verification

`npm run typecheck`, `npm test`, `npm run verify-data`: passed, **397 tests across
72 files**, **46/46 invariants**. The full suite includes two complete fake S1
acceptance phrasings, two questions, three eligible actions, no premature commit,
one ledger entry, follow-up date and replay without duplicated provider/write work.
The new real HTTP stream reader test passes; its server exists only in test code
on loopback, never as an application route. Provider calls are prohibited by the
ordinary test harness; all voice/model integrations used fakes.

Production `npm run build` and native `docker build --platform linux/amd64 -t
seller-saathi:northflank .` passed. The unchanged Dockerfile produced a Linux
amd64 image of **364,194,614 bytes**. The reused keyless checker ran with the
Northflank profile on **host 8082 → container 8080**, **0.5 local CPU / 1 GiB Docker
memory**, no persistent volume and no provider keys. It returned:

- HTTP health 200, `ok=true`, both provider flags false; homepage loaded.
- All four VAD assets 200 with expected ONNX/WASM/MJS/worklet MIME types.
- Required security headers present, **11 fake-microphone inference frames**,
  track released; zero CSP violations, browser errors, failed resources or
  external requests.
- Boot-to-HTTP **35,812.525 ms** including Docker create/start and HTTP polling,
  one sample. Idle server RSS **106,964 KiB**; observed process high-water after
  keyless browser/static requests **143,172 KiB**. Neither is a real provider-call
  peak or a Cloud/Northflank measurement. Docker's 1 GiB is not assumed identical
  to Northflank's advertised 1 GB accounting. Keep the requested platform RAM target.

Private results are in ignored `.tmp/northflank/local-result.json`. The checker
only removes its own container afterward. No Roster Sync container was inspected
or changed. Initial lint flagged numeric port interpolation in the new loopback
test; it was corrected to explicit string conversion without disabling any rule.
The full `npm run lint` retry passed (ESLint and full Prettier check), and both
affected SSE tests passed again. Ten intended files passed credential-pattern and
scope review; private diagnostics and environment files remain ignored. All local
commit gates passed. One local commit records this preparation; nothing was pushed.

No Northflank API/CLI, GCP, AWS/profile, Roster Sync access or lifecycle command,
DNS/Caddy change, cloud resource creation, account upgrade, key inspection, paid
provider call or video recording was performed. Only owned local test containers
may be created/removed. Private diagnostics stay under ignored `.tmp/northflank`.
No secret values appear in this report. Git commit is gated on passing local checks.

## Manual gates

The [runbook](11-northflank-runbook.md) contains the signup link, prominent card
conflict, allowance/compute/overage checks, repo-only GitHub connection, generated
DOMAIN, runtime-only secret entry, readiness/liveness probes, public HTTPS/mic/VAD/
MIME/CSP/SSE/consent/mobile/log checks, storage/restart verification and pause/delete/
invoice review. Stop on declined card, missing allowance, required paid upgrade,
unexpected resource, unverified cost or failed public voice/SSE. Do not lower RAM.

Not measured or verified here: actual Sandbox/account/card eligibility, included
cost categories and invoices, Northflank build/mount behavior, real provider-call
peak RSS, Europe-West-to-India voice latency, physical audio and public platform buffering.
The historical P5 release measurements and disabled Hindi gate remain unchanged.
Free hosting does not make provider usage free; no extra paid runs were authorized.

**GitHub publication still requires explicit approval.** This preparation makes one
local commit only after checks. It does not authorize pushing it or the earlier
history. The user must review the exact relevant revision before approving a push.

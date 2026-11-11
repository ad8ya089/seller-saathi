# 09 — Deployment reassessment

## Current deployment

[SellerSaathi is deployed on Render](https://seller-saathi.onrender.com/). The
author reports successful English voice testing and a recorded submission video.
The repository audit confirmed public health HTTP 200; it did not repeat paid
provider tests or establish the deployed Git SHA. See the [current runbook](12-render-free-runbook.md).
Earlier assessments below remain historical; no new deployment is required by this audit.

## Historical candidate — Render Free (P7.7)

On 2026-11-12 the operator selected a no-card Render Free attempt. Follow
[docs/12](12-render-free-runbook.md) and [the constrained report](p7.7-render-preflight-report.md).
One Free Docker Web Service, Singapore only if available on Free, 512 MB/0.1 CPU,
PORT=10000, generated HTTPS, no disk/addons. Card/upgrade required means stop;
another region requires user approval. No GCP/AWS/Northflank continuation or pings.
Passing keyless tests does not establish real-call peak memory. Failed constrained
checks mean stop and recommend the laptop Tailscale Funnel fallback separately.
The local HTTP/browser/fake S1 checks passed, but Docker's built-in process probe
remained unhealthy at 0.1 CPU. Treat this as conditional evidence, not a healthy
public deployment; actual Render HTTP health must stay within five seconds.

Sequence: local gate → separately approved publication of reviewed revision →
operator no-card setup → real public voice/SSE/consent smoke → record while awake
if passing; otherwise local Compose fallback. Earlier plans below are history.

## Historical Northflank account-specific free-region correction

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

## Historical candidate — Northflank Sandbox

The operator selected Northflank on 2026-11-11 because the available Google billing
account requires a ₹1,000 prepayment. **Do not continue GCP setup.** Use
[docs/11](11-northflank-runbook.md) for manual account/card/allowance verification
before resources. Northflank's pricing and billing documentation disagree on cards;
the actual account UI must settle that eligibility decision, not an assumption.
No platform resource or deployment has been created or claimed here.

Target: Northflank Cloud, `seller-saathi-demo`, `europe-west`, one combined
GitHub/Dockerfile service, one replica, `nf-compute-50` (0.5 vCPU / 1 GB) only within
the verified Sandbox allowance, public HTTP 8080 with generated HTTPS, no volumes
or addons. Keep the existing conservative proxy mode and configure `DOMAIN`;
Cloud Run's XFF mode is not reused. Ledger/session/counter loss remains explicit.

Sequence: local verification → review free eligibility and any card request →
separately approved Git push → manual Northflank setup/secrets/deploy → real public
SSE/voice/consent smoke → submission recording if passing, otherwise local fallback.
No public success is claimed from keyless tests. Dedicated EC2 remains a separately
reviewed fallback; all Roster Sync deployments are off-limits. The detailed current
results and Git dependency are in [the Northflank report](p6-northflank-report.md).

## Historical Cloud Run decision — superseded

Selected on 2026-11-11: **Cloud Run, Mumbai (`asia-south1`), direct HTTPS `run.app` URL**.
The existing Roster Sync EC2 is off-limits. Dedicated EC2 is a fallback only after
a separate account-ownership, permissions and cost decision. Older EC2 instructions
remain historical preparation, not the selected deployment procedure.

The audited starting point was clean `main`, `8b2a799`, 67 commits. Neither this
document nor `docs/10` existed; no earlier Cloud Run draft was present to amend.
Actual implementation gaps were Caddy-only headers, Caddy-authenticated IP lookup,
unbounded JSONL files and no Cloud Run upload/deployment tooling. Standalone already
honored PORT/HOSTNAME and did not block HTTP startup on provider synthesis. The
packaging probe still hardcoded port 3000; the internal-8080 check exposed this and
the probe was corrected with fake-network regression tests.

## Sequence

1. P7.6 local app readiness: offline checks, keyless Compose, fake S1 twice.
2. P6-alt Cloud Run code/config readiness: tested amd64 image, headers/VAD,
   bounded temporary ledger, explicit frontend trust and deployment inputs.
3. Personal GCP account/billing/prerequisites, then manual deployment with a
   **60-minute hard stop**. Start that timer only after prerequisites are confirmed;
   never accept unclear ownership, billing or permissions to beat the clock.
4. Public URL smoke test using one complete real S1 acceptance scenario.
5. Record the 1–2 minute submission video from the public URL after all functional gates pass.
6. If Cloud Run fails within the window: stop, clean up cloud resources, and record
   the locally runnable Docker Compose prototype instead. No video is recorded by this task.

The public app is a synthetic-data prototype, not a live Snapdeal integration.
Cloud Run sessions, caps and the **temporary demo ledger** can disappear on restart,
scale-to-zero, revision replacement or rescheduling. Maximum one instance reduces
state fragmentation but is not an uptime, persistence or billing guarantee; avoid
deploying revisions during calls. Do not add storage/database services to disguise this limit.

Cloud Run mode trusts one frontend hop at the right-hand end of X-Forwarded-For,
only after explicit operator configuration. A malformed final slot falls back to
the shared bucket, never a caller-controlled prefix. This follows the requested
observed direct-URL strategy; the official container contract does **not** promise
this header format. Validate a real client address and spoofed prefix during the
public smoke. Do not reuse this mode behind another proxy, tunnel or custom domain.

The initial resource budget is 1 vCPU / **1 GiB**, min 0 / max 1, concurrency 5,
timeout 120 seconds, CPU startup boost and request-based billing. Keyless idle
memory is not peak call RSS evidence. Per-session/per-IP limits remain; initial
daily attempt cap is 50. Counters reset on instance restart and cannot cap the bill.

Deployment functional gates are voice, SSE and verified consent. Record latency
separately with actual boundary, sample count and p50/p95; do not enforce the old
3.7-second target as a deployment gate or present P5's unmatched measurements as a
Cloud Run comparison. Hindi remains disabled. The broader P5 eval/physical QA and
latency work remain uncompleted, not silently promoted to passing.

Follow [the manual runbook](10-cloud-run-runbook.md) and
[local verification report](p6-alt-report.md). Local Compose remains available.

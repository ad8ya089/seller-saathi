# 09 — Deployment reassessment

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

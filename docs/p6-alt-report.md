# P6-alt and P7.6 local readiness report

Prepared 2026-11-11 from clean `main` at `8b2a799` (67 commits).
No cloud CLI, authentication, billing, cloud resource operation, DNS change,
provider API call, real-key inspection, video recording or Git push was performed.
Roster Sync EC2 was never contacted. Existing local Roster containers were preserved.

## Audit and changes

`docs/09` and `docs/10` did not exist. The audited implementation already had
standalone startup, configurable listening PORT/HOSTNAME, background-only page
warming, configuration-only health, bounded session/replay/counter state, guarded
consent and incremental SSE. Gaps found and corrected:

| Files                                                                          | Change and reason                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next.config.ts`, `src/lib/security-headers.ts`                                | Security headers now supplied without Caddy; same-origin VAD/worklet/blob-worker/WASM CSP, explicit four-asset MIME types, Next compression disabled to protect SSE                                         |
| `Dockerfile`, `scripts/healthcheck.mjs`                                        | Default unmounted storage `/tmp/kam`; local Compose still explicitly mounts `/data`; health probe now honors injected PORT instead of hardcoding 3000                                                       |
| `src/lib/server/config.ts`, `.env.example`                                     | Explicit opt-in `PROXY_MODE=cloud-run`; Caddy-token mode remains default; temporary data default with explicit directory overrides preserved                                                                |
| `access.ts`, `same-origin.ts` under `src/lib/server`                           | One final valid XFF slot only in direct Cloud Run mode, malformed-slot shared fallback; matching HTTPS run.app authority accepted after internal HTTP normalization; forwarded Host never trusted           |
| `bounded-ledger.ts`, `ledger.ts`, `followup-ledger.ts`                         | Bound reads and appends to 8 MiB per file (16 MiB combined); preserve records and serialized/idempotent appends; refuse growth rather than rotate/delete ownership history                                  |
| `voice-errors.ts`, `SellerDashboard.tsx`                                       | Recoverable storage failure without false save, explicit temporary-demo-ledger/restart notice; synthetic-data and non-integration labels preserved                                                          |
| `.gcloudignore`, `.dockerignore`, `.gitignore`                                 | Exclude private inputs/diagnostics/credentials and generated output; track only the non-secret YAML example; preserve required source/postinstall assets                                                    |
| `deploy/cloud-run/deploy.ps1`, `README.md` there, `.env.cloudrun.example.yaml` | PowerShell 5.1 operator path; explicit project/deploy opt-in, fixed reviewed resources, flat allowlisted non-secret configuration, numeric secret-version references, dedicated identity; no Bash duplicate |
| Root README, `docs/06`, `docs/09`, `docs/10`                                   | Current deployment-first sequence, ownership/billing prerequisites, direct URL smoke, optional warm period, costs/hard stop/cleanup and local fallback                                                      |
| Tests under `tests/server`, `tests/integration`, `tests/deployment`            | Proxy spoofing/IPv4/IPv6/malformed cases, same-origin, bounds/unchanged ownership, recoverable confirmation/retry, SSE reader incrementality, PORT-aware health                                             |
| `scripts/deployment/cloud-run-local.mjs`                                       | Isolated keyless Docker/Chrome checker; no fake provider endpoint in the runtime image; supports an explicit alternate local host port while retaining container 8080                                       |

No dependencies were added. Domain facts, action eligibility, phase/consent/ownership
guards, interruption and idempotency contracts remain unchanged. HTTP security now
also applies to standalone without the old Caddy proxy. Cloud Run XFF behavior is
an explicit unverified live assumption, not an official header-format guarantee.

## Local verification

Before application edits: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run verify-data`, `npm run build` passed: **375 tests / 46 invariants**.
The existing root Compose path ran in an isolated keyless project on host 3400;
health was 200 with both provider flags false. The existing deterministic S1
container harness committed exactly one synthetic accepted plan per run, twice,
with a follow-up date, before and after the compatibility changes.

Post-change verification to date:

- Final consolidated Vitest run: **392/392 across 71 files**. Full lint and
  typecheck passed; production compilation and final amd64 Docker build passed,
  including **46/46 data invariants**.
- Typecheck and production Next build passed. Native **Linux amd64 Docker build** passed.
- Existing **10/10 Chrome tests** passed, covering panels, explicit save, failed
  save/decline, text/microphone fallback, mobile layout, interruption and review.
- Keyless Chrome against the rebuilt Compose app: page 200, all four VAD asset
  paths 200 with the expected MIME, actual fake-mic inference frames and released
  track, no CSP violations, no external requests and no remaining browser errors.
  The browser harness separately identifies only a source-located favicon 404;
  it never suppresses errors for voice assets, CSP or other locations.
- The existing agent test executes S1 twice with two explicit acceptance phrasings:
  two questions, three eligible actions, zero commitment before acceptance, one
  ledger record, follow-up date and replay without another append. API tests
  create sessions/snapshots; Chrome route fakes exercise displayed evidence/plan.
  These complementary checks are not a real-provider voice acceptance claim.
- SSE tests read the first HTTP stream chunk while the runner is paused, then
  verify subsequent order/closure and headers. Existing agent tests verify audio
  before model completion, cancellation, interruption and retry deduplication.
- The deployment script was **parsed, not executed**, with Windows PowerShell
  **5.1.26100.9818**. No gcloud command, including version/upload-list, was run.

Original failures and corrections: new tests first demonstrated the missing proxy
mode/origin/default-path/bounds behavior; implementing it made those tests pass.
An existing config test expected `.data` and was updated to the requested `/tmp/kam`
default. Typed lint caught tuple narrowing and test typing/void-arrow issues; these
were corrected without disabling rules. The internal 8080 probe exposed hardcoded
3000 in `healthcheck.mjs`; fake-network tests reproduced that mismatch before its
PORT-aware correction. No provider policy, consent guard or timeout was weakened.

## Measurements and remaining local gate

Initial compatibility image: **364,194,484 bytes**, amd64. Final rebuilt image:
**364,194,492 bytes**, Linux amd64. With one local CPU and a 1 GiB container limit,
the corrected internal-8080 HTTP health probe succeeded within **10,520 ms** of
launch, including Docker CLI and polling overhead (one sample, an upper bound).
At that point `/proc/1/status` identified the Next server and reported **107,168 KiB
RSS and high-water**. No provider was configured or called. This internal check did
not publish a host port and its owned container was removed afterward.
Earlier keyless Compose `docker stats` was 72.11 MiB, a container working-set
measurement, **not process RSS**. A separate quiescent server read after static/browser
checks was **118,072 KiB RSS**, with **148,992 KiB process high-water**. This includes
startup/static requests, not a call peak. **Real-call peak RSS, Cloud Run memory,
real greeting-to-Listening and audible latency were not measured.** Keep 1 GiB.

The first requested host-8080 mapping failed because an existing local Roster Sync
video container owns IPv4 and IPv6 port 8080. It was neither stopped nor changed.
Only our failed preflight container was removed after its exact ID was verified.
The operator approved host **8082**, preserving container **PORT=8080** and the
existing Roster service. The final mapped-container check passed with one local
CPU and a 1 GiB limit: health 200, both provider flags false, all four assets 200
with correct MIME, required security headers present, **11 actual fake-microphone
inference frames**, track released, zero CSP violations, browser errors, failed
resources or external requests. Boot-to-HTTP was **16,180.19 ms** including Docker
create/start and HTTP polling (one sample). Idle server RSS was **106,088 KiB**;
observed server high-water after keyless browser/static requests was **138,108 KiB**.
These are local Docker measurements, not Cloud Run or real-call peak results.
Private results remain in ignored `.tmp/cloud-run/local-result.json`.

The approved host-port deviation closes the remaining local gate without altering
Roster Sync. The checker creates then starts only its own container so even a
failed bind can be cleaned up safely. All required local checks passed; this phase
adds one local commit while preserving the original 67 commits. Nothing was pushed
and no cloud deployment or paid provider test was run.

## Manual gates and limits

No public URL has been deployed or claimed. Account/billing ownership, APIs/roles,
Secret Manager entries, actual gcloud upload list, Cloud Build, native cloud startup,
right-most frontend IP behavior, public HTTPS/SSE/microphone/mobile acceptance and
one real S1 remain manual. The Cloud Run filesystem is memory-backed and ephemeral;
Docker disk-backed tests do not reproduce its storage memory accounting. Max one
instance does not guarantee stable process state or zero overlap during deployment.

Hindi remains disabled, compaction remains off, and broader P5 persona/physical QA
and latency measurements remain open. There was no video or paid smoke/evaluation.
Follow `docs/10-cloud-run-runbook.md`; use the 60-minute limit only after personal
account/billing and prerequisites are settled. Optional idle warmth is approximately
US$3.02 per seven days before other charges, not a complete infrastructure/provider bill.

Private keyless files, diagnostics and screenshots stay under ignored `.tmp`;
no local `.env` was inspected, copied or staged. The non-secret example contains
placeholders requiring operator choices, and the upload-list check is deliberately
left to the operator because running gcloud is prohibited in this task.

## Changed-file inventory

```text
.dockerignore
.env.cloudrun.example.yaml
.env.example
.gcloudignore
.gitignore
deploy/cloud-run/deploy.ps1
deploy/cloud-run/README.md
Dockerfile
docs/06-deployment.md
docs/09-deployment-reassessment.md
docs/10-cloud-run-runbook.md
docs/p6-alt-report.md
next.config.ts
README.md
scripts/deployment/cloud-run-local.mjs
scripts/healthcheck.mjs
src/components/SellerDashboard.tsx
src/lib/security-headers.ts
src/lib/server/access.ts
src/lib/server/bounded-ledger.ts
src/lib/server/config.ts
src/lib/server/followup-ledger.ts
src/lib/server/ledger.ts
src/lib/server/same-origin.ts
src/lib/server/voice-errors.ts
tests/deployment/cloud-run-health.test.ts
tests/integration/agent-api.test.ts
tests/integration/sse-stream.test.ts
tests/server/cloud-run.test.ts
tests/server/config.test.ts
tests/server/ledger.test.ts
```

Owned keyless test containers were removed after verification; named test volumes were retained. No existing Roster container was changed.

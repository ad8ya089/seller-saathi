# P6 — Docker and AWS deployment preparation

Verified locally on 2026-11-11. This is deployment preparation, not a public deployment or production-readiness claim. No AWS resources were created or changed, no secrets were uploaded, and nothing was pushed. P7 was not started.

## 1. Architecture and file inventory

The prepared topology remains browser HTTPS → Caddy → one unpublished Next.js standalone service → Sarvam/Gemini over outbound HTTPS, with a named ledger volume at `/data`. Sessions and caches stay in memory; there is no database or AWS SDK in the application.

| Files                                                                | Responsibility                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Dockerfile`, `.dockerignore`, `scripts/healthcheck.mjs`             | Node 22 Alpine multi-stage standalone image and native Node health probe                       |
| `compose.yml`                                                        | Loopback-only local app, health, limits, rotated logs and persistent ledger                    |
| `deploy/aws-ec2/compose.prod.yml`, `Caddyfile`                       | Unpublished app; Caddy 80/443, scoped environment, certificates, headers and streaming         |
| `bootstrap.sh`, `common.sh`, `envfile.py` in that directory          | Instance-only Ubuntu ARM64 installation, IMDSv2, swap, scoped SSM reads and atomic private env |
| `start-caddy.sh`, `dns_gate.py`, `deploy.sh`                         | Fail-closed DNS startup, pinned fast-forward updates and health-failure image rollback         |
| `instance-policy.template.json`, `instance-kms-policy.template.json` | Named parameter permissions and optional customer-key decrypt grant                            |
| `.github/workflows/ci.yml`                                           | Keyless Node 22 verification; no deployment job or cloud credentials                           |
| `tests/deployment/`, `scripts/deployment/`                           | Hermetic script tests and reproducible isolated Docker/browser/transport checks                |
| `deploy/aws-ec2/README.md`, `docs/06-deployment.md`                  | Manual operator runbook and current deployment overview                                        |

No business, agent, domain, provider or HTTP security rules changed. One client initialization file selects Zod's equivalent interpreted parser: its caught JIT capability probe otherwise raises a CSP violation. JavaScript `unsafe-eval` was not enabled. The image executes the exact existing `npm start` Node target directly and preserves `scripts/start.mjs` and its standalone asset-copy behavior. Generated `.tmp` bundles and Python caches are excluded from formatting/linting and Git as appropriate. There are **no new npm dependencies** and no lockfile changes; deployment Python helpers use the standard library.

## 2. Native Docker build

`docker build -t seller-saathi:p6 .` passed on Docker Desktop 4.97.0, Engine 29.9.2, Linux amd64/WSL; Compose 5.6.1 and buildx 0.38.1 were available. Both the native and ARM builds ran data verification and Next production compilation without provider credentials. The native runtime reports Node **v22.23.4**, architecture `x64`, user **10001**.

The image retains `.next/standalone`, `.next/static`, `public`, `data` and the startup/health files. Dependency-stage `npm ci` generates VAD assets, which are explicitly copied into the builder; host `public/vad` is excluded. The runtime contains no `.env`. Checks found none of `eslint`, `typescript`, `vitest`, `@playwright/test` or `esbuild` in its standalone node_modules. Only Next's traced runtime dependencies are copied.

The actual BuildKit bind-mounted context check passed: ten prohibited paths, including `.env`, `.env.example`, `.git`, `.data`, `.next`, `.tmp`, host node_modules, tests, generated VAD and deployment files, were absent; four required source/lockfile/data/postinstall paths were present. Runtime VAD is supplied by the dependency stage, not that context.

## 3. Image size and identity

| Tag                      | Architecture | Docker-reported bytes | Image ID / manifest-list digest                                           |
| ------------------------ | ------------ | --------------------: | ------------------------------------------------------------------------- |
| `seller-saathi:p6`       | amd64        |           364,034,682 | `sha256:8482f7dcc3d52a8fc2569b9d62cd4ea2c496116538003af75116d1571febe3aa` |
| `seller-saathi:p6-arm64` | arm64        |           359,377,481 | `sha256:614e1990aaaa8ae70feb4e08ae2bda8f79a6300c31f8ee1d3ba7b7025238cfaf` |

These are local Engine image sizes, approximately 347 MiB and 343 MiB, not registry transfer sizes. Tags are mutable; record the digest when deploying. The Node multi-platform base resolved to `sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202`. Subsequent changes were documentation and local verification support, with the same application/runtime Dockerfile.

## 4. ARM64 build and runtime limits

`docker buildx build --platform linux/arm64 --load -t seller-saathi:p6-arm64 .` passed under local emulation. No verified musl incompatibility required changing to Debian. The final build's Next/data step took **1,025.4 seconds** under emulation; this is not an EC2 build-time estimate. An earlier build was cancelled intentionally after the CSP correction and was superseded by this successful build.

The ARM runtime reports `arm64`, Node v22.23.4 and UID 10001, and served `/api/health` with HTTP 200 and `ok: true`. **Its default Docker health probe exceeded the five-second exec timeout under emulation and became unhealthy.** A separate local-only 30-second outer timeout still observed the probe's internal three-second fetch deadline failing, while a direct in-container fetch returned 200. Production timeouts/security were not weakened to hide this. Native amd64 Compose health passed. Native ARM host health, build capacity and timing remain future instance acceptance checks; the ARM build result does not establish those.

## 5. Local Compose and configured session

Root Compose was built and started in isolated project `seller-saathi-p6-local` on `127.0.0.1:3300`, preserving the occupied default port. `up --build -d --wait`, container status, safe logs, page, static assets, health, data permissions and restart checks passed. The keyless health body reported `ok: true`, version `0.1.0`, both provider-configuration flags false and zero sessions. The home page returned 200 and SellerSaathi branding.

A separate private configured-provider project on loopback 3301 returned both configuration flags true. Its optional access gate returned **401** to an unauthorized session request; one authorized request returned **200**, a **230,444-byte** greeting WAV and eventually **six ready recovery clips**. Session deletion returned **200**. This bounded packaging check initialized Sarvam greeting/cache audio; it made **zero Gemini agent turns**, **zero STT turns** and **zero ledger commitments**. It is not an S1 or benchmark pass. Provider credentials remained app-only and private.

## 6. Startup, memory, health and data ownership

| Observed native local measurement                                              |              Result |
| ------------------------------------------------------------------------------ | ------------------: |
| New container: Compose launch to HTTP readiness                                |      12,257.1449 ms |
| Warm `docker compose restart app` through HTTP readiness and ledger comparison |      11,190.1651 ms |
| Idle keyless app from `docker stats --no-stream`                               | 74.38 MiB / 700 MiB |
| Container health                                                               |           `healthy` |
| Process UID / `/data` owner                                                    |       10001 / 10001 |
| `/data` permissions                                                            |                0700 |
| Unprivileged write/read/remove probe                                           |              passed |

The fresh-container timer starts after stopping/removing only the old test container, retaining its volume. Both timers include Docker CLI/startup overhead; the restart result also includes its ledger check. HTTP polling interval is 200 ms. These single observations came from a loaded Windows/WSL development machine with emulated builds, not t4g.small. They are not voice first-audio measurements or concurrency/capacity estimates. Health-log retention timestamps were not used as cold-start timing.

## 7. Caddy, HTTPS, browser and security integration

The actual production Caddyfile passed `caddy validate` in Caddy 2 Alpine. Local routing/browser checks used the same production file with only the ACME issuer changed to `tls internal` and listeners bound to loopback. **No real Let's Encrypt order was requested.** Production retains the Let's Encrypt issuer and automatic HTTP→HTTPS redirect; a local HTTP request with Host `example.test` returned **308**, Location `https://example.test/api/health`.

Real Chrome through local Caddy HTTPS returned 200, had a secure context, processed **12 VAD voice frames**, and released microphone tracks after pause/resume/destroy. CSP violations, external requests, browser errors and failed resources were all **zero**. Chrome used an existing synthetic WAV through its fake audio device, calling the actual microphone/VAD code; physical audio quality is unverified. ONNX/WASM and local worklet delivery work under the CSP; required WASM compilation and self/blob workers are allowed while JavaScript eval remains prohibited. Next's existing inline scripts require the documented inline allowance.

HSTS, nosniff, strict-origin referrer policy, microphone self/camera none and the restrictive CSP were present. Normal health remained 200. All three public verbose variants (including repeated/encoded keys) returned **404**, even with the valid synthetic internal bearer. Direct internal bearer access returned **200**. Valid same-origin session admission reached keyless `PROVIDER_CONFIG` **503**; cross-origin admission returned **400**.

Caddy receives only the two configured app-specific variables `DOMAIN` and `TRUSTED_PROXY_TOKEN`, plus its image's built-in environment. It receives no provider keys, access code or metrics bearer. Caddy overwrites the exact `X-Internal-Proxy-Token` and `X-Real-IP` contract. Forged changing client IP/token headers produced **503, 503, 429**; a different verified IP had a separate bucket. Wrong direct proxy authentication used the shared unverified bucket. No expected proxy token was reflected. Eventual Internet source-IP behavior still needs deployment verification.

## 8. Incremental SSE

A controlled synthetic upstream sent POST/body evidence, a sentence and completion through the actual Caddy `/api/turn` route. Chunk arrival times were **163.0988 ms, 856.5823 ms and 1,562.6638 ms**, total **1,563.5024 ms**. This demonstrated incremental delivery instead of end-of-response buffering.

POST and body were preserved; proxy authentication/peer headers were overwritten correctly; upstream encoding was `identity`; downstream had no Content-Encoding. `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` survived. The route uses `flush_interval -1` and no `encode`. This is proxy transport evidence, not a new paid agent latency result. Existing streaming/abort/replay integration tests also passed with fake providers.

## 9. VAD asset HTTP/MIME checks

All four paths returned HTTP 200 directly and through local HTTPS Caddy. No runtime CDN request was made.

| `/vad/` file                  |      Bytes | Content-Type                            |
| ----------------------------- | ---------: | --------------------------------------- |
| `vad.worklet.bundle.min.js`   |      2,480 | `application/javascript; charset=UTF-8` |
| `silero_vad_v6.onnx`          |  2,327,524 | `application/octet-stream`              |
| `ort-wasm-simd-threaded.mjs`  |     24,738 | `application/javascript; charset=UTF-8` |
| `ort-wasm-simd-threaded.wasm` | 14,848,852 | `application/wasm`                      |

## 10. Ledger persistence

A one-off bundle invoked actual TurnService/domain tools, explicit acceptance guards and the JSONL ledger with `FakeLlm`. It saved exactly one schema-valid synthetic plan, ID prefix `p6-persistence-`, with follow-up date **2026-11-18**. It was not a hand-written arbitrary JSON line or a production fake-provider switch.

The complete record remained identical after removing/recreating the app container and after `docker compose restart app`. `/data` remained the same named `seller-saathi-p6-local_kamdata` volume. The default development ledger was never mounted or changed by this test. Local P6 containers were stopped and their named ledger/certificate volumes retained; no volume-deletion or volume-prune command was used.

## 11. CI and automated verification

| Command/check                                          | Actual result                            |
| ------------------------------------------------------ | ---------------------------------------- |
| `npm run lint`                                         | passed ESLint zero warnings and Prettier |
| `npm run typecheck`                                    | passed                                   |
| `npm test`                                             | **341 tests, 57 files passed**           |
| `npm run verify-data`                                  | **36/36 passed**                         |
| `npm run build`                                        | passed, provider keys explicitly empty   |
| `npm run test:browser`                                 | **7 Chrome tests passed**                |
| Python environment and rollout suites                  | four cases each, included through Vitest |
| Bash syntax and ShellCheck                             | passed for four instance shell files     |
| Actionlint                                             | passed, exit 0                           |
| Native Docker / ARM64 build                            | both passed                              |
| Caddy syntax, HTTPS browser, proxy/SSE and persistence | passed within the limits above           |

The three new Vitest cases cover scoped parameter reads and invoke the two Python suites. Hermetic fake executables verify a wrong SHA fails before checkout/build, failed build leaves the app untouched, failed new health attempts the previous image, and DNS failure never starts Caddy. Env tests cover SecureString/default validation, literal values, preserved tunables, atomic replacement and disagreement/extra IPv6 DNS answers. Actual Compose container interpolation also preserved literal dollars, double dollars, quotes and backslashes.

CI runs on pushes/PRs with Node 22, `npm ci`, lint, typecheck, tests, data verification, Python/shell checks and production build. No provider keys, AWS credentials or deployment job are configured. Its syntax and local constituent checks passed. **No remote GitHub Actions execution occurred**, because this phase does not push. Host production/build/browser checks used empty provider-key environment overrides; Docker's build context had no env file.

## 12. Secret and log scans

Both exported final images were scanned across **21 archive entries and all 12 decoded filesystem layers each**, comparing both actual configured provider credentials in memory: **zero hits**. Secrets were supplied privately on stdin, never CLI arguments or output. Runtime `.env` and tested dev packages were absent.

The final source/staging scan compared configured credentials against tracked/new intended files, all Git patch history and **15 browser static files**: **zero hits** in each category. Provider-container logs also had zero configured-key matches. A controlled Caddy upstream failure returned **502** after requests containing synthetic auth/access/proxy markers; Caddy's captured logs had **zero marker hits**. Its access logger is off and runtime request headers are removed by the log filter. Existing P5 redaction/transcript-logging tests passed; deployment forces `LOG_TRANSCRIPTS=false`.

`.env`, `.data`, generated VAD, node_modules, image archives, actual provider outputs, screenshots, private measurements and temporary bundles remain ignored. Only synthetic test source and the already-approved existing WAV fixture are committed. Env helper plaintext stays in-process; its output is atomic mode 0600 on the target POSIX host and never shell-sourced. Windows unit tests do not establish Linux filesystem permissions; the target-host permission/SSM checks remain in the runbook.

## 13. Exact manual AWS prerequisites

Before later deployment, the operator needs an approved existing account/MFA or SSO profile, AWS CLI and Session Manager plugin; a reviewed Mumbai VPC/public subnet and outbound service connectivity; a hostname/DuckDNS account; private provider credentials and independent proxy/metrics tokens; a reviewed instance role/profile with rendered account/region/key placeholders; an approved full published commit; and public or separately provisioned private SSH repository access.

The target is t4g.small, Ubuntu 24.04 ARM64, encrypted 20 GiB gp3, 2 GiB swap, standard CPU credits and required IMDSv2. Only 80/443 are inbound; 22/3000 remain closed. Bootstrap runs through SSM, validates host/region/repository, installs official Docker packages and reads only four/five named SecureString parameters. It leaves Caddy stopped until host and two public DNS resolvers agree on every A/AAAA answer. No live IAM simulation, host bootstrap, SSM retrieval, cloud reboot, public certificate or public S1 was performed in P6.

Repository URL, branch, directory/domain and private access remain configurable. The actual remote is `https://github.com/ad8ya089/seller-saathi.git`. **Bootstrap cannot clone unpushed commits. The user must explicitly approve a later Git push and cloud deployment.** No PAT is embedded.

## 14. Cost estimate and budget before provisioning

Runbook steps 3–5 require a dated [AWS Pricing Calculator](https://calculator.aws/) estimate and an approved monthly budget with actual/forecast email alerts before billable resources. Include compute hours, encrypted EBS, public IPv4 allocation, egress, any snapshots/logging, and selected SSM/KMS tiers, plus tax/currency assumptions. Historical USD 13.5/month is not guaranteed. Budget alerts are not a hard spend cap.

Billable creation and lifecycle commands are explicitly marked as future operator actions. Stopping an instance can leave EBS/public IP/snapshot charges. Termination, IP release, parameter/IAM cleanup, DNS removal and optional KMS retention are separate deliberate steps. No provisioning, secret upload or AWS infrastructure spend was initiated by P6. The separately described Sarvam session initialization was a paid provider check.

## 15. Outstanding P5 release gates

- Corrected simulator S1 consent behavior still needs a newly approved live-provider retest; its previous pilot failed 0/1.
- Full supported persona evaluation (27 runs) remains pending; no new scope was inferred from P6.
- Full twenty-turn real voice latency benchmark remains pending.
- The P5 one-turn voice pilot was **13.93 seconds** and did not meet the target. P6 startup/proxy timings do not resolve that.
- Physical speaker/headphone, acoustic interruption/AEC/noise/pronunciation QA remains pending.
- Actual deployed Internet peer-IP identification/trusted-proxy behavior must still be verified.
- Tool-history compaction remains disabled by default pending its acceptance evidence.

These gates were not retired by a configured greeting, fake-audio VAD check, synthetic ledger or Docker build. Public HTTPS, reboot recovery and native ARM host health are additional future deployment acceptance checks.

## 16. Git checkpoint and private artifacts

At the documentation checkpoint: branch **main**, **55 commits**, latest implementation/CI commit **1ff1729** (`ci: add Node 22 verification workflow`). Only README/deployment/local-check/report documentation remained uncommitted. The original 47 commits ending at **1e941ac** are preserved. Eight small local implementation/test/CI commits precede the final documentation commit. Each boundary was staged/reviewed with relevant prior checks; shell files are indexed executable.

As in the P5 report, this report cannot contain its own final commit hash. The completion message supplies that hash, final commit count and verified clean state after the documentation commit. No reset, clean, amend, rebase, history rewrite or push was used. Private files and generated artifacts remain ignored.

## 17. Scope and handoff

The local preparation artifacts, reproducible checks and [23-step manual runbook](../deploy/aws-ec2/README.md) are complete. **No AWS resources were created, modified, started or stopped; no AWS secret upload or public deployment occurred; nothing was pushed.** Owned local P6 containers were stopped without deleting named volumes or stopping unrelated applications. No new npm dependencies were added. No configuration answer is missing for preparation; future publishing/cloud authorization and the explicitly listed acceptance gates remain external work. Stop after P6.

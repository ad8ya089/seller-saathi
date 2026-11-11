# 06 — Deployment preparation

Current candidate: [Render Free manual runbook](12-render-free-runbook.md),
following [the deployment reassessment](09-deployment-reassessment.md). No card
or paid upgrade is authorized. Northflank and Cloud Run are historical alternatives;
GCP setup stopped and the EC2 material below is historical. Roster Sync is off-limits.
Render Free uses temporary demo storage; only explicit local volume mounts provide
the local persistence described below.

P6 packages SellerSaathi for EC2; it does not provision or publish it. Follow the complete [EC2 runbook](../deploy/aws-ec2/README.md). Actual local results and remaining gates are in the [P6 report](p6-report.md). These replace the original untested deployment snippets.

## Topology

Browser HTTPS → Caddy :443 → unpublished Next.js standalone app :3000 → Sarvam/Gemini over outbound HTTPS. Named `kamdata` holds `/data/ledger.jsonl`. Sessions, counters and audio caches remain process-local. Caddy has separate certificate and configuration volumes.

| Setting | Prepared target |
| --- | --- |
| Region / instance | ap-south-1, t4g.small, Ubuntu 24.04 ARM64 |
| Disk / swap | 20 GiB encrypted gp3 / 2 GiB before building |
| Memory limits | app 700 MiB, Caddy 128 MiB |
| Public inbound | 80 and 443 only; no 22 or 3000 |
| Administration | Session Manager; IMDSv2 required |
| Secrets | Four named SecureString parameters under `/snapdeal-kam/`, optional access code |
| Runtime | Node 22 Alpine, UID/GID 10001, writable `/data` mode 0700 |
| Logs | Docker json-file, 10 MiB × three files per service |
| Cost | Dated calculator estimate and budget alerts before creating resources |

The private bridge permits provider egress. Only Caddy publishes ports. It overwrites the exact P5 proxy-token and peer-IP headers, blocks public verbose health, and serves `/api/turn` without compression or buffering. CSP and self-hosted VAD were checked in Chrome through local Caddy HTTPS. JavaScript `unsafe-eval` remains prohibited.

## Local use

`Dockerfile`, `.dockerignore`, root `compose.yml` and `scripts/healthcheck.mjs` provide packaging. The image preserves the standalone startup wrapper and deliberately copies generated VAD assets from the dependency stage. Host secrets, ledgers, node_modules and generated VAD assets do not enter the context.

```bash
# Fresh checkout only; preserve an existing private .env.
cp .env.example .env
docker compose up --build -d --wait
curl -fsS http://localhost:3000/api/health
docker compose down # retains named volumes
```

Set `APP_PORT` if 3000 is occupied. Keyless health reports configuration honestly. Configured session creation incurs greeting/cache work; ordinary tests/builds do not call providers. See [isolated local checks](../tests/deployment/README.md).

## Instance preparation and manual gates

`deploy/aws-ec2/` contains production Compose, Caddyfile, instance-only bootstrap/update/DNS scripts, safe environment preparation and scoped IAM/KMS templates. Bootstrap reads current `.env.example` defaults. Repeated bootstrap preserves operator tunables and an enabled access gate unless explicitly changed. The generated private file is Compose dotenv; never source it in Bash or parse it using Node's different dotenv rules.

The operator must approve later cloud work and a Git push, publish the reviewed commit, prepare a separate provisioning profile, obtain provider keys, choose a hostname/repository access method and complete IAM/KMS review, budgeting and cost estimation. The repository is `https://github.com/ad8ya089/seller-saathi.git`; private access uses a separately provisioned read-only SSH deploy key. Unpushed commits cannot be cloned by bootstrap.

Follow the runbook: budget/estimate → parameters and role → networking/instance/IP → SSM/bootstrap → DuckDNS/DNS gate → Caddy → public acceptance. No remote-script pipe into Bash, public SSH, embedded PAT, automatic deployment or volume deletion is part of this preparation.

Eventual AWS verification must cover HTTPS issuance/redirects, Internet source-IP trust, internal metrics, actual provider calls, full S1, physical audio, persistence and reboot recovery. Corrected simulator S1 live retest, full persona evaluation, twenty-turn benchmark, unmet latency target (P5 pilot 13.93 seconds), and physical speaker/headphone QA remain open. No AWS resources were created and nothing was pushed in P6.

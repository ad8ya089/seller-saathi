# 06 — Deployment (AWS EC2 + Docker + Caddy + DuckDNS)

Adapted from your **verified** Roster Sync deployment (`deploy/aws-ec2/*`, checked 2026-10-30). Snippets below are **untested adaptations** — P6 in `prompt.md` has Codex produce them in-repo; you run and verify.

Decision: **EC2 t4g.small, ap-south-1 (Mumbai), own instance, no DB.** Rationale in `docs/04` D9.

## 1. Topology

```
Browser (HTTPS, mic needs secure context)
  └─ :443 Caddy (Let's Encrypt, DuckDNS name)  ── SSE-safe reverse proxy
        └─ app:3000  Next.js standalone (Node 22)  ── Sarvam API, Gemini API (outbound HTTPS)
              └─ volume kamdata:/data  (ledger.jsonl)
Secrets: SSM Parameter Store SecureString → /opt/snapdeal-kam/.env (0600) at bootstrap
Admin: SSM Session Manager only. Inbound: 80, 443. No 22, no 3000.
```

| Setting | Value |
|---|---|
| Instance | t4g.small (2 vCPU, 2 GiB), Ubuntu 24.04 ARM64 |
| Disk | 20 GiB gp3, encrypted |
| Swap | 2 GiB (before first build) |
| Network | Elastic IP; SG inbound 80/443 only |
| Containers | `app` (mem_limit 700m), `caddy` (128m) |
| Secrets | `/snapdeal-kam/GEMINI_API_KEY`, `/snapdeal-kam/SARVAM_API_KEY` (SecureString, aws/ssm key) |
| Role | `AmazonSSMManagedInstanceCore` + policy below |
| Logs | docker json-file 10m×3 |
| Cost | ≈ $13.5/mo prorated hourly (`docs/04`) |

## 2. One-time prerequisites (you)
1. AWS CLI + Session Manager plugin installed; profile set; `export AWS_REGION=ap-south-1`.
2. GitHub repo `snapdeal-virtual-kam` (public or deploy-keyed).
3. DuckDNS subdomain, e.g. `snapdeal-kam-<you>.duckdns.org` (+ token, keep private).
4. Sarvam + Gemini keys (billing on for Gemini during demo window).
5. AWS Budget alert (~₹1,500).

## 3. Provision (CLI sketch — verify each command; or adapt your `provision.py`)

```bash
export AWS_REGION=ap-south-1 NAME=snapdeal-kam

# Secrets (typed silently; never in shell history or chat)
read -rs -p "Gemini key: " K; aws ssm put-parameter --name /$NAME/GEMINI_API_KEY --type SecureString --value "$K" --overwrite; unset K
read -rs -p "Sarvam key: " K; aws ssm put-parameter --name /$NAME/SARVAM_API_KEY --type SecureString --value "$K" --overwrite; unset K

# IAM role + instance profile
aws iam create-role --role-name $NAME-ec2 --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name $NAME-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
ACC=$(aws sts get-caller-identity --query Account --output text)
sed "s/\${AWS_ACCOUNT_ID}/$ACC/g" deploy/aws-ec2/instance-policy.template.json > /tmp/p.json
aws iam put-role-policy --role-name $NAME-ec2 --policy-name project-secrets --policy-document file:///tmp/p.json
aws iam create-instance-profile --instance-profile-name $NAME-ec2
aws iam add-role-to-instance-profile --instance-profile-name $NAME-ec2 --role-name $NAME-ec2

# Network
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws ec2 create-security-group --group-name $NAME --description $NAME --vpc-id $VPC --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 80  --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 443 --cidr 0.0.0.0/0

# Instance (Ubuntu 24.04 arm64 via Canonical SSM alias — confirm path exists)
AMI=$(aws ssm get-parameters --names /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query 'Parameters[0].Value' --output text)
IID=$(aws ec2 run-instances --image-id $AMI --instance-type t4g.small --iam-instance-profile Name=$NAME-ec2 \
  --security-group-ids $SG --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids $IID
ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id $IID --allocation-id $ALLOC
EIP=$(aws ec2 describe-addresses --allocation-ids $ALLOC --query 'Addresses[0].PublicIp' --output text); echo $EIP
```
(IAM role propagation can take ~1 min before SSM shows the instance as managed.)

### IAM policy (`deploy/aws-ec2/instance-policy.template.json`)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ReadProjectSecrets", "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters"],
      "Resource": "arn:aws:ssm:ap-south-1:${AWS_ACCOUNT_ID}:parameter/snapdeal-kam/*" },
    { "Sid": "DenyOtherParameters", "Effect": "Deny",
      "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
      "NotResource": "arn:aws:ssm:ap-south-1:${AWS_ACCOUNT_ID}:parameter/snapdeal-kam/*" }
  ]
}
```

## 4. DNS
Point DuckDNS to `$EIP` (web UI, or `curl "https://www.duckdns.org/update?domains=<sub>&token=<TOKEN>&ip=$EIP"` in a private terminal). Wait until `nslookup <domain>` returns `$EIP`. Caddy starts **only after** DNS matches (`start-caddy.sh`) to avoid burning Let's Encrypt rate limits.

## 5. Files in repo (`deploy/aws-ec2/`)

### `bootstrap.sh` (run once via SSM Run Command / Session)
```bash
#!/usr/bin/env bash
set -euo pipefail; umask 077
export DEBIAN_FRONTEND=noninteractive AWS_REGION=ap-south-1 AWS_DEFAULT_REGION=ap-south-1
[[ -f /swapfile ]] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
swapon --show=NAME --noheadings | grep -Fx /swapfile >/dev/null || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
apt-get update && apt-get install -y ca-certificates curl git jq unzip dnsutils
# Docker engine + compose plugin (same block as Roster Sync bootstrap.sh)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc; chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
install -d /etc/docker; echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}' > /etc/docker/daemon.json
systemctl enable docker && systemctl restart docker
command -v aws >/dev/null || { w=$(mktemp -d); curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o $w/a.zip; unzip -q $w/a.zip -d $w; $w/aws/install; }
[[ -d /opt/snapdeal-kam/.git ]] || git clone https://github.com/<you>/snapdeal-virtual-kam.git /opt/snapdeal-kam
cd /opt/snapdeal-kam
envfile=$(mktemp /run/kam-env.XXXXXX); trap 'rm -f "$envfile"' EXIT
for n in GEMINI_API_KEY SARVAM_API_KEY; do
  printf '%s=' $n >> "$envfile"
  aws ssm get-parameter --region $AWS_REGION --name /snapdeal-kam/$n --with-decryption --query Parameter.Value --output text >> "$envfile"
done
cat >> "$envfile" <<EOF
DOMAIN=<your-sub>.duckdns.org
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_FALLBACK_MODEL=gemini-3.6-flash
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=priya
DATA_DIR=/data
LOG_LEVEL=info
COMPOSE_FILE=/opt/snapdeal-kam/deploy/aws-ec2/compose.prod.yml
COMPOSE_PROJECT_NAME=snapdeal-kam
EOF
install -m 0600 "$envfile" .env
docker compose --env-file .env -f deploy/aws-ec2/compose.prod.yml build
docker compose --env-file .env -f deploy/aws-ec2/compose.prod.yml up -d --no-build --wait app
touch /var/lib/kam-bootstrap-complete; echo "bootstrap.complete (Caddy stopped until DNS verified)"
```
Copy any other `.env.example` tunables (caps, thresholds) into the heredoc.

### `compose.prod.yml`
```yaml
name: snapdeal-kam
services:
  app:
    build: { context: ../.. }
    env_file: ../../.env
    environment: { NODE_ENV: production, NODE_OPTIONS: "--max-old-space-size=384" }
    expose: ["3000"]
    volumes: [kamdata:/data]
    mem_limit: 700m
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
      interval: 10s
      timeout: 5s
      start_period: 20s
      retries: 10
    logging: &rot { driver: json-file, options: { max-size: 10m, max-file: "3" } }
  caddy:
    image: caddy:2-alpine
    environment: { DOMAIN: "${DOMAIN}" }
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile:ro, caddydata:/data, caddyconfig:/config]
    mem_limit: 128m
    depends_on: { app: { condition: service_healthy } }
    restart: unless-stopped
    logging: *rot
volumes: { kamdata: {}, caddydata: {}, caddyconfig: {} }
```

### `Caddyfile` (SSE-safe; no compression on the stream; verbose health blocked)
```caddyfile
{$DOMAIN} {
	tls { issuer acme https://acme-v02.api.letsencrypt.org/directory }
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		Permissions-Policy "microphone=(self), camera=()"
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'"
	}
	@verbose { path /api/health
	           query verbose=* }
	respond @verbose 404
	handle /api/turn {
		reverse_proxy app:3000 { flush_interval -1 }
	}
	handle {
		encode zstd gzip
		reverse_proxy app:3000
	}
}
```
(Tune CSP with the browser console on first load; vad-web needs worker + wasm.)

### `deploy.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/snapdeal-kam
git pull --ff-only origin main
[[ -n ${EXPECTED_COMMIT:-} && $(git rev-parse HEAD) != "$EXPECTED_COMMIT" ]] && { echo "unexpected head" >&2; exit 1; }
swapon --show=NAME --noheadings | grep -Fxq /swapfile || { echo "enable swap first" >&2; exit 1; }
C="docker compose --env-file .env -f deploy/aws-ec2/compose.prod.yml"
$C build                       # failed build leaves runtime untouched
$C up -d --no-build --wait app
$C up -d --no-build --no-deps --force-recreate caddy   # recreate bind-mounted Caddyfile inode
$C exec -T caddy caddy validate --config /etc/caddy/Caddyfile
curl -fsS https://${DOMAIN:-localhost}/api/health || true
```

### `start-caddy.sh` (DNS gate)
```bash
#!/usr/bin/env bash
set -euo pipefail; cd /opt/snapdeal-kam
domain=$(grep '^DOMAIN=' .env | cut -d= -f2); expected=${1:?Elastic IP}
getent ahostsv4 "$domain" | awk '{print $1}' | sort -u | grep -Fx "$expected" >/dev/null || { echo "DNS mismatch; Caddy stays stopped" >&2; exit 1; }
docker compose --env-file .env -f deploy/aws-ec2/compose.prod.yml up -d --no-build --wait
```

### `Dockerfile` (multi-stage; Next standalone; arm64 ok)
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-vad-assets.mjs scripts/
RUN npm ci
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN npm run build        # next.config: output: "standalone"
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app && mkdir /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/data ./data
USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

## 6. Deploy sequence
```bash
# from your laptop
aws ssm send-command --instance-ids $IID --document-name AWS-RunShellScript \
  --parameters 'commands=["curl -fsSL https://raw.githubusercontent.com/<you>/snapdeal-virtual-kam/main/deploy/aws-ec2/bootstrap.sh | bash"]'
# (or start-session and paste). Then set DuckDNS -> $EIP, wait for DNS, then:
aws ssm start-session --target $IID     # on the box:
sudo /opt/snapdeal-kam/deploy/aws-ec2/start-caddy.sh <EIP>
# updates:
sudo /opt/snapdeal-kam/deploy/aws-ec2/deploy.sh
```
Local one-command run (also required as fallback): `cp .env.example .env && docker compose up --build` → http://localhost:3000 (localhost counts as secure context for the mic).

## 7. Acceptance checklist (run before recording)
- [ ] `https://<domain>` 200, Let's Encrypt cert valid, HTTP→HTTPS redirect.
- [ ] From laptop: 22 and 3000 unreachable; 443 open.
- [ ] `/api/health` ok; `?verbose=1` → 404 publicly.
- [ ] Mic prompt works in Chrome desktop, Chrome Android, Safari iOS; audio plays after the Call click.
- [ ] SSE streams (sentences arrive incrementally in debug overlay, not at the end).
- [ ] Full S1 call end-to-end on public URL; ledger entry appears; `docker compose restart app` keeps ledger.
- [ ] `sudo reboot` via SSM → app + Caddy return without manual steps.
- [ ] Latency overlay: p50 first-audio ≤ 3.7 s from India on 5 consecutive turns.
- [ ] Key hygiene: no keys in repo, logs, or browser network tab.
- [ ] Rate-limit/daily-cap trip tested once (spoken wrap-up).
- [ ] Budget alert set; instance tagged.

## 8. Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| Mic button does nothing | HTTP not HTTPS | use domain/localhost |
| First reply arrives all at once | proxy buffering | confirm `flush_interval -1` + no `encode` on `/api/turn`; `X-Accel-Buffering: no` header from app |
| VAD never fires | assets 404 / CSP | check `/vad/*.onnx` + worklet served, `wasm-unsafe-eval` |
| Cert fails | DNS not pointing yet / port 80 closed | `start-caddy.sh` gate; SG 80 open |
| Build OOM on EC2 | swap missing | enable swap before `build`; or build in GitHub Actions (GHCR arm64) |
| 429 from Sarvam/Gemini | free-tier/rate | enable billing, lower concurrency, back-off already in adapters |
| Everything flaky mid-demo | DuckDNS blip | use recording + local compose as fallback |

## 9. Pause / teardown
- Pause: `aws ec2 stop-instances` (EBS + EIP still billed; EIP idle charge applies).
- Teardown: terminate instance → release Elastic IP → delete SSM params, IAM role/profile, SG → delete DuckDNS record. Do this after the evaluation window (ask Sourav's team how long the link must live; one week is a safe default).

## 10. Scale notes (for the interview)
Single t4g.small is I/O-bound (waiting on Sarvam/Gemini); comfortably handles low tens of concurrent demo calls. Bottlenecks in order: provider rate limits → per-IP caps → CPU credits (Standard mode; baseline 20%/vCPU) → memory. To scale: move sessions to Redis, ledger to Postgres, run N containers behind an ALB, use Sarvam streaming (WebSocket) to cut latency, separate STT/TTS proxies.

# Reproduce P6 local deployment checks

These checks use isolated local Docker projects, synthetic data and fake provider harnesses. They do not create AWS resources, request public certificates or activate production fake providers. Use Node 22, npm, Python 3, Bash, Docker Linux containers, Compose 2.24.4+ and installed Chrome. Run from the repository root. They use localhost 3300, local TLS 80/443 and fixture TLS 9443.

## Offline and image checks

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run verify-data
npm run build
npm run test:browser
python3 tests/deployment/envfile_test.py
python3 tests/deployment/instance_scripts_test.py
for script in deploy/aws-ec2/*.sh; do bash -n "$script"; done
docker build -t seller-saathi:p6 .
docker buildx build --platform linux/arm64 --load -t seller-saathi:p6-arm64 .
node scripts/deployment/prepare.mjs
node scripts/deployment/bundle.mjs
docker tag seller-saathi:p6 seller-saathi:local
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-local up -d --no-build --wait
```

The Python suites test environment/DNS helpers and real rollout scripts with hermetic fake executables. They never run AWS or mutate a real checkout, host or Docker daemon. `npm test` invokes both suites. Windows users can use `python` and Git Bash.

## Guarded ledger, startup and restart

```bash
docker cp .tmp/p6/ledger-harness.mjs seller-saathi-p6-local-app-1:/tmp/p6-ledger.mjs
docker exec seller-saathi-p6-local-app-1 node /tmp/p6-ledger.mjs
node scripts/deployment/local.mjs
```

The harness invokes actual turn service/domain tools, acceptance guard and ledger with `FakeLlm`, saving a schema-valid explicitly accepted synthetic plan. It is excluded from the production image. The local check verifies page/health/assets, non-root writes and an accepted record. It removes only its test container while retaining its named volume, measures fresh-container launch to HTTP readiness, then warm restart and ledger equality. Timings include Docker CLI/start overhead and depend on host load. Existing dev/production ledgers are never mounted.

## Actual Caddy HTTPS browser and proxy checks

```bash
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-tls \
  -f deploy/aws-ec2/compose.prod.yml -f .tmp/p6/tls.override.yml up -d --no-build --wait
node scripts/deployment/browser.mjs
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-stream \
  -f tests/deployment/compose.stream.yml up -d
node scripts/deployment/proxy.mjs
```

The override changes certificate issuance to Caddy's internal CA and binds listeners to loopback. Chrome maps `example.test` locally and ignores only this local certificate chain. It opens the actual page and calls the actual microphone/VAD implementation with the existing synthetic WAV through Chrome's fake audio device. It verifies secure context, inference frames, track release, CSP and local asset requests. Physical microphone/speaker/headphone quality remains unverified.

The proxy check covers same-origin admission, authenticated/forged IP rate buckets, public/internal verbose health, asset MIME types and security headers. It consumes three requests per bucket: restart the TLS app process or wait out its rate window before repeating. Valid same-origin keyless admission reaches `PROVIDER_CONFIG` (503); invalid origin is 400.

The separate synthetic upstream emits three delayed SSE chunks through the production Caddy route. It verifies POST/body preservation, proxy-header overwrite, identity upstream encoding and uncompressed incremental delivery. This proves transport behavior, not live-provider latency.

## Secrets and configured sessions

`docker save seller-saathi:p6 -o .tmp/p6/image.tar` exports the final image with every layer. `scripts/deployment/scan-image.py` takes the archive path and a JSON array of actual credentials **only on stdin**, printing aggregate counts. A private operator process can read its local env and pipe values directly without printing them. Never put secrets in arguments or committed scripts. Scan tracked files/history, client assets and provider-container logs similarly. Actual results are in the P6 report.

The configured-session check is separate and paid: privately configure the app and an access gate to prevent browser prewarming, create one authorized session, observe greeting/cache readiness and delete that session. Do not run live agent turns or full evaluation without corresponding approved spend. No credentials or private recordings are included here.

## Stop isolated projects, retaining volumes

```bash
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-local down
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-tls \
  -f deploy/aws-ec2/compose.prod.yml -f .tmp/p6/tls.override.yml down
docker compose --env-file .tmp/p6/control.env -p seller-saathi-p6-stream \
  -f tests/deployment/compose.stream.yml down
# Stop any separately created configured-provider project too.
```

Never add a volume-deletion flag. Generated env files, bundles, measurements, archives and private logs remain under ignored `.tmp/p6`.

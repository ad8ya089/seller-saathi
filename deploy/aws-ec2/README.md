# SellerSaathi — manual EC2 deployment runbook

**Preparation only. Nothing here was executed against AWS in P6.** Creating or changing cloud resources, publishing Git commits and exposing the public service each require the user's later explicit authorization. Packaging does not make this demo production-ready. Preserve the [P5 gates](../../docs/p5-report.md): corrected simulator S1 live retest, full persona eval, twenty-turn benchmark and physical speaker/headphone QA are pending; the voice pilot was 13.93 seconds and missed its target.

## 1. Local prerequisites and reproducible checks

Use Node 22 (at least 22.12), npm, Git, Python 3, Bash, Docker Engine/Desktop with Linux containers, Compose and buildx. Browser checks use installed Google Chrome and the existing Playwright/esbuild development packages. No provider key is needed to build or run ordinary tests.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run verify-data
npm run build
npm run test:browser
docker build -t seller-saathi:p6 .
docker buildx build --platform linux/arm64 --load -t seller-saathi:p6-arm64 .
cp .env.example .env   # only on a fresh clone; preserve an existing private .env
# Set provider keys privately only when a paid live check is intended.
docker compose up --build -d --wait
docker compose ps
docker compose logs --tail=100 app
curl -fsS http://localhost:3000/api/health
```

Local port 3000 binds **127.0.0.1 only**. Set `APP_PORT=3300` if the development preview already uses 3000. `APP_ENV_FILE` can select another private app env file. Use `--env-file` explicitly for interpolation when selecting another env file. Docker generates the four VAD assets during `npm ci`; ignored host assets, node_modules, .env files and ledgers never supply the image. The runtime executes the exact `npm start` Node target directly, retaining `scripts/start.mjs` and forwarding termination to Node. UID/GID is 10001; `/data` is 0700 and new ledger files are 0600.

`docker compose restart app` preserves `kamdata`. Sessions, replay, audio caches and daily counters are in memory and reset; the ledger alone persists. End local checks with `docker compose down` **without a volume-deletion flag**. Never prune volumes. The separate [local verification instructions](../../tests/deployment/README.md) use isolated projects and synthetic data.

## 2. AWS account/profile checks — operator only, read-only

The operator needs an existing account, MFA/SSO profile, AWS CLI and Session Manager plugin. Check identity and region; do not paste credentials into chat. These are future manual commands, not P6 execution:

```bash
export AWS_PROFILE=<approved-profile>
export AWS_REGION=ap-south-1 AWS_DEFAULT_REGION=ap-south-1
aws sts get-caller-identity
aws configure get region
aws ec2 describe-availability-zones --region "$AWS_REGION"
```

The instance role below is a workload role; it is not the operator's provisioning permission set. The operator needs separate reviewed privileges including restricted `iam:PassRole` for the selected instance role. Do not grant the instance permission to create resources.

## 3–5. Region, estimate and budget before creating anything

Use Mumbai `ap-south-1`, Ubuntu 24.04 ARM64, t4g.small, encrypted 20 GiB gp3 and 2 GiB swap. Before provisioning, obtain a current [AWS Pricing Calculator](https://calculator.aws/) estimate for on-demand compute hours, EBS capacity, public IPv4 allocation hours, egress, any snapshots/log storage and the chosen KMS/SSM tier. Include tax and an explicitly dated currency conversion if needed. Check T4g credit mode; this runbook selects **standard**, so sustained CPU may throttle rather than incur unlimited-credit surplus charges. Historical USD 13.5/month figures are not a guarantee.

Create an [AWS cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html) with an operator-approved USD monthly limit, actual and forecast alerts and a verified email subscriber **before** launching. A budget alert is not a hard spending cap. Console setup is simplest. Optional manual CLI, after creating reviewed `budget.json` and `notifications.json` locally:

```bash
# CLOUD CHANGE — budget/notification configuration; review account, limit and email.
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws budgets create-budget --account-id "$ACCOUNT_ID" \
  --budget file://budget.json --notifications-with-subscribers file://notifications.json
```

A cost-budget document has `BudgetName`, `BudgetType: COST`, `TimeUnit: MONTHLY` and `BudgetLimit: {Amount: "<approved USD limit>", Unit: "USD"}`. Each notification specifies actual/forecast type, percentage threshold, GREATER_THAN comparison and the intended EMAIL subscriber. Account-wide budgets may already exist; inspect first rather than creating duplicates.

## 6. Secure parameters — future manual cloud writes

Use **Standard SecureString** under exactly `/snapdeal-kam/`: `GEMINI_API_KEY`, `SARVAM_API_KEY`, `TRUSTED_PROXY_TOKEN`, `INTERNAL_METRICS_TOKEN`; optionally `DEMO_ACCESS_CODE`. Use independent strong random proxy/admin tokens. Keep the demo access code absent unless deliberately enabling the gate. Choose `alias/aws/ssm`, or a reviewed symmetric customer-managed KMS key.

Prepare values through the SSM console or a private operator program using `getpass`, not command arguments, shell history, terminal output or a committed file. A safe CLI wrapper writes a `PutParameter` JSON input to a 0600 temporary file, invokes `aws ssm put-parameter --cli-input-json file://...` with captured output and deletes that file. Do not enable shell tracing or CLI debug. Adding `--overwrite` is an explicit secret-rotation decision. No secret upload occurs in P6.

On the instance, `envfile.py` uses one named `GetParameters` request, captures the decrypted JSON in memory, requires SecureString/nonempty/single-line values, combines the **current checked-in `.env.example`** defaults and atomically replaces `.env` with mode 0600. No secret enters stdout, command arguments, Git or image layers. It encodes literal dollars/quotes/backslashes for Compose. This file is **Compose dotenv, never a shell script**: do not `source .env`, use `eval`, or run it through Node's different dotenv parser. Docker injects the resolved values into Node's environment; the image itself has no `.env`.

Repeated bootstrap preserves existing known operator tunables, including caps and model overrides, while refreshing named secrets. An existing access gate is preserved automatically; `INCLUDE_DEMO_CODE=true` enables it on first bootstrap and an explicit `false` deliberately disables it. Required runtime paths and transcript logging remain enforced by the helper.

## 7. IAM role, key choice and instance profile

Review `instance-policy.template.json`, replacing `${AWS_REGION}` and `${AWS_ACCOUNT_ID}`. It allows named reads for the five application parameters and explicitly denies reads elsewhere, including broad reads otherwise granted by `AmazonSSMManagedInstanceCore`. No ByPath permission is granted. The default `aws/ssm` key needs no additional wildcard KMS grant. For a customer-managed key, also review/render `instance-kms-policy.template.json`, supply the exact key UUID and ensure the key policy permits this role. Its decrypt grant is restricted to Parameter Store in this region and the project parameter encryption context.

Named SSM CLI operations are the policy input; the application does not use AWS SDK calls. ARN/action mappings were checked against the AWS service authorization reference. The role templates are not a live IAM policy simulation. Validate the rendered policy in IAM Access Analyzer/Policy Simulator before attachment, including a denied parameter outside the project and an allowed required parameter.

```bash
# CLOUD CHANGES — role/profile creation and policy attachment, operator only.
NAME=seller-saathi
cat > trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
# Render placeholders into reviewed instance-policy.json; do not attach unresolved templates.
aws iam create-role --role-name "$NAME-ec2" --assume-role-policy-document file://trust.json
aws iam attach-role-policy --role-name "$NAME-ec2" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$NAME-ec2" --policy-name project-parameters \
  --policy-document file://instance-policy.json
# Customer-managed key only: attach the separately rendered scoped KMS policy.
aws iam create-instance-profile --instance-profile-name "$NAME-ec2"
aws iam add-role-to-instance-profile --instance-profile-name "$NAME-ec2" --role-name "$NAME-ec2"
```

## 8–10. Security group, instance and Elastic IP — BILLABLE

Select an existing reviewed VPC/public subnet with an Internet Gateway route and outbound DNS/HTTPS access to SSM, Docker/GitHub, Sarvam and Gemini. No NAT gateway or load balancer is required by this topology. The SSM agent needs outbound service connectivity; a security group with no inbound SSH still supports Session Manager. Do not assume a default VPC exists.

```bash
# CLOUD CHANGES — networking and BILLABLE EC2/EBS/public IPv4 resources.
VPC_ID=<reviewed-vpc-id>
SUBNET_ID=<reviewed-public-subnet-id>
SG=$(aws ec2 create-security-group --group-name "$NAME" --description 'SellerSaathi HTTPS only' \
  --vpc-id "$VPC_ID" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 443 --cidr 0.0.0.0/0
# Read-only AMI lookup; inspect owner 099720109477, architecture arm64, Ubuntu 24.04 and root device.
AMI=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)
aws ec2 describe-images --image-ids "$AMI" --query 'Images[0].{Owner:OwnerId,Architecture:Architecture,Name:Name,Root:RootDeviceName}'
# Set the actual verified root device name in mapping.json, e.g. /dev/sda1.
# mapping.json: [{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":20,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]
IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small \
  --subnet-id "$SUBNET_ID" --security-group-ids "$SG" \
  --iam-instance-profile "Name=$NAME-ec2" \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1 \
  --credit-specification CpuCredits=standard \
  --block-device-mappings file://mapping.json \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$IID"
ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id "$IID" --allocation-id "$ALLOC"
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
```

No key pair, inbound port 22 or published port 3000 is used. IMDSv2 hop limit **one** is deliberate: only host bootstrap reads SSM using its instance role; app/Caddy containers do not need instance credentials. A container workload that itself used AWS would require separate review rather than silently raising the limit. Do not assign an unreviewed IPv6 address/AAAA record.

## 11–12. Session Manager, publishing dependency and bootstrap

The SSM agent must be running/online with the instance profile and network path. Verify in Fleet Manager or `aws ssm describe-instance-information`; then use `aws ssm start-session --target "$IID"`. Allow role propagation time and diagnose the agent/network/profile if it is not online; do not open SSH as a shortcut.

**Unpushed commits cannot be cloned from GitHub.** The configured remote is `https://github.com/ad8ya089/seller-saathi.git`, but P6 does not push. The user must approve and perform the later push before expecting bootstrap to fetch this implementation. Do not assume the repository is public. For a private repository, provision a read-only deploy key outside Git, mode 0600, and verified GitHub host fingerprints/strict host checking in root's SSH configuration. Use `git@github.com:ad8ya089/seller-saathi.git` or another approved configurable URL; never embed a PAT in a URL or script.

After the approved commit is published, transfer/clone that exact reviewed script revision on the instance, inspect it and run from SSM. A fresh AMI may need Git/Python/curl installed before this initial clone. Do not fetch a remote script and pipe it into Bash.

```bash
# INSTANCE CHANGES, no AWS provisioning: run only after cloud/push approval.
# EXPECTED_COMMIT is a full published 40-character SHA; never a guessed local-only SHA.
sudo env REPO_URL=https://github.com/ad8ya089/seller-saathi.git DEPLOY_BRANCH=main \
  DEPLOY_DIR=/opt/seller-saathi AWS_REGION=ap-south-1 DOMAIN=<your-name>.duckdns.org \
  EXPECTED_COMMIT=<approved-published-sha> \
  bash /path/to/reviewed/deploy/aws-ec2/bootstrap.sh
```

The script verifies Ubuntu 24.04 ARM64 and IMDSv2/region, installs security updates, configures 2 GiB swap before building, installs official Docker packages/Compose and AWS CLI, preserves unrelated daemon JSON settings while setting 10 MiB × three log rotation, verifies repository/clean pinned commit and writes the private env atomically. It builds/starts the app, verifies health and **leaves Caddy stopped**. Repeating bootstrap deliberately stops any prior Caddy before Docker upgrades/restarts. Review reboot-required updates before public use.

`INCLUDE_DEMO_CODE=true` opts into fetching the optional access-code parameter. Deployment URL, branch, directory, region and Compose project are explicit/configurable. The production app has no published host ports, a 700 MiB limit, two private proxy variables only, a 128 MiB Caddy limit and named data/certificate/config volumes. Its bridge network permits provider HTTPS egress; “internal network” here means unpublished service connectivity, not Docker's egress-blocking `internal: true` setting.

## 13–15. DuckDNS, DNS gate and Caddy startup

Use the DuckDNS account UI privately to point the selected hostname to the Elastic IPv4. Keep its token out of Git/Caddy/terminal logs. Remove stale A/AAAA records. Wait for both local resolution and public resolvers to agree; check delegation/caching rather than forcing TLS issuance.

```bash
# INSTANCE ONLY — starts the public listener, so obtain deployment approval first.
sudo env DEPLOY_DIR=/opt/seller-saathi \
  bash /opt/seller-saathi/deploy/aws-ec2/start-caddy.sh <expected-elastic-ipv4>
```

The gate requires all A/AAAA answers from the host plus 1.1.1.1 and 8.8.8.8 to resolve to that IPv4 only, validates Caddy configuration and checks app health before starting **only Caddy**. DNS mismatch fails closed. No real Let's Encrypt order was made during local P6 tests; the local test uses a private internal CA certificate. Production uses Let's Encrypt automatic HTTPS and HTTP→HTTPS redirection.

Caddy overwrites `X-Internal-Proxy-Token` using the runtime `{env.TRUSTED_PROXY_TOKEN}` placeholder and overwrites `X-Real-IP` with the socket peer. Client-supplied forwarding headers never authenticate identity. Keep Caddy directly Internet-facing in this topology; adding another proxy needs a new trusted-client-IP design. Neither expected token nor provider keys are returned to browsers. Provider keys/admin bearer/access code are not passed to Caddy. Default access logging stays off and runtime log formatting removes request headers.

## 16–20. Public acceptance — future manual gates

1. Verify HTTPS certificate and HTTP redirect, `/` and normal `/api/health` return 200. Normal health means configuration, not provider connectivity.
2. Verify `/api/health?verbose=1` returns 404 publicly even with a valid internal bearer. Internal checks through `docker compose exec` may use the bearer; never put it in a URL. Keep ports 22/3000 unreachable from a separate network and 80/443 reachable.
3. Inspect CSP and four `/vad/` assets/MIME types. Mic should prompt after Call on the HTTPS origin. JavaScript `unsafe-eval` remains prohibited; the existing Zod client uses its equivalent interpreted parser and ONNX is allowed only the necessary WASM compilation permission.
4. After separate paid approval, run the configured provider smokes, corrected real S1 retest, full supported persona gate and twenty-turn latency benchmark. Use their existing preflight/budget flags. Do not treat the single configured-session packaging check as an S1 pass.
5. Run a complete public S1 call, verify incremental transcript/sentence/audio SSE, one correct explicit-acceptance ledger record and the plan card. Test actual speakers/headphones/interruptions; software fake-audio checks do not substitute for physical QA.
6. Inspect `/data` volume ownership, save a non-sensitive accepted demo plan, then `docker compose restart app` and verify the same ledger record survives. Expect active sessions/caches/counters to reset.
7. During an approved maintenance window, reboot through SSM, reconnect and verify Docker enabled at boot, app health and Caddy recovery/certificate persistence. No reboot/cloud lifecycle action was executed in P6.
8. Verify actual proxy IP buckets from two clients and attempted spoofing. Local bridge/header tests are preparation evidence, not proof of eventual Internet source-IP handling.

For step 17, use a trusted Node 22 operator checkout at the deployed revision with privately configured keys. The production image intentionally omits development runners. After reviewing and approving their paid scope, execute:

```bash
npm run smoke:sarvam
npm run smoke:gemini
```

These verify the operator's provider configuration; the complete public S1 call separately verifies instance egress and the deployed voice path. Record the actual provider notes and do not substitute local smoke results for public acceptance.

## 21. Update

Choose an idle maintenance window and confirm a retained ledger backup, free disk, available memory and 2 GiB swap. Updates run on the instance, never the laptop. Require a full expected commit, or explicitly set `APPROVED_BRANCH` equal to `DEPLOY_BRANCH` for a reviewed fast-forward branch update.

```bash
sudo env DEPLOY_DIR=/opt/seller-saathi DEPLOY_BRANCH=main \
  EXPECTED_COMMIT=<approved-published-sha> \
  bash /opt/seller-saathi/deploy/aws-ec2/deploy.sh
```

The script checks the existing named `/data` volume, fetches without force, verifies the candidate before a fast-forward merge, validates Caddy and builds a unique commit-tagged image before replacing the app. Build failure leaves the running app untouched. Failed new-app health attempts rollback to the previous image and exits nonzero. If Caddy was stopped it remains stopped; if running, its recorded expected IP must still pass DNS before configuration replacement. Ledger volumes are preserved. A successful update records `.deployed-commit` and `.previous-image` privately; these files are ignored.

## 22. Rollback

Keep the previous image until the new release is accepted. `.previous-image` stores its immutable local image ID. On health failure the script attempts an immediate app-image rollback; independently inspect health through SSM. A build failure may leave Git fast-forwarded while the old container continues running; this is deliberate and no forced Git rollback occurs.

For a manual rollback, retain the same Compose project and absolute app env path, set `APP_IMAGE` to the known-good image ID and run production Compose `up -d --no-build --wait app`. Do not rebuild the bad commit. If Caddy/Compose changed, create a separate detached Git worktree at the previous approved commit and use that worktree's Compose/Caddy files with the **same project and volume names** and an explicit `APP_ENV_FILE=/opt/seller-saathi/.env`; pass DNS again before Caddy recreation. Inspect volume mounts before rollout. Never reset/clean the live checkout or delete data volumes.

Example for an image-only rollback with the default directory/project, after reviewing `.previous-image` through SSM:

```bash
sudo bash -c '
  set -euo pipefail
  cd /opt/seller-saathi
  export APP_IMAGE="$(cat .previous-image)" APP_ENV_FILE=/opt/seller-saathi/.env
  docker compose --project-name seller-saathi --env-file "$APP_ENV_FILE" \
    -f deploy/aws-ec2/compose.prod.yml up -d --no-build --wait app
'
```

## 23. Pause and deliberate teardown

Stopping an instance stops its compute workload but **does not stop all charges**: EBS, retained public IPv4/Elastic IP, snapshots and other resources can continue billing. Session Manager is unavailable while it is stopped. Confirm the evaluation window and retained ledger backup first.

```bash
# CLOUD LIFECYCLE CHANGES — operator executes only with explicit approval.
aws ec2 stop-instances --instance-ids "$IID"           # pause; disk/IP may still bill
# Later full teardown, after a deliberate backup/retention decision:
aws ec2 terminate-instances --instance-ids "$IID"      # root EBS may be deleted
aws ec2 wait instance-terminated --instance-ids "$IID"
aws ec2 release-address --allocation-id "$ALLOC"       # separate IP release
```

Then deliberately remove the project security group, optional budget, app SecureString parameters, inline/managed role attachments, instance profile/role and any separately created KMS key according to its retention policy; delete the DuckDNS record. Use `aws ssm delete-parameters --names` with the exact four/five app names, not broad paths. IAM cleanup needs removing the role from the instance profile and deleting the profile before the role. KMS key deletion has a waiting period and can make retained encrypted data unreadable. Inventory retained disks/snapshots/IPs and confirm billing after teardown. None of these operations is automatic in P6.

## References checked for preparation

- [Official Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/) and [Compose interpolation semantics](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
- [Caddy streaming and header handling](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [request matchers](https://caddyserver.com/docs/caddyfile/matchers).
- [AWS managed SSM role policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonSSMManagedInstanceCore.html), [SSM/KMS encryption](https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html), [Canonical image discovery](https://ubuntu.com/aws/docs/aws-how-to/instances/find-ubuntu-images/).
- [Node verification on GitHub Actions](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs), [Next client initialization hook](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client). Local verification and remaining limits are in [P6 report](../../docs/p6-report.md).

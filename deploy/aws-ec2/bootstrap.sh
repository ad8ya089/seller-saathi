#!/usr/bin/env bash
# INSTANCE ONLY. Installs host packages and reads existing SSM parameters; creates no AWS resources.
set -euo pipefail
set +x
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$SCRIPT_DIR/common.sh"
require_root
preflight_host
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git python3
configure
: "${DOMAIN:?Set the approved DNS hostname}"
: "${EXPECTED_COMMIT:?Set the full approved and already published commit SHA}"
[[ $EXPECTED_COMMIT =~ ^[0-9a-f]{40}$ ]] || fail 'EXPECTED_COMMIT must be a full SHA.'
export DEBIAN_FRONTEND=noninteractive
export AWS_REGION=${AWS_REGION:-ap-south-1}
export AWS_DEFAULT_REGION=$AWS_REGION
# Prove this is an IMDSv2-capable instance without printing its token or identity.
metadata_token=$(curl -fsS --max-time 3 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token) || fail 'IMDSv2 unavailable.'
metadata_region=$(printf 'header = "X-aws-ec2-metadata-token: %s"\n' "$metadata_token" | curl -fsS --max-time 3 --config - http://169.254.169.254/latest/meta-data/placement/region)
unset metadata_token
[[ $metadata_region == "$AWS_REGION" ]] || fail 'Configured region differs from instance metadata.'
if [[ ! -e /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 0600 /swapfile
  mkswap /swapfile >/dev/null
fi
[[ -f /swapfile && ! -L /swapfile && $(stat -c %s /swapfile) -ge 2147483648 ]] || fail 'Existing /swapfile is unsuitable; inspect manually.'
chmod 0600 /swapfile
swapon --show=NAME --noheadings | grep -Fxq /swapfile || swapon /swapfile
grep -Eq '^/swapfile[[:space:]]' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
if [[ -f $APP_ENV_FILE && -f $DEPLOY_DIR/deploy/aws-ec2/compose.prod.yml ]] && command -v docker >/dev/null; then
  "${compose[@]}" stop caddy
fi
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git jq python3 dnsutils unzip awscli
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nArchitectures: arm64\nSigned-By: /etc/apt/keyrings/docker.asc\n' > /etc/apt/sources.list.d/docker.sources
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
# Preserve unrelated daemon settings; restart only when the rotation settings changed.
install -d /etc/docker
changed=$(python3 - <<'PY'
import json, os, tempfile
from pathlib import Path
path = Path('/etc/docker/daemon.json')
old = json.loads(path.read_text()) if path.exists() else {}
new = dict(old)
new['log-driver'] = 'json-file'
new['log-opts'] = {**new.get('log-opts', {}), 'max-size': '10m', 'max-file': '3'}
if new != old:
    fd, temp = tempfile.mkstemp(dir=path.parent)
    with os.fdopen(fd, 'w') as stream:
        json.dump(new, stream)
    os.chmod(temp, 0o644)
    os.replace(temp, path)
    print('yes')
PY
)
systemctl enable --now docker
# A repeat bootstrap must not restart a previously configured public proxy.
if [[ -f $APP_ENV_FILE && -f $DEPLOY_DIR/deploy/aws-ec2/compose.prod.yml ]]; then
  "${compose[@]}" stop caddy
fi
[[ $changed != yes ]] || systemctl restart docker
if [[ ! -d $DEPLOY_DIR/.git ]]; then
  [[ ! -e $DEPLOY_DIR ]] || fail 'Deployment directory exists without a Git checkout; inspect manually.'
  GIT_TERMINAL_PROMPT=0 git clone --single-branch --branch "$DEPLOY_BRANCH" -- "$REPO_URL" "$DEPLOY_DIR"
fi
cd -- "$DEPLOY_DIR"
[[ -z $(git status --porcelain) && $(git rev-parse HEAD) == "$EXPECTED_COMMIT" ]] || fail 'Checkout is dirty or does not match the approved published commit.'
[[ $(git remote get-url origin) == "$REPO_URL" ]] || fail 'Repository origin differs from configured repository.'
secret_options=()
include_demo=${INCLUDE_DEMO_CODE:-}
if [[ -f $APP_ENV_FILE ]]; then
  secret_options+=(--existing "$APP_ENV_FILE")
  if [[ -z $include_demo ]]; then
    include_demo=$(PYTHONPATH="$DEPLOY_DIR/deploy/aws-ec2" python3 -c 'import sys; from pathlib import Path; from envfile import load; print("true" if load(Path(sys.argv[1])).get("DEMO_ACCESS_CODE") else "false")' "$APP_ENV_FILE")
  fi
fi
[[ -n $include_demo ]] || include_demo=false
[[ $include_demo == true || $include_demo == false ]] || fail 'INCLUDE_DEMO_CODE must be true or false.'
[[ $include_demo != true ]] || secret_options+=(--include-demo-code)
python3 deploy/aws-ec2/envfile.py --defaults .env.example --output "$APP_ENV_FILE" --domain "$DOMAIN" --region "$AWS_REGION" "${secret_options[@]}"
capacity
export APP_IMAGE="seller-saathi:$EXPECTED_COMMIT"
"${compose[@]}" config --quiet
validate_caddy
"${compose[@]}" build app
"${compose[@]}" up -d --no-build --wait --wait-timeout 120 app
healthy || fail 'App health failed; Caddy remains stopped.'
printf '%s\n' "$EXPECTED_COMMIT" > .deployed-commit
printf 'Bootstrap complete: app healthy; Caddy stopped until start-caddy.sh passes DNS. Review /var/run/reboot-required before public use.\n'

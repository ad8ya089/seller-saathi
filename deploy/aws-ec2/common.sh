#!/usr/bin/env bash
# Sourced by the instance-only scripts. Never source the application .env.
set -euo pipefail
set +x
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
require_root() { [[ $EUID -eq 0 ]] || fail 'Run through Session Manager using sudo.'; }
configure() {
  DEPLOY_DIR=${DEPLOY_DIR:-/opt/seller-saathi}
  DEPLOY_BRANCH=${DEPLOY_BRANCH:-main}
  if [[ -z ${REPO_URL:-} ]]; then
    if [[ -d $DEPLOY_DIR/.git ]]; then
      REPO_URL=$(git -C "$DEPLOY_DIR" remote get-url origin)
    else
      REPO_URL=https://github.com/ad8ya089/seller-saathi.git
    fi
  fi
  COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-seller-saathi}
  [[ $DEPLOY_DIR == /* && $DEPLOY_DIR != / && ! -L $DEPLOY_DIR ]] || fail 'Use an absolute, nonsymlink deployment directory.'
  [[ $COMPOSE_PROJECT_NAME =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'Invalid Compose project name.'
  git check-ref-format --branch "$DEPLOY_BRANCH" >/dev/null 2>&1 || fail 'Invalid deployment branch.'
  python3 - "$REPO_URL" <<'PY'
import sys
from urllib.parse import urlsplit
value = sys.argv[1]
parsed = urlsplit(value)
valid = (parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password)
valid = valid or (parsed.scheme == 'ssh' and parsed.hostname and parsed.username == 'git' and not parsed.password)
valid = valid or (value.startswith('git@') and ':' in value and not any(c.isspace() for c in value))
if not valid or '\n' in value:
    raise SystemExit('Use HTTPS without credentials or a separately provisioned SSH deploy key.')
PY
  export APP_ENV_FILE="$DEPLOY_DIR/.env"
  compose=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$APP_ENV_FILE" -f "$DEPLOY_DIR/deploy/aws-ec2/compose.prod.yml")
}
preflight_host() {
  [[ -r /etc/os-release ]] || fail 'Ubuntu 24.04 required.'
  # OS metadata is administrator-owned, unlike an application .env.
  # shellcheck source=/dev/null
  . /etc/os-release
  [[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || fail 'Ubuntu 24.04 required.'
  [[ $(dpkg --print-architecture) == arm64 ]] || fail 'This runbook targets Ubuntu ARM64.'
}
capacity() {
  local available_kib free_kib swap_kib
  available_kib=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
  swap_kib=$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)
  free_kib=$(df -Pk "$DEPLOY_DIR" | awk 'NR==2 {print $4}')
  (( available_kib >= 600000 )) || fail 'Need at least 600000 KiB currently available RAM before building.'
  (( swap_kib >= 2097152 )) || fail 'Enable at least 2 GiB swap before building.'
  (( free_kib >= 5242880 )) || fail 'Need at least 5 GiB free disk before building; do not delete volumes to make room.'
}
validate_caddy() {
  "${compose[@]}" run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
}
healthy() {
  local container
  container=$("${compose[@]}" ps -q app)
  [[ -n $container && $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]]
}

#!/usr/bin/env bash
# INSTANCE ONLY. Fast-forward rollout; no cloud provisioning, force checkout or volume deletion.
set -euo pipefail
set +x
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$SCRIPT_DIR/common.sh"
require_root
configure
preflight_host
cd -- "$DEPLOY_DIR"
[[ -z $(git status --porcelain) ]] || fail 'Checkout is dirty; resolve it manually.'
[[ $(git remote get-url origin) == "$REPO_URL" ]] || fail 'Repository origin differs from approved repository.'
if [[ -n ${EXPECTED_COMMIT:-} ]]; then
  [[ $EXPECTED_COMMIT =~ ^[0-9a-f]{40}$ ]] || fail 'EXPECTED_COMMIT must be a full SHA.'
else
  [[ ${APPROVED_BRANCH:-} == "$DEPLOY_BRANCH" ]] || fail 'Require EXPECTED_COMMIT or explicit APPROVED_BRANCH matching DEPLOY_BRANCH.'
fi
capacity
volume="${COMPOSE_PROJECT_NAME}_kamdata"
docker volume inspect "$volume" >/dev/null || fail 'Persistent ledger volume missing; do not create a replacement during an update.'
container=$("${compose[@]}" ps -q app)
[[ -n $container ]] || fail 'No existing app; use bootstrap for the first rollout.'
actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")
[[ $actual_volume == "$volume" ]] || fail 'Existing app uses an unexpected data volume.'
previous=$(docker inspect --format '{{.Image}}' "$container")
proxy=$("${compose[@]}" ps -q caddy)
if [[ -n $proxy ]]; then
  [[ -s .expected-eip ]] || fail 'No approved IP recorded; use the DNS gate first.'
  python3 deploy/aws-ec2/dns_gate.py "$APP_ENV_FILE" "$(cat .expected-eip)"
fi
GIT_TERMINAL_PROMPT=0 git fetch --no-tags origin "$DEPLOY_BRANCH"
candidate=$(git rev-parse FETCH_HEAD)
[[ -z ${EXPECTED_COMMIT:-} || $candidate == "$EXPECTED_COMMIT" ]] || fail 'Fetched branch does not match EXPECTED_COMMIT; running app unchanged.'
git merge-base --is-ancestor HEAD "$candidate" || fail 'Update is not a fast-forward.'
git merge --ff-only "$candidate"
export APP_IMAGE="seller-saathi:$candidate"
"${compose[@]}" config --quiet
validate_caddy
# Unique commit tag: a failed build cannot replace the running image.
"${compose[@]}" build app
printf '%s\n' "$previous" > .previous-image
if ! "${compose[@]}" up -d --no-build --wait --wait-timeout 120 app || ! healthy; then
  export APP_IMAGE="$previous"
  "${compose[@]}" up -d --no-build --wait --wait-timeout 120 app || true
  fail 'New app failed health; previous image rollback attempted. Inspect health through SSM.'
fi
if [[ -n $proxy ]]; then
  "$DEPLOY_DIR/deploy/aws-ec2/start-caddy.sh" "$(cat .expected-eip)"
fi
printf '%s\n' "$candidate" > .deployed-commit
printf 'Deployment healthy: commit %s; previous image %s; persistent volume %s retained.\n' "$candidate" "$previous" "$volume"

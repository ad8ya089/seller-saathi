#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
. "$SCRIPT_DIR/common.sh"
require_root
configure
expected=${1:?Usage: start-caddy.sh EXPECTED_ELASTIC_IPV4}
cd -- "$DEPLOY_DIR"
python3 deploy/aws-ec2/dns_gate.py "$APP_ENV_FILE" "$expected"
healthy || fail 'App is not healthy; Caddy was not started.'
validate_caddy
# Never recreate the app or change its image from this DNS-only operation.
"${compose[@]}" up -d --no-deps --no-build --force-recreate caddy
"${compose[@]}" exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
printf '%s\n' "$expected" > .expected-eip
printf 'Caddy started after DNS and configuration checks. Verify public HTTPS and health manually.\n'

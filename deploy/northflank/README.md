# Northflank Sandbox candidate

Use [the manual runbook](../../docs/11-northflank-runbook.md). Account eligibility,
payment-method acceptance, GitHub authorization, runtime secrets, resource creation
and deployment are operator-only. No API/CLI provisioning script is provided.

Reuse the root Dockerfile unchanged: Node 22, non-root, standalone, injected port
8080, generated VAD assets and temporary bounded ledger. One combined service,
one replica, `nf-compute-50` only if Sandbox allows it, Delhi, no volumes/addons.
Keep conservative `PROXY_MODE=caddy` without a proxy token and configure `DOMAIN`
to the generated HTTPS hostname. Do not use Cloud Run's forwarded-header mode.

Local-only verification after building the image:

```powershell
docker build --platform linux/amd64 -t seller-saathi:northflank .
node scripts/deployment/bundle.mjs
node scripts/deployment/cloud-run-local.mjs 8082 northflank
```

The reused checker selects 0.5 local CPU, 1 GiB Docker memory, keyless settings and
host 8082 → container 8080. Docker's 1 GiB limit is not a measurement of the platform's
advertised 1 GB accounting. It only removes its own temporary test container.
No real provider peak RSS or public Northflank behavior is inferred from this check.

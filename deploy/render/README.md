# Render Free readiness

Follow [the manual runbook](../../docs/12-render-free-runbook.md). No provisioning
API/CLI/Blueprint, card, paid plan or provider call is authorized. Use the unchanged
Dockerfile, one Free service, Singapore only if offered, PORT=10000 and the exact
generated DOMAIN. The constrained report must pass first; real-call peak is unknown.
The measured HTTP/browser/fake S1 gates passed, but Docker's built-in Node probe
remained unhealthy at 0.1 CPU. This is conditional readiness; review the report's
health caveat before any operator deployment.

```powershell
docker build --platform linux/amd64 -t seller-saathi:render .
node scripts/deployment/bundle.mjs
node scripts/deployment/cloud-run-local.mjs 8082 render
```

The local checker uses 512 MiB/0.1 CPU, empty keys and no volume, records selected
safe state/resources and removes only its exact created container ID. The five-minute
cold-health polling window can finish later for an in-flight request; the three warm
HTTP checks each enforce five seconds. These waits do not alter application/provider
deadlines or bypass idle sleep. Docker probe status is recorded separately. Passing
is not proof that real voice fits Render Free.

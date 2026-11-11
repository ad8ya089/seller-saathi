# 10 — Manual Cloud Run runbook

**SUPERSEDED — not the active deployment path.** The operator's available Google
billing account requires a ₹1,000 prepayment, so GCP setup is stopped. Use the
[Northflank candidate runbook](11-northflank-runbook.md), subject to its account,
card and allowance checks. The commands/details below are historical; do not run
them as part of the current Northflank preparation.

This is an optional operator procedure, **not executed by the coding task**.
Use Windows PowerShell 5.1 from the repository root. No AWS, Roster Sync, DNS,
Caddy, custom domain, load balancer, database or persistent storage is involved.
Source deployment necessarily uses Cloud Build and Artifact Registry for its
Docker build/artifact; those prerequisites can incur charges too.

## Before the deployment timer

1. In Google Cloud Console, confirm the signed-in identity is your own personal
   account and the billing account/payment method is yours. Stop for a school or
   employer account, unclear ownership, denied permissions or unapproved payment
   verification. Do not borrow the AWS profile or an unrelated GCP project.
2. Install the official [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
   Then personally run `gcloud --version`, `gcloud auth login`, `gcloud auth list`.
   Confirm the active identity again. Never paste credentials into this repo or chat.
3. Choose a unique new project ID and your own billing account ID. Set these
   non-secret PowerShell variables, then create/link only the new isolated project:

   ```powershell
   $ProjectId = 'YOUR-UNIQUE-PERSONAL-PROJECT'
   $BillingAccount = 'YOUR-OWN-BILLING-ACCOUNT'
   gcloud projects create $ProjectId
   gcloud billing projects link $ProjectId --billing-account $BillingAccount
   ```

4. In Console Billing, create a budget alert for this project, choose thresholds
   and verify notification recipients. Alerts **do not automatically stop charges**.
5. Enable only the source-deployment/secret prerequisites:

   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project $ProjectId
   gcloud iam service-accounts create sellersaathi-runtime --project $ProjectId
   ```

6. In **Console Secret Manager UI**, create `sellersaathi-gemini` and
   `sellersaathi-sarvam`. Enter each provider key directly into that UI, not a
   terminal, command argument, plaintext temporary file or env YAML. Record only
   the numeric enabled version IDs. Grant `roles/secretmanager.secretAccessor`
   on each of these two individual secrets to
   `sellersaathi-runtime@PROJECT_ID.iam.gserviceaccount.com`. Do not grant runtime
   project-wide Secret Accessor, Editor, build or deployment permissions.
7. The deploying principal needs Cloud Run Source Developer
   (`roles/run.sourceDeveloper`), Service Usage Consumer
   (`roles/serviceusage.serviceUsageConsumer`), and Service Account User
   (`roles/iam.serviceAccountUser`) on the dedicated runtime identity. Setting public
   invocation also needs `run.services.setIamPolicy` (for example Cloud Run Admin
   on the deploying principal). API enablement/IAM setup needs its own appropriate
   owner/admin permissions; never solve this by granting runtime Editor.
   The build identity, normally the Compute Engine default service account after
   Cloud Run API enablement, needs `roles/run.builder` on this project. Confirm its
   actual identity and role in Console; do not confuse it with the runtime identity.
   Check organization policies permit public invocation. Stop on restrictions.

These prerequisites follow [Google's source deployment guide](https://cloud.google.com/run/docs/deploying-source-code)
and [secret configuration guide](https://cloud.google.com/run/docs/configuring/services/secrets).
No runtime Google API credentials are downloaded or embedded in the image.

## Review local configuration and upload

Copy `.env.cloudrun.example.yaml` to ignored `env.cloudrun.yaml`. It contains **only
non-secret settings**. Replace the model and speaker placeholders with explicit
English settings chosen from `docs/provider-notes.md`; do not copy the local `.env`.
Keep Hindi disabled, transcripts disabled and daily cap 50. Local tests have not
reverified these providers live. Do not put PORT in this file: Cloud Run injects it.
Project, service, region and numeric secret versions are separate deployment parameters.

Manually run:

```powershell
gcloud meta list-files-for-upload
```

Inspect the list **before deploying**. It must exclude `.env*`, `env.cloudrun.yaml`,
`.data`, `.tmp`, credentials, logs, screenshots, `.git`, `node_modules` and `.next`.
It must include the root Dockerfile, `.dockerignore`, package manifests/lockfile,
Next config, `src`, synthetic `data`, `public` and `scripts/copy-vad-assets.mjs`
and startup/health scripts. `.gcloudignore` includes `.gitignore` then adds explicit
exclusions. `.env.cloudrun.example.yaml` is a Git-only non-secret exception and is
still excluded from upload. Generated `public/vad` is intentionally absent: npm ci
postinstall generates its four pinned assets during the Docker dependency build.
Actual gcloud upload-list verification remains manual because this task forbids gcloud execution.

## Deploy — timer starts here after all prerequisites pass

Start a 60-minute timer for deployment **and public smoke**. Use your explicit new
project ID and the enabled numeric versions from Console (the `1`s are examples):

```powershell
.\deploy\cloud-run\deploy.ps1 -ProjectId $ProjectId -GeminiVersion 1 -SarvamVersion 1 -EnvFile .\env.cloudrun.yaml -Deploy
```

Without `-Deploy`, the script only validates local inputs and does not call gcloud.
The script itself was not executed during preparation; PowerShell syntax and its
deployment contract are checked offline. It supplies `--source .`, explicit project,
`--region asia-south1 --port 8080 --cpu 1 --memory 1Gi --min 0 --max 1
--concurrency 5 --timeout 120 --cpu-boost --cpu-throttling --allow-unauthenticated`,
the dedicated runtime identity, non-secret env-vars file and pinned Secret Manager
references. It never prints environment contents or rendered secret arguments.
Source builds use the root Dockerfile; the runtime must be Linux amd64/x86_64.
No ARM-only image is deployed. Do not change the existing EC2 Docker/Caddy kit.

Get the direct URL after deployment:

```powershell
$Url = gcloud run services describe seller-saathi --project $ProjectId --region asia-south1 --format='value(status.url)'
```

Keep the returned `run.app` hostname. Do not add DNS or an external proxy.

## Public smoke — functional acceptance before video

- `Invoke-RestMethod "$Url/api/health"`: HTTP 200, `ok=true`, both provider-configured
  flags true, no secrets. Health checks configuration only and makes no provider calls.
- Open `$Url` in Chrome: HTTPS page, synthetic-data/not-connected label and
  **temporary demo ledger** notice visible. No claim of real Snapdeal actions.
- Network: `/vad/silero_vad_v6.onnx` is 200 `application/octet-stream`;
  `/vad/ort-wasm-simd-threaded.wasm` is 200 `application/wasm`;
  `/vad/ort-wasm-simd-threaded.mjs` and `/vad/vad.worklet.bundle.min.js` are 200 JavaScript.
- Inspect HSTS, nosniff, Referrer-Policy, `Permissions-Policy: microphone=(self)`
  and CSP. Console has no CSP, WASM, worklet, asset or microphone permission errors.
  The CSP permits same-origin assets, blob workers and WASM compilation; JS
  `unsafe-eval` is not allowed. Inline hydration/styles retain their required allowance.
- Click Call; microphone prompt appears; greeting plays after that gesture. Speak
  one complete S1: sales dropped → bestsellers OOS/supplier late → ten days →
  review 2–3 actions → explicit acceptance. Diagnosis/evidence and plan update;
  nothing commits before verified acceptance. Temporary save and follow-up date appear.
- DevTools: SSE has `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`;
  sentences/audio/state arrive incrementally, not at the end, with no compression.
  Test End Call/interruption, no duplicate commitment, and recoverable text/error paths.
- Verify direct frontend IP trust from controlled requests: a caller-supplied XFF
  prefix must not change the final observed client bucket. Compare with your known
  egress address using private Cloud Run diagnostics if needed; never publish raw
  client IPs or add a public debug endpoint. If the right-most-hop assumption cannot
  be verified, do not declare IP protection proven; disable the public demo or use
  the shared conservative Caddy-mode bucket while investigating with explicit approval.
- Repeat a functional call from a mobile browser on mobile data only if required
  to complete mobile acceptance; do not launch persona/benchmark runs or 30 real
  turns for cap testing. Caps are covered offline. Note any extra paid calls explicitly.
- Inspect sanitized logs: no keys, secret values or raw seller transcripts.
- Record actual first audio values, last VAD speech frame → scheduled Web Audio
  playback (not physical output), sample count and p50/p95. Text starts at Send.
  Use all collected turns; mark small samples and cold/warm distinction. The old
  3.7-second target is a separate performance result, not this deployment gate.

The official [container contract](https://cloud.google.com/run/docs/container-contract)
documents PORT/listening and ephemeral memory-backed storage; it does not guarantee
the XFF format assumed by the explicit one-hop mode. The live checks above remain mandatory.

## Cost, warm window and cleanup

[Published Cloud Run rates](https://cloud.google.com/run/pricing) checked 2026-11-11
list Mumbai. Request-based active CPU is US$0.000024/vCPU-second and memory
US$0.0000025/GiB-second; idle minimum-instance CPU/memory rates are each
US$0.0000025 per corresponding second. At 604,800 idle seconds, one 1-vCPU/1-GiB
minimum instance costs approximately **US$3.02 per seven days**; 512 MiB would be
US$2.27, but is not selected without peak evidence. Zero minimum instances avoids
idle-instance charges, not request/startup/shutdown/CPU-boost, build, artifact,
logging, network or provider charges. Free tier is shared across billing-account
projects; do not promise a zero bill. Budgets and restart-reset in-memory caps are
not hard billing limits. Gemini/Sarvam charges are separate.

Only after successful smoke, optionally enable one warm instance for the demo window:

```powershell
gcloud run services update seller-saathi --project $ProjectId --region asia-south1 --min 1
# After the short demo window:
gcloud run services update seller-saathi --project $ProjectId --region asia-south1 --min 0
```

Warm minimum reduces cold starts; it guarantees neither uptime nor saved state.
Both JSONL files refuse growth beyond 8 MiB each without deleting ownership/audit
records. A failed append is recoverable and cannot report a successful save.
All files/sessions/counters can still vanish with an instance. Review remaining
revision traffic, not only the latest revision, when assessing ongoing costs.

At the 60-minute failure stop, or after the evaluation window: delete the service
with `gcloud run services delete seller-saathi --project $ProjectId --region asia-south1`.
In the new isolated project's Console, review/delete build artifacts/images and
unneeded secrets/resources, revoke runtime grants and rotate/revoke the dedicated
provider keys at the providers. Deleting only the service may leave artifact or
other charges. Shut down the isolated project in Console when no longer needed
and verify billing; never delete an unrelated project. Then use local Compose for
the fallback recording. No recording or teardown is performed by this coding task.

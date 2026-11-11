[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId,
  [ValidateSet('asia-south1')][string]$Region = 'asia-south1',
  [ValidateSet('seller-saathi')][string]$Service = 'seller-saathi',
  [string]$EnvFile = 'env.cloudrun.yaml',
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$RuntimeAccount = 'sellersaathi-runtime',
  [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$GeminiSecret = 'sellersaathi-gemini',
  [ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$SarvamSecret = 'sellersaathi-sarvam',
  [Parameter(Mandatory=$true)][ValidatePattern('^[1-9][0-9]*$')][string]$GeminiVersion,
  [Parameter(Mandatory=$true)][ValidatePattern('^[1-9][0-9]*$')][string]$SarvamVersion,
  [switch]$Deploy
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $root
try {
  if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw 'Install Google Cloud CLI first.' }
  foreach ($file in @('Dockerfile','.dockerignore','.gcloudignore','package-lock.json','scripts/copy-vad-assets.mjs',$EnvFile)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'A required deployment input is missing.' }
  }
  # Deliberately accept only a flat string map, never general YAML tags or nesting.
  # Reject unknown keys so accidental provider credentials cannot enter the file.
  $required = @('NODE_ENV','HOSTNAME','DATA_DIR','PROXY_MODE','DAILY_TURN_CAP','LOG_TRANSCRIPTS','HINGLISH_ENABLED','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','SARVAM_STT_MODEL','SARVAM_STT_LANGUAGE','SARVAM_STT_MODE','SARVAM_TTS_MODEL','SARVAM_TTS_SPEAKER','SARVAM_TTS_LANGUAGE')
  $settings = @{}
  foreach ($line in [IO.File]::ReadAllLines((Resolve-Path -LiteralPath $EnvFile))) {
    if ($line -match '^\s*(#.*)?$') { continue }
    if (-not ($line -match "^([A-Z][A-Z0-9_]*):\s*'([A-Za-z0-9_.:/-]+)'\s*$" -or $line -match '^([A-Z][A-Z0-9_]*):\s*"([A-Za-z0-9_.:/-]+)"\s*$')) { throw 'Use the flat quoted-string example format.' }
    $key, $value = $Matches[1], $Matches[2]
    if ($required -notcontains $key -or $settings.ContainsKey($key) -or $value -match 'REPLACE') { throw 'Unexpected, duplicate or unfinished non-secret setting.' }
    $settings[$key] = $value
  }
  foreach ($key in $required) { if (-not $settings.ContainsKey($key)) { throw 'A required non-secret setting is missing.' } }
  $fixed = @{NODE_ENV='production';HOSTNAME='0.0.0.0';DATA_DIR='/tmp/kam';PROXY_MODE='cloud-run';DAILY_TURN_CAP='50';LOG_TRANSCRIPTS='false';HINGLISH_ENABLED='false';SARVAM_TTS_LANGUAGE='en-IN'}
  foreach ($key in $fixed.Keys) { if ($settings[$key] -ne $fixed[$key]) { throw 'Deployment safety settings differ from the reviewed example.' } }
  if (-not $Deploy) { Write-Host 'Local inputs validated. No cloud command executed. Add -Deploy only after manual prerequisites and upload review.'; return }
  $arguments = @('run','deploy',$Service,'--source','.', '--project',$ProjectId,'--region',$Region,
    '--port','8080','--cpu','1','--memory','1Gi','--min','0','--max','1','--concurrency','5','--timeout','120',
    '--cpu-boost','--cpu-throttling','--allow-unauthenticated',
    '--service-account',"$RuntimeAccount@$ProjectId.iam.gserviceaccount.com",'--env-vars-file',$EnvFile,
    '--set-secrets',"GEMINI_API_KEY=${GeminiSecret}:${GeminiVersion},SARVAM_API_KEY=${SarvamSecret}:${SarvamVersion}")
  # Never echo the arguments or environment contents. Secret references, not values.
  & gcloud @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Deployment did not succeed. Inspect sanitized CLI status and follow the hard-stop/cleanup instructions.' }
} finally { Pop-Location }

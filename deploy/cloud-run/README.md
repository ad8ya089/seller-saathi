# Optional Cloud Run deployment

Follow [the complete manual runbook](../../docs/10-cloud-run-runbook.md).
Windows PowerShell 5.1 is the supported operator shell. There is no second Bash
implementation to drift. `deploy.ps1` requires explicit project and numeric secret
versions; only `-Deploy` executes a cloud command. Do not use the EC2 kit for this path.

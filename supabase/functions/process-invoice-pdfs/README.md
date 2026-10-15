# process-invoice-pdfs

Server-only durable issuance/PDF worker. POST an empty JSON body with
`Authorization: Bearer <INVOICE_PDF_WORKER_SECRET>`. There is no browser
invocation or browser service key. Missing/wrong credentials fail `401` before a
claim; missing server config fails `500`. Success is
`{processed:number,rendered:number}`; an uncertain infrastructure/callback
failure returns `503`. Database jobs retain retry/lease state.

This function alone sets `verify_jwt=false` because it implements a separate
server-only secret. The authenticated upload and legacy generator retain
`verify_jwt=true`. Generate the worker secret independently with at least 32
random bytes, and provision the same value in Edge Secrets
(`INVOICE_PDF_WORKER_SECRET`) and Vault (`invoice_pdf_worker_secret`). Store the
full endpoint URL in Vault as `invoice_pdf_worker_url`. Never reuse a
publishable/anon/service key as the worker secret.

The worker claims exactly one persisted job per iteration, processes at most
four issue-only leases and stops immediately after at most one PDF render. It
calls only the service RPCs `claim_invoice_billing_jobs`,
`process_invoice_billing_job` and `complete_invoice_billing_job`. Successful PDF
completion updates the invoice metadata and job together. Rendering/upload
failure records a generic failure on the same leased job, retaining invoice ID,
number and financial snapshots. A lost success callback is not converted into a
failure callback. Recovery uses the existing owner/COO
`retry_invoice_billing_job` API and the same invoice; manual generation of every
new statement invoice is blocked.

Generated canonical destination: `invoices/{invoiceId}.pdf`. The process RPC
only returns render work for self-billing sources; uploaded originals never
enter the renderer. Private uploads use service credentials with `upsert:true`
only on that generated canonical path. Fonts/wordmark are shared with the legacy
renderer and explicitly bundled in this function's `static_files` configuration.

Deployment/setup after all feature review:

1. Confirm the intended linked project. Apply the reviewed migration. Deploy
   this function, `upload-invoice-document`, and the guarded legacy generator
   using the Docker bundler (no `--use-api`, because the fonts/PNG are static
   files).
2. Generate the secret into a private mode-600 env file. Provision with
   `supabase secrets set --env-file <private-file>`. Avoid credentials in shell
   arguments, Git, logs, or VITE/app bundles.
3. Use a separate private mode-600 SQL file to create/update the two named Vault
   entries. Current CLI `db query --linked --file <private-file>` uses the
   Management API; no permanent bootstrap RPC is needed. Capture CLI
   stdout/stderr in private files and only report sanitized status. Never
   echo/decode the credential.
4. Apply `schedule.sql` once. The named `crewflow-invoice-pdfs` Cron job runs
   every minute via `pg_cron` + `pg_net`, obtains the credential from Vault at
   invocation, and survives browser/app closure. Reapplying the named schedule
   updates it instead of creating duplicate schedules. Inspect `cron.job`,
   `cron.job_run_details`, and `net._http_response` without selecting/decrypting
   secrets.
5. Verify an actual scheduled invocation and a persisted completed PDF job. Root
   performs hosted provisioning only after all feature gates; Task2 tests use
   localhost only.

This stays within the hosted 2-second CPU / 256-MB limits by rendering one
document at most. Exact runtime/large-document behavior is covered by the local
Edge integration; very large documents may fail and retain a retryable durable
job. No browser retry loop or Codex automation is required.

Local integration:
`node supabase/tests/invoice-documents.integration.mjs <private-demo-credentials-dir> <private-worker-env-file>`.
It requires `http://127.0.0.1:55321` and disposable `@crewflow-demo.test`
accounts. Fixture job timers must be snapshotted durably before any temporary
delay; all pre-existing fields are restored in `finally`. The only permanent
artifacts are clearly marked fake invoice/report/doc versions and the local test
user. The temporary Cron job is removed after proof. A database-only
ownership-rebind regression is
`supabase/tests/invoice-document-owner-binding.test.sql` and rolls back
entirely.

The exact setup invocation is
`supabase db query --linked --file <absolute-path-to-schedule.sql>` after Vault
provisioning. Teardown uses the same command with `teardown-schedule.sql`
(`select cron.unschedule('crewflow-invoice-pdfs')`); this stops future
invocations and retains queued work and both credential stores. Local
equivalents always use
`--local --workdir /Users/peetax/Projekty/.crewflow-demo-20261012` and an
absolute SQL path. Stop the schedule before restoring a fixture snapshot; wait
for any current request to finish. A private `RESTORE.txt` and independently
runnable
`invoice-job-test-state.mjs restore <before-job-timers.private.json> <private-local-credentials-dir>`
command are saved before test delays. The helper locks and verifies exact
captured IDs and every non-timer field, atomically restores, then compares
complete rows; SIGINT/SIGTERM use the same cleanup. A forced process kill can
use the persisted command.

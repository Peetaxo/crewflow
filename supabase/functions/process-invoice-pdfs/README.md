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
`invoice-job-test-state.mjs restore <before-job-timers.private.json> <private-local-credentials-dir> <worker-drain.private.json>`
command are saved before test delays. The helper locks and verifies exact
captured IDs and every non-timer field, atomically restores, then compares
complete rows; SIGINT/SIGTERM use the same cleanup. After a forced process kill,
use the saved command only with a successful drain receipt; otherwise leave
timers delayed.

Test interruption and independent recovery:

- The integration harness captures each Cron request ID in a private local
  ledger and serializes enqueue/stop through a private enabled row. This wrapper
  exists only in tests; the deployed schedule stays `schedule.sql`. Stopping
  also fences a late-dispatched command, then drains every queued/in-flight
  request. Signals stop later main actions; only the main `finally` restores
  fixtures after recognized complete handler responses.
- `worker-drain.private.json` is written before restoration. The independent
  command is
  `node supabase/tests/invoice-job-test-state.mjs restore <before-job-timers.private.json> <private-local-credentials-dir> <worker-drain.private.json>`.
  It requires a successful receipt for that exact snapshot and a stopped
  schedule; it does not manufacture a receipt or claim that a timeout stopped
  the server. Use it only for the same halted test run, with no new worker
  dispatches after its receipt.
- If the receipt is missing or `cleanup-blocked.private.json` exists, leave
  timers delayed. Read the saved `cron-manifest.private.json` for the exact
  ledger/control table and inspect only its request IDs, queue entries and
  response status. Stop the named schedule; set its test control row
  enabled=false under its row lock and wait for pending Cron commands. Wait for
  each actual recognized worker response. A timeout/network error/503 is
  ambiguous: do not create a successful receipt from elapsed time or retry raw
  restoration.
- If definitive responses are irretrievable, root must first stop the exact
  local Edge runtime and verify that it is stopped, prevent/delete only the
  tracked queued test invocations before any runtime restart, and record an
  independently verified quiescent state before authorizing guarded fixture
  recovery. No hosted operation is part of that procedure. Preserve the private
  full snapshot and blocked evidence; do not invent historical state or bypass
  the drain requirement.
- The controlled proof also saves `CONTROL-RECOVERY.txt` before pausing local
  pg_net or locking the local jobs table. If its parent is forcibly killed,
  signal the recorded child to stop, resume only the recorded local pg_net PID,
  release only the recorded local lock connection, then complete the drain
  before restoration. Normal finally cleanup performs those steps automatically.
  The raw timer helper alone is never an in-flight worker safety check.

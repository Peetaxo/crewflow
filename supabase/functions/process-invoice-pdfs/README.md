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

Queue writes persist the durable job before a private database trigger enqueues
an asynchronous `pg_net` request. HTTP starts only after the business transaction
commits; PDFs never render inside approval/issuance transactions. Due inserts,
explicit retry, and worker release/completion wake eligible remaining jobs. Claims,
terminal metadata and future backoff alone stay quiet. A transaction coalesces its
wakes only after a successful enqueue. Lost notifications, missing server config,
and enqueue failures retain the durable job for the hourly safety check or an
explicit retry. The existing eight-attempt budget also retires expired final
leases without allowing a ninth claim.

`private.invoice_worker_dispatch_control` is a private, RLS-protected singleton.
Its `enabled` flag starts **false** on migration; applying a migration or installing
the Cron schedule cannot silently start existing work. Only server administration
can change it. The private dispatcher and trigger helper have pinned empty search
paths and no browser/service-role EXECUTE grant. `last_request_id` records the most
recent successfully enqueued request, without credentials or request headers.

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
4. Inspect existing due jobs before activation. Apply `schedule.sql` once. The
   named `crewflow-invoice-pdfs` Cron job runs at `0 * * * *` and calls the same
   private eligibility helper as queue events. An idle/disabled queue sends no
   HTTP request. Reapplying the named schedule updates it instead of creating
   duplicates. This step leaves the enabled flag unchanged.
5. Apply `activate-dispatch.sql` deliberately after the worker and both Vault
   entries are ready. It enables event dispatch and requests eligible existing
   work in one transaction. This can process pre-existing due jobs. Do not use it
   on local fixtures before snapshot/protection and request tracking are ready.
6. Verify actual committed event processing for multiple PDFs, recovery, the
   hourly schedule and a persisted completed PDF job. Inspect `cron.job`,
   `cron.job_run_details`, the private request ID and `net._http_response` without
   selecting/decrypting secrets. Root
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

The harness checks the served runtime files/config, asserts privately that Vault
targets the exact local Kong worker and matches the passed local worker secret,
and stores full original rows from `invoice-protected-state.sql` before changes.
Private evidence lives under
`/private/tmp/crewflow-invoice-workflow-20261015-dispatch/` (directories 700,
files 600). Three standing statements are approved in one real Auth transaction
with Cron absent; actual event workers must finish three PDFs. Individual
confirmation, a real Storage failure and owner retry also use event dispatch.
The hourly test registers the literal reviewed command twice, checks future and
idle silence, then executes that exact stored command when marked work is due.
This is an exact-command fallback proof, not an observed wall-clock hourly tick.

The exact schedule installation invocation is
`supabase db query --linked --file <absolute-path-to-schedule.sql>` after Vault
provisioning. Deliberate activation uses the same command with
`activate-dispatch.sql`. Maintenance uses `teardown-schedule.sql`: it first sets
the private enabled flag false under the same singleton lock used by every
dispatcher, then removes the named Cron job, atomically. This fences future event
and late Cron invocations and retains queued work and both credential stores.
Reapplying teardown is safe. It **does not drain already enqueued/running HTTP
workers**. The local test query helper uses only
`supabase_db_crewflow-demo-20261012` and its existing `supabase_admin` credential,
expanded inside the container, with `PGOPTIONS=-c session_preload_libraries=`
on that connection. SQL travels through private files/stdin; no ACL or RLS is
changed. This also avoids the local diagnostic hook's known revoked-EXECUTE
crash. Disable event dispatch and stop/fence the schedule before
restoring a fixture snapshot; track and wait for every current request to finish.
A private `RESTORE.txt` and independently
runnable
`invoice-job-test-state.mjs restore <before-job-timers.private.json> <private-local-credentials-dir> <worker-drain.private.json>`
command are saved before test delays. The helper locks all captured job IDs in
deterministic order, then holds the production singleton lock while asserting
dispatch disabled/Cron absent and verifying every non-timer field. It atomically restores, then compares
complete rows; SIGINT/SIGTERM use the same cleanup. After a forced process kill,
use the saved command only with a successful drain receipt; otherwise leave
timers delayed.

Test interruption and independent recovery:

- The integration harness captures every successful dispatch request ID with a
  test-only `AFTER UPDATE OF last_request_id` recorder on the private production
  singleton. Distinct non-null updates capture queue, continuation, activation
  and Cron requests; no trigger is installed on pg_net tables. The deployed
  schedule and its saved command are unchanged. Stopping disables the production
  singleton under its shared row lock before the test control/Cron fences, then drains every queued/in-flight
  request. Signals stop later main actions; only the main `finally` restores
  fixtures after recognized complete handler responses.
- `worker-drain.private.json` is written before restoration. The independent
  command is
  `node supabase/tests/invoice-job-test-state.mjs restore <before-job-timers.private.json> <private-local-credentials-dir> <worker-drain.private.json>`.
  It requires a successful receipt for that exact snapshot, fenced disabled
  event dispatch and a stopped schedule; it does not manufacture a receipt or claim that a timeout stopped
  the server. Use it only for the same halted test run, with no new worker
  dispatches after its receipt.
- If the receipt is missing or `cleanup-blocked.private.json` exists, leave
  timers delayed. Read the saved `cron-manifest.private.json` for the exact
  ledger/control table and inspect only its request IDs, queue entries and
  response status. Disable the production singleton under its row lock first,
  stop the named schedule, set its exact test control row
  enabled=false under its row lock and wait for pending Cron commands. Wait for
  each actual recognized worker response. A timeout/network error/503 is
  ambiguous: do not create a successful receipt from elapsed time or retry raw
  restoration.
  A newly constructed tracker has no attached run: its empty/uninitialized branch
  is never evidence for a saved existing ledger. Independent recovery must inspect
  every exact saved request ID and validate its actual response, then persist a
  receipt for the exact snapshot. Keep events disabled until the recorder is
  installed; drop it only after definitive drain.
- If definitive responses are irretrievable, root must first stop the exact
  local Edge runtime and verify that it is stopped, prevent/delete only the
  tracked queued test invocations before any runtime restart, and record an
  independently verified quiescent state before authorizing guarded fixture
  recovery. No hosted operation is part of that procedure. Preserve the private
  full snapshot and blocked evidence; do not invent historical state or bypass
  the drain requirement.
- The current controlled proof is
  `node supabase/tests/invoice-worker-interruption.integration.mjs <private-demo-credentials-dir> <private-worker-env-file>`.
  That compatibility entry point delegates to the event driver. It observes one
  actual worker in flight and a newer queue-trigger request committed while the
  exact pg_net PID is paused. SIGTERM must fence a late event and retain delayed
  timers until both requests finish. It permits serial pg_net delivery. The child
  keeps IPC referenced until its main `finally` completes. Historical minute/Cron
  proofs remain historical evidence, not the current runner's assumptions.
  The proof saves `CONTROL-RECOVERY.txt` before pausing local
  pg_net or taking the local invoice table SHARE lock. If its parent is forcibly killed,
  signal the recorded child to stop, resume only the recorded local pg_net PID,
  release only the recorded local lock connection, then complete the drain
  before restoration. Normal finally cleanup performs those steps automatically.
  The raw timer helper alone is never an in-flight worker safety check.

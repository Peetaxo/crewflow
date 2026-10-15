# Private documents and durable PDF verification

Task2 implementation at the reviewed billing backend contract `7238ab7` (parent
documentation head `c6f3e8a`). All writes/tests below use only
`http://127.0.0.1:55321`, explicitly loaded private local credentials and
`@crewflow-demo.test` accounts. No hosted deployment, browser-policy workaround,
frontend change, merge, push, or device refresh was performed.

## Reproduction

- Pure behavior:
  `npm test -- src/features/invoices/services/invoice-document-upload.test.ts src/features/invoices/services/invoice-pdf-worker.test.ts src/features/invoices/services/invoice-pdf-layout.test.ts`
  (38 checks).
- Edge types: Deno `check --no-lock` on upload, worker and legacy entry points.
  Existing renderer: Deno
  `test --no-lock --allow-read supabase/functions/generate-invoice-pdf/invoice-pdf.test.ts`.
- Real local integration:
  `node supabase/tests/invoice-documents.integration.mjs <private-demo-credentials-dir> <private-worker-env-file>`.
  Preflight files, credentials, Edge readiness and evidence paths before
  mutations. Copies of the reviewed functions must be served in the actual demo
  bind mount. Keep upload/legacy JWT verification and worker custom secret
  config as in `supabase/config.toml`.
- Rollback ownership regression:
  `supabase/tests/invoice-document-owner-binding.test.sql` (10 checks). Run on
  local admin with the documented connection-only
  `PGOPTIONS='-c session_preload_libraries='` workaround for the existing local
  supautils image issue. This setting does not change database or runtime
  configuration. SDK/Storage/Edge tests use the unchanged API runtime.
- Renderer examples: Deno run
  `supabase/tests/invoice-pdf-examples.ts <private-evidence-directory>`, with
  read/write access. This generates normal, boundary5, explicit31-row and long
  Czech identity examples using the actual renderer. Render every page through
  Poppler, inspect PNGs and extract text/totals. The PDF authoring marker was
  executed once before authoring these four proofs.
- Legacy integration:
  `node supabase/tests/invoice-pdf.integration.mjs <private-demo-credentials-dir>`
  now selects the stable historic fixture ID; the content checker remains
  `supabase/tests/invoice-pdf-content.py`.

## Recorded evidence (2026-10-15)

Common directory: `/private/tmp/crewflow-invoice-workflow-20261013/`.

- `task2-red-validation.log`, `task2-red-replay.log`, `task2-red-worker.log`,
  `task2-red-layout.log`, `task2-red-stream-bound.log`,
  `task2-red-calendar-zero.log`: meaningful failing behavior before
  implementations. `task2-pure-green.log`: all38 pass.
- `task2-deno-check.log`, `task2-lint.log`, `task2-deno-renderer-tests.log`:
  targeted type/lint/render checks. `task2-legacy-pdf.log`,
  `task2-legacy-content.log`: actual old invoice generation/read/content.
- `task2-integration-final.log`; complete result at
  `/private/tmp/crewflow-demo-20261012/results/invoice-billing/task2-3dbfa499-bdb6-4b9e-9132-35ff2813bf7d/evidence.json`.
  Same directory `cleanup.json` verifies exact restoration of all20 pre-existing
  captured job rows after the schedule was stopped.
- Original SHA256
  `6ea0fb274dc0dc1bfa2d2e5b12b7e8f17dfd1eaac0c72265609a03e1376f6b51`; accepted
  replacement SHA256
  `8f40f896c2fe9135ca7afb7c774321ede5eac7959949441df0f499e3c9086d0a`. Actual
  return/replacement/accept/replay/download checks retain these exact hashes.
  Accepted invoice `d2f5f65b-b87f-45a3-b3cd-a79c57e8fa6a` points at the original
  replacement file.
- Worker invoice `4aec1438-ed97-49d5-889f-41f60f46b5de`, number
  `SF-2026-FAF152AE-0001`: real Storage MIME rejection records
  attempt1/transient failure, owner retry completes attempt2 on the same
  invoice, number and financial/legal snapshots. No production fault flag was
  added; bucket settings were snapshotted and restored.
- Actual Cron invocation `2026-10-15T06:40:00.015748Z`, job
  `crewflow-invoice-pdfs`, succeeded; pg_net HTTP200 body
  `{"processed":2,"rendered":1}`. Future-consent invoice
  `06b44276-6d55-4608-8ed0-ac21b85aefd7` was issued and rendered without an
  application running. Cron was unscheduled before restoring test fixtures. No
  Codex automation was used.
- `task2-red-owner-binding-storage.log`: rollback reproduction has3 failing
  checks (invoice, item and accepted-file visibility after profile Auth
  rebinding). `task2-green-owner-binding-storage.log`: all10 checks pass; CH
  accepted/returned document reads and legacy owner access preserved. The
  migration narrows only new statement-backed owner invoice visibility.
- `pdf/content-evidence.json` and
  `pdf/{normal,boundary,thirty-one-rows,long-czech-identity}-*.png`: all
  rows/durations/footer counts and meal-inclusive totals extracted; all5 pages
  visually inspected by implementation and root. No observed clipping or section
  overlap. The31-row example spans2 pages. Legal names/addresses are complete.
- `task2-advisors.json`:93 pre-existing WARN (same as reviewed backend);83
  usage-dependent INFO. Three newly reported unused-index INFO are existing
  indexes, not new security findings; useful provenance indexes retained.
- Historical paid invoice `a87b8597-cd3e-4f71-afe4-9d899cfc2bd6` remains2056CZK
  and paid.

## Local fixture incident and recovery

An early test harness temporarily set19 pre-existing disposable queued/running
job wake times to infinity before persisting their original values. A CLI
raw-UUID byte-array serialization error then prevented its cleanup; the full
original timer snapshot was not retained. No worker or schedule ran during this
incident, and invoice/item/link/statement/document/report data were unchanged.
This was an implementation harness mistake, not historical timer restoration.

Root explicitly authorized operational rescheduling after investigation: one
salvaged timer was restored exactly; the other18 were newly rescheduled to a
single server recovery time `2026-10-15T06:32:23.247452Z`; three running leases
were expired at that time. IDs/status/attempts/lease tokens/updated_at and all
other job fields were preserved. Private full before/after records and stable
business hashes prove no protected data changes. `task2-recovery-result.json`
and `task2-recovery.log` contain sanitized results. The private mode600 files
are `task2-recovery-{before,after}.private.json`,
`task2-recovery-atomic.private.sql` and `recover-task2-fixture-timers.mjs`; the
runner's idempotence was verified.

The corrected reusable harness persists complete private job rows and a separate
restore command _before_ mutation, delays only exact guarded IDs in one atomic
operation, and verifies complete row equality after restoration. A deliberate
failure cleanup (`task2-cleanup-proof.log`,19 rows) and SIGTERM cleanup
(`task2-interrupt-proof.log`,20 rows) both passed, including an idempotent
restore check. Later test snapshots accurately represent the newly recovered
local fixture timers, not the lost historical timers. Successful final
integration stopped Cron and restored all20 exact captured rows. Secrets and
lease records are never printed or committed.

## Review limits and deployment

The local Edge runtime enforces256MB and2seconds CPU; real worker
render/retry/scheduled invocations completed within those limits. One invocation
claims1 at a time, handles at most4 issue-only jobs and renders at most1 PDF.
Very large documents may fail durably and require authorized retry; large
rendering is not spread across abandoned leases.

Hosted secret/Vault/schedule provisioning remains root's later authorized step
after independent feature gates. Exact multipart/response/errors are in the
upload README; worker setup, private env/SQL transport, one named schedule and
teardown are in the worker README and `schedule.sql`/`teardown-schedule.sql`. No
hosted write was performed for Task2. Live browser UI evidence remains
unavailable under the previously recorded browser policy; no alternate
browser/surface was used.

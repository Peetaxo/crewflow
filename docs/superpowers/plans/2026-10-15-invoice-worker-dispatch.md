# Invoice worker event dispatch implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation followed by independent spec and quality reviews. User approved event-driven dispatch with an hourly safety check and explicitly asked to continue. Do not re-ask approval for this design.

**Goal:** Dispatch persisted invoice work promptly on queue events, with an hourly fallback that does not invoke an idle worker.

**Architecture:** Keep the existing private durable queue, protected worker, per-invoice/standing consent, leases and eight-attempt budget. Add a private dispatch helper and queue trigger in a new CLI-generated migration; after a worker releases a job, eligible remaining work must continue. Change the named Cron schedule to hourly and have it call the same eligibility-guarded helper. Missing configuration or failed notifications must leave the original business transaction and durable job intact.

**Tech Stack:** PostgreSQL, pg_net, Vault, pg_cron, Supabase Edge Functions, existing local pgTAP/SDK harness and Vitest.

## Task 1: queue notifications, hourly recovery, and actual regression proof

**Files:**
- Create a CLI-generated `supabase/migrations/*_invoice_worker_event_dispatch.sql`; do not edit deployed migrations.
- Create `supabase/tests/invoice-worker-dispatch.test.sql` and focused integration coverage if needed.
- Modify `supabase/functions/process-invoice-pdfs/schedule.sql`, `teardown-schedule.sql`, and `README.md`.
- Change worker code only if continuation cannot be achieved safely within the private database dispatch mechanism.
- Update `docs/testing/2026-10-13-crew-invoicing.md` with actual evidence and remaining gates.

- [x] Write rollback SQL tests using real pg_net enqueue records: no due work means no HTTP request; new due work requests an async wake; future retry does not loop; success/release continues pending work; expired leases recover; missing configuration preserves the business mutation; anon/authenticated cannot invoke dispatch helpers or read credentials. Run before implementation and retain the expected RED. Tests may use transactional fake Vault entries and rollback: pg_net sends only after commit. No secret output.
- [x] Generate the new migration with `supabase migration new invoice_worker_event_dispatch`. Implement private functions with empty pinned search_path and narrowly revoked grants. Query only eligible queue rows; never scan all reports/invoices for dispatch. Use the existing partial claim index. Retain durable existing queue identity, supplier number, snapshots, consent and row locks. Do not introduce public bootstrap RPCs or browser service credentials.
- [x] Ensure due inserts/manual retry and worker release/completion wake pending work. Limit event selection so claim/lease updates, completed rows and future backoff do not create recursive empty wake storms. More than one queued PDF must drain without waiting for another hourly tick.
- [x] Use this schedule shape, with the final private helper name kept consistent:

```sql
select cron.schedule(
  'crewflow-invoice-pdfs', '0 * * * *',
  $schedule$ select private.dispatch_invoice_billing_jobs(); $schedule$
);
```

- [x] Make maintenance teardown stop BOTH event dispatch and Cron without dropping queued work or credentials. Provide explicit activation/setup so enabling a trigger is deliberate and cannot process old local fixtures during timer protection/cleanup. Adapt local test lifecycle deliberately rather than disable business lifecycle guards.
- [x] Run the SQL suite on the disposable local stack using a single admin connection with `PGOPTIONS=-c session_preload_libraries=` inside the container. Do not run denied-function crash probes on the default buggy local hook. Preserve ACL/RLS and rollback every fixture.
- [x] Prove actual committed event-to-worker processing for multiple marked fake local jobs, retry/failure recovery and the exact named hourly schedule. The local stack is `http://127.0.0.1:55321`, database container `supabase_db_crewflow-demo-20261012`. Preserve all existing rows/jobs/timers using the reviewed durable snapshot/stop/fence/drain harness; no hosted fake writes, no `.env.local`, no broad process stops, no leaked private credentials. Never restore fixture timers while a worker may still be running.
- [x] Run focused worker tests, relevant original billing SQL suites, lint/build as applicable, local advisors, source self-review. Record exact checks and limitations. Commit only task files.
- [ ] Obtain independent spec review first, then code quality review; fix findings and re-review.

Task 1 verification evidence (implementation source `cb1b117fd723269e72386171b507004c2cc4daaa`, followed by focused test/helper changes):

- Real local Auth/Storage/Edge run `run-c2cc3b9b-31c7-465c-a3d5-8fbde2308d87`: three standing PDFs from one approval transaction in 2,147 ms with Cron absent; event-triggered individual failure/manual retry preserves the same invoice, number and frozen snapshots. The literal hourly command proves future/idle silence and due-work recovery; no wall-clock hourly tick is claimed.
- All-event singleton recorder captured nine actual definitive responses. Cleanup disabled/fenced dispatch and Cron, drained first, restored 24 exact pending rows, and preserved all 739 pre-existing rows over 27 tables, including all 56 original full queue rows.
- Corrected controlled interruption `interruption-11c1cc8f-0c6e-4538-b2ac-8fa05497efba` / child `run-a9aab936-4738-4abb-98e8-0cb777f81f2d`: one real worker in flight and a newer trigger request queued; SIGTERM fences a late event and retains timers until four actual 200 responses. Restored 24 rows; preserved 1,080/1,080 old rows and all original trigger definitions/states. Earlier setup failures and authorized exact recovery are documented in the testing report, not counted as passing runs.
- First-failing helper tests cover missing all-event capture, stop order and required event fence. A separate first-failing lock-order test proves captured jobs are locked before the control row; restoration checks disabled/Cron absent while holding that row lock through mutation. Invoice Vitest: 17 files / 160 tests; lint passes. TypeScript remains 110 existing diagnostics, none in changed test files. Production runtime/ACL/RLS are unchanged.
- Private evidence is under `/private/tmp/crewflow-invoice-workflow-20261015-dispatch/`. Independent spec/quality review, merge, hosted provisioning/activation and the blocked GUI pilot remain separate root-owned gates.

## Task 2: integrate reviewed code and prepare server activation

- [ ] Verify current clean main and integrate the reviewed commit, retaining unrelated project changes. Publish under the user's existing direct-main authorization; run suitable merged-source checks.
- [ ] Prepare exact hosted deployment instructions and activation verification. Do not store the newly rejected credential in Edge Secrets or Vault until the user explicitly approves this credential change. Do not bypass the rejection through different tools or credentials.
- [ ] Backend migration/deployment can be made ready without activating dispatch. Before any activation, inspect actual queue counts and current functions. No real invoice/consent test writes in Staff.
- [ ] Report what is implemented, what is actually deployed, and the single concrete remaining approval. Preserve the browser policy block as a separate pending GUI check.

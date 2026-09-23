# Shared shift workflows — verification log

Status: implementation in progress. This is not deployment or completion evidence.

## Baseline (2026-09-23)

- App worktree: `codex/shared-crew-workflow-plan`, current main incorporated at `25a3353` (main `dd18900`).
- Existing app suite: 117 files / 1,314 tests passed with one worker. The same run included intentionally failing Task 1 RED tests; it is not a passing feature-suite run.
- Actual app TypeScript check has 116 pre-existing diagnostics (186 output lines). The root reference-only check is not a valid substitute.
- Local-only Docker context: `colima`; container: `crewflow-event-form-db`; image: `public.ecr.aws/supabase/postgres:17.6.1.104`; no filesystem mounts; bound to `127.0.0.1:55439` only.
- Dedicated disposable database: `crewflow_shared_shift_tests`, cloned from the empty `crewflow_approval_green` template. Do not mutate `postgres`, `crewflow_approval_green`, or `crewflow_approval_history` for this feature.
- Current `targeted-event-approval.sql` passed against the dedicated database, rollback-only. No real business rows or users were copied.
- Baseline advisors: 155 findings (92 WARN, 63 INFO), comprising 145 performance and 10 security findings. Existing security findings concern budget/warehouse policies, three mutable function search paths and the intentionally inaccessible invoice sequence table. They are not changed by this task.
- Baseline database function lint: no schema errors in public/private.
- Raw local baseline reports: `/private/tmp/crewflow-shared-shift-advisors-before.json`, `/private/tmp/crewflow-shared-shift-lint-before.json`.

CLI 2.95.4 accepts the explicit loopback database URL. Set `PGSSLMODE=disable` for this local container; its TLS listener is disabled. Obtain the container's existing password into a task-local shell variable without printing or persisting it, and include it in the loopback URL. The CLI's generic “remote database” message means explicit URL mode, not the Staff project. `SUPABASE_DB_PASSWORD` alone was insufficient for URL mode in this version.

SQL tests can use the container-local socket (no password output):

```sh
docker --context colima exec -i crewflow-event-form-db \
  psql -U postgres -d crewflow_shared_shift_tests -X -q -v ON_ERROR_STOP=1 \
  < supabase/tests/targeted-event-approval.sql
```

## Database foundation checkpoint (2026-09-23)

Scope: schema, read snapshot, and atomic membership only. UI/client integration,
draft save/submission, approval transitions, and invoice selection are not
implemented by this checkpoint. No remote migration, main integration, or device
refresh was performed.

The CLI created `20260923092136_shared_shift_workflows.sql` using
`supabase migration new shared_shift_workflows`. The migration creates seven new
tables and four functions (two public invoker wrappers, two narrow private
definer implementations). Existing targeted approval functions, billing groups,
business rows, and automatic invoice trigger configuration are unchanged.

### Read and write contract

- `read_shift_workflows()` returns exactly `revision`, `workflows`, `rounds`, and
  `assigned_event_ids`. Arrays are never null; workflow headers sort by UUID,
  members by stored position, rounds by creation time/UUID, and frozen items by
  stored position. Manager revision is an integer; crew revision is null.
- Managers see all workflow members/rounds. Crew workflow members are the exact
  current assignment intersection. Crew round/item/action ownership requires
  both the contractor profile and the captured `contractor_user_id`; assignment
  to an event never grants access to another contractor's round. Own frozen item
  IDs remain present after assignment changes. Missing/empty/inconsistent frozen
  sets cause the read RPC to fail, rather than reconstructing or truncating them.
  A positive, non-null `expected_item_count` is captured once when the round is
  created and remains immutable through lifecycle transitions. Reads require the
  actual frozen item count to match, including when only one trailing item is
  missing and every surviving item is valid. This internal count does not change
  the public JSON shape. Direct caller updates remain forbidden by existing ACLs.
- New groups require at least two events. Existing groups can retain one event;
  singleton source remnants remain with their existing deterministic positions.
  Empty sources without history are removed. Delete requires an existing group
  and an empty selected array. Linking never occurs automatically.
- One request accepts at most 200 selected events and 1,000 total affected events.
  Versions are an exact UUID-keyed JSON object of finite timestamp strings for
  all selected events, all current target members, and every member of every
  moved source group. Missing/extra/removed/source-remnant omissions fail.
- Revision lock precedes sorted `FOR UPDATE` event locks, then sorted timelog
  locks. This fits existing assignment/deletion's event-before-timelog order;
  no event lock is acquired after a timelog lock. Strong parent locks also
  serialize foreign-key-backed child insertion.
- A request stores actor, kind, complete payload, and result once. Exact replay
  returns the original result before checking current revision. A different
  actor or payload fails. The response is `{request_id,workflow_id,revision}`;
  deleting a group returns the deleted group's canonical ID.
- Errors use `42501` for unauthorized, `22023` for malformed input/confirmation/
  altered replay, `P0002` for missing group/event, `40001` for stale revision or
  event versions, and `55000` for protected membership history/status.

All seven tables have RLS and explicit grants. Anon has no access. Authenticated
users, including managers, have no direct DML; the request ledger also has no
SELECT grant and an explicit restrictive false policy. Its immutability is
enforced at the caller boundary: no write grant and no update/delete API. Owners
and superusers remain administrators. Both public RPCs are invokers; the private
implementations use empty search paths, authoritative auth/role/profile checks,
and named operations only. They are necessary to write tables for which callers
have no DML grants and to read authoritative assignments despite legacy table
policies. No user metadata, caller-set GUC privilege marker, or generic SQL helper
is trusted. Default PUBLIC and anon EXECUTE privileges are revoked.

### Actual verification

- RED schema test: `shared shift schema missing: shift_workflows`, exit 3,
  observed before creating the migration contents.
- RED behavior test: `shared shift read RPC missing`, exit 3, observed before
  implementing either RPC.
- A later edge-case RED caught null member IDs on an empty header; the read now
  returns `[]`, and the same assertion passed afterward.
- Review regression RED: deleting only the trailing item of a valid two-item
  round produced `partial frozen set denied: manager=f owner=f` (exit 3), proving
  both manager and owner reads accepted a truncated set. After adding the frozen
  expected count, both reads reject it with `22023 shift_workflow_round_invalid`.
  Zero/null expected counts and direct caller changes are also rejected.
- GREEN `shared-shift-workflows.schema.sql`: all seven RLS/ACL boundaries,
  private ledger, public invokers, private/public function EXECUTE grants and
  empty search paths verified.
- GREEN `shared-shift-workflows.sql`: actual authenticated CH, COO, crew, other
  crew and anon calls; all direct table DML denied; missing/duplicate identities;
  metadata/GUC forgery denied; exact member order; cross-job/project and move
  confirmations; all affected versions; stale/invalid versions; non-draft source
  remnant and target guards; historical/released round items, targeted approval
  history and invoice guards; retry after revision advancement; altered actor/
  payload rejection; delete/unlink checks; late ledger failure rollback; frozen
  profile/auth binding and foreign/missing item failures; unchanged original
  business row snapshots and synthetic historical billing fixture. The entire
  suite rolls back.
- GREEN `shared_shift_workflows.concurrency.mjs`: session A invoked the actual
  save RPC inside a transaction; B was observed waiting on A with
  `pg_blocking_pids`, `wait_event_type='Lock'`, and a lock on the singleton state
  relation. After A committed, B failed `40001` and had no header, member, request,
  or revision increment. Exact verified fixture IDs were cleaned; complete
  business/workflow snapshots matched the originals afterward.
- Final migration replay passed after removing only this foundation's verified
  empty tables/functions from the dedicated test DB, without CASCADE. Schema,
  integration, and concurrency checks passed again against the final migration,
  including after the reviewed partial-item-loss correction.
- Existing `targeted-event-approval.sql` and `event-schedule-drafts.sql` passed
  against the final schema, rollback-only.
- Final public/private function lint: no schema errors. Advisors: 137 findings
  (92 WARN / 45 INFO), with the same 10 pre-existing SECURITY findings. The only
  newly added finding is INFO `unused_index` for
  `shift_workflow_round_actions_round_id_idx`; it intentionally covers the foreign
  key for future action operations. No new missing FK index, security warning, or
  mutable search path finding. Index-use INFO counts depend on the local test
  workload and are not a production performance claim.
- Final cleanup: revision 0; headers, links, requests, rounds, items, actions,
  and active concurrency sessions all 0. `git diff --check` passed.

Raw final local reports:
`/private/tmp/crewflow-shared-shift-advisors-after.json` and
`/private/tmp/crewflow-shared-shift-lint-after.json`.

### Reproduction and local image limitation

The local 17.6.1.104 image crashes in Supautils' permission-error hint path when
an EXECUTE-denied function is invoked as anon. This reproduced with a direct DO
block independently of the test helper, matching
[Supabase Postgres issue 2112](https://github.com/supabase/postgres/issues/2112)
and [Supautils issue 214](https://github.com/supabase/supautils/issues/214).
Recovery rolled back the synthetic fixtures. Tests use the narrowly scoped
per-connection startup override `PGOPTIONS='-c supautils.hint_roles='`. PostgreSQL
ACL/RLS checks still run, and actual anon calls assert SQLSTATE `42501`.
The image emits a startup warning saying the hint parameter cannot be changed
now, but `SHOW supautils.hint_roles` confirms the test connection has the empty
value. A fresh ordinary connection still reports
`anon, authenticated, service_role`; no global/database configuration was changed.

```sh
docker --context colima exec -e PGOPTIONS='-c supautils.hint_roles=' -i \
  crewflow-event-form-db psql -U postgres -d crewflow_shared_shift_tests \
  -X -qAt -v ON_ERROR_STOP=1 < supabase/tests/shared-shift-workflows.schema.sql
docker --context colima exec -e PGOPTIONS='-c supautils.hint_roles=' -i \
  crewflow-event-form-db psql -U postgres -d crewflow_shared_shift_tests \
  -X -qAt -v ON_ERROR_STOP=1 < supabase/tests/shared-shift-workflows.sql
node supabase/tests/shared_shift_workflows.concurrency.mjs
```

Existing event deletion now encounters the new restrictive membership/history
foreign keys for linked/frozen events; callers must explicitly unlink eligible
draft groups first. New submission/approval operations still need their own
validation, write guards, and concurrent race proofs before the app can use them.
No fake future RPCs are exposed by the foundation.

## Remaining feature evidence (pending)

- Authenticated role/ownership/RLS and ACL checks.
- Atomic membership, progressive saves, immutable submission sets and current targeted approval integration.
- Exact retries, altered-payload retries, version conflicts and rollback of every member.
- Old RPC/direct-write/import/assignment bypass checks.
- True multi-session assignment/membership/submit and approval races.
- Unchanged original events, hours, invoices, receipts and historical billing groups.
- Fresh migration replay, advisor delta and function lint.
- App integrations, mobile/desktop review, main integration and separate development-device results.

No shared-workflow migration has been applied to Staff. New remote rollout remains a separate concrete approval after local verification.

## Shared draft and round server checkpoint (2026-09-23)

Scope: server Task 5 only. The CLI created the separate forward migration
`20260923100014_shared_shift_round_lifecycle.sql`; the reviewed foundation is
unchanged. No source database, remote project, main branch, app installation,
invoice, receipt, or notification configuration was changed.

### Public lifecycle contract

- `save_shift_workflow_drafts_atomic(p_request_id uuid, p_workflow_id uuid,
  p_contractor_id uuid, p_anchor_event_id uuid, p_timelogs jsonb,
  p_round_id uuid DEFAULT NULL)`.
- `submit_shift_workflow_round_atomic(p_request_id uuid, p_round_id uuid,
  p_workflow_id uuid, p_contractor_id uuid, p_anchor_event_id uuid,
  p_timelogs jsonb)`.
- `transition_shift_workflow_round_atomic(p_request_id uuid, p_round_id uuid,
  p_expected_round_updated_at timestamptz, p_targets jsonb, p_action text,
  p_note text, p_affected_event_id uuid, p_corrections jsonb)`.

Draft/submit entries have exactly `id`, `event_id`, `expected_updated_at`,
`expected_status`, `km`, `note`, and `days`. IDs and finite expected versions are
required; missing canonical reports fail closed. Each day has exactly `id`,
`date`, `time_from`, `time_to`, `day_type`, `note`, `meal`, and `meals`. IDs are
stable UUIDs. Both meal fields and day notes survive updates; existing day
`created_at` values remain unchanged. Types cast through the actual enum,
including `pripravy`; repeated dates, overnight times, and blank draft times are
supported. Empty day arrays are accepted only for draft saves. Submission and
confirmation require complete nonzero time intervals. No event free-day data is
rewritten. The existing September schedule migration already supports unlinked
`pripravy`; its implementation was retained and regression-tested.

For ordinary saves (`p_round_id = NULL`) and new submissions, the server derives
all currently assigned eligible draft/rejected reports. Completed approved,
invoiced, and paid historical sections are excluded. All eligible sections,
including empty later sections, must be supplied. An active round blocks a new
submission for that person/workflow, while later draft sections can still save.
Confirmation saves use an explicit non-null `p_round_id` and require its entire
frozen set. A null workflow permits only the caller's own assigned anchor event.
Returned rounds remain in history; resubmission creates a new identity/count/set.

Transition targets are exactly `{id,expected_updated_at,expected_status}` for
every frozen member. CH `approve` (also accepted as `handoff`) calls the existing
targeted handoff implementation after checking that every event configures the
same approver profile. Each report receives its own targeted approval-round UUID.
COO `approve`/`return` call the existing resolver with authoritative targeted IDs
and versions; frozen profile/auth bindings, active roles, and sender/author
separation still apply. COO cannot edit hours. CH `correct` requires full
corrections, a nonempty review note, and an affected member event. Before values
are persisted in the action and per-report confirmation snapshot. Crew `confirm`
returns that same shared round to CH. CH/COO returns release every item together.

Every result contains `{request_id,workflow_id,round,timelogs}`. `round` is null
for an ordinary draft save, otherwise it has the existing read snapshot shape:
`id`, `workflow_id`, `contractor_id`, `status`, `event_ids`, `timelog_ids`, `note`,
`updated_at`. Timelog rows contain `id`, `event_id`, `contractor_id`, `status`,
`updated_at`, `km`, `note`, `review_note`, `crew_confirmation_snapshot`,
`submitted_at`, `approved_at`, `days`, and `approval`. `approval` is null or
`{id,approval_round_id,status,updated_at,approver_profile_id,approver_user_id}`.
The request ledger compares actor, kind, and the complete original payload and
returns the original result even after later transitions. An altered retry fails.

### Authorization and lock boundaries

All new public lifecycle/assignment wrappers are invokers with empty search
paths. Narrow private authenticated definers validate identity, ownership, exact
sets, status/version preconditions, and the specific operation. Internal helpers
have no caller EXECUTE grants. Two private permit tables have no API grants,
enabled RLS, and explicit restrictive deny policies. Permits bind the actual
transaction ID, authenticated actor, exact target, operation, from/to status, and
day-edit scope. They are removed before return and roll back with failed calls.
No user metadata or caller-set privilege GUC is accepted by these guards.

Linked draft updates and day edits must use the new whole-set operation. Frozen
or historical report edits have the same requirement, even after release. Old
save, status-batch, targeted decision, import, and raw-table partial writes cannot
change shared reports. Explicit immutable-data billing transitions remain valid
and keep monotonically increasing versions. The original assignment/removal
implementations moved to revoked private names; authenticated wrappers issue
exact initialization/removal permits so canonical blank draft creation and
eligible removal continue to work. Raw assignment deletion/reparenting of an
active frozen member is prohibited.

New operations lock the singleton before sorted events, current assignment rows,
sorted timelogs, and sorted mutable profile bindings. Strong event locks serialize
assignment FK insertion; assignment row locks cover concurrent deletion. Old
event-first operations never acquire the singleton. Targeted approval helpers
retain their established parent/approval/profile locking. The day guard first
rejects known unauthorized shared writes, then locks and rechecks the parent;
this avoids the demonstrated day-tuple/parent lock inversion and still closes a
concurrent membership-link race.

### Actual verification and regression boundaries

- Initial RED: `shared shift lifecycle RPCs missing`, exit 3, before implementation.
- Concurrency RED: a raw day writer holding its tuple and the parent-first shared
  batch produced PostgreSQL `40P01 deadlock detected`. After the guard change,
  the same two-session test receives `42501` for the raw write and the full batch
  commits successfully.
- Version RED: an explicit invoice transition in the same transaction moved the
  timelog version backward because the legacy trigger uses `now()`. The shared
  version trigger now advances versions for permitted shared writes and explicit
  historical billing transitions; the assertion passes.
- Fully enabled `shared-shift-rounds.sql` passes real crew, other crew, CH,
  assigned/unassigned COO, and anon calls, public/private ACLs, forged metadata/
  GUCs, old/raw/import bypass attempts, missing canonical reports, malformed days,
  negative km, empty/incomplete sections, missing/extra targets, stale versions,
  late injected ledger failure rollback, stable IDs/meal fields/repeated dates,
  frozen later assignments, waiting draft saves, next rounds after approval,
  correction/confirmation, CH and COO returns, resubmission history, incompatible
  approvers, changed author/approver identities, self-approval, single-anchor and
  unlinked legacy preparation, exact historical replay, and explicit billing.
- `shared_shift_rounds.concurrency.mjs` observes actual `pg_blocking_pids` waits:
  assignment-vs-submit rejects the stale omitted member; submit-vs-raw assignment
  deletion preserves frozen assignments; the raw-day race no longer deadlocks;
  CH approval-vs-return gives the loser `40001` with no partial reports, approval
  rows, actions, release times, or request row. All fixtures are removed by exact
  verified identities and full original table snapshots match afterward.
- The unchanged foundation schema and concurrency suites pass. The foundation
  behavior suite requires impossible linked-status fixture writes as DBA, so
  `shared-shift-foundation-fixtures.sql` temporarily disables exactly
  `a_shared_shift_timelog_write` and `a_shared_shift_day_write` inside the
  rollback-only test transaction. It does not disable foundation read/count,
  membership, ACL, or RLS protections. Its result is foundation evidence, not
  lifecycle-guard evidence. The final rollback restores both triggers; lifecycle
  and concurrency suites separately run with every lifecycle guard enabled.
- Existing targeted approval and event schedule suites pass unchanged.
- Final empty-schema replay used `shared-shift-rounds.reset-local.sql`, which
  refuses any database other than the dedicated test database and refuses
  nonempty shared state/permits. No CASCADE or source-template mutation was used.
- Function lint passes with no warnings or errors. Advisors report 136 findings
  (92 WARN / 44 INFO), including the same 10 pre-existing security findings and
  no added findings relative to the foundation checkpoint. Index-use INFO totals
  reflect this local workload, not production performance.
- Cleanup verified revision 0, no workflows/rounds/items/actions/requests/permits
  or concurrency sessions, and all four lifecycle triggers enabled.

Reproduction (fixed local container/database only):

```sh
node supabase/tests/shared_shift_rounds.regression.mjs
node supabase/tests/shared_shift_rounds.concurrency.mjs
node supabase/tests/shared_shift_workflows.concurrency.mjs
```

The regression runner expands the foundation fixture wrapper locally, preserves
SQL dollar-quoted function bodies, and runs all five SQL suites through the same
per-connection Supautils hint workaround described above. Final local reports:
`/private/tmp/crewflow-shared-rounds-lint.json` (empty output means no findings)
and `/private/tmp/crewflow-shared-rounds-advisors.json`.

This checkpoint does not claim app/client integration or remote rollout. The
global singleton deliberately serializes shared writes for straightforward
membership/request correctness; production throughput at larger scale has not
been benchmarked.

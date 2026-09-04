# Production billing groups — execution evidence

Scope: production-managed event grouping only. Invoice upload, OCR, invoice
generation, accounting approval and PowerApps integration are not part of this
implementation. No production database migration has been applied.

## Baseline and Task 1

- Working branch: `codex/production-billing-groups`, isolated from the active,
  independently changing main checkout.
- Implementation baseline: `8654751`.
- Initial regression run: EventDetailView, EventEditModal, events service and
  invoice customer resolution — 4 files, 143 tests passed.
- Task 1 commits: `3fba63b` (model), `92cf0ac` (review coverage corrections).
- Independent spec and code-quality reviews approved Task 1; focused tests
  passed 13/13, focused ESLint and `git diff --check` passed.
- Pre-integration full run at Task 1: 97 test files / 921 tests passed.
  `npm run build` passed, with existing large-bundle, ineffective dynamic-import
  and outdated Browserslist-data warnings.
- `npm run lint` passed with zero errors and two existing hook-dependency
  warnings in `MobileTimelogEditModal.tsx`.
- A clean archive of `8654751` and the Task 1 checkout both produce exactly
  the same 199 TypeScript diagnostics with
  `tsc --noEmit --project tsconfig.app.json`. Thus the repository-wide type
  check is not green at baseline; this must not be reported as passing.

## Isolated database verification setup

This setup contains no copied production records or credentials. It uses
Supabase CLI 2.95.4 and PostgreSQL 17.6 in the task-only Colima profile
`crewflow-billing`. The profile has no host-directory mounts or forwarded SSH
agent, and does not replace the active Docker context. Docker commands select
`colima-crewflow-billing` explicitly.

The database container is `supabase_db_crewflow-billing-tests`.
The task-only network `crewflow-billing-loopback` has
`com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Both Docker port
inspection and host `lsof` confirmed `127.0.0.1:54322`, not a LAN listener.
The CLI prints a generic network-accessibility warning even with this verified
loopback binding. See the [official local-development guide](https://supabase.com/docs/guides/local-development).

The generated local `supabase/config.toml` and `supabase/.gitignore` are
untracked test-environment files, not product changes. Local migrations and
seed execution are disabled in that configuration because of a historical
bootstrap gap:

1. A clean automatic migration replay fails at
   `20260731114213_add_invoice_meal_amounts.sql`: `invoice_items` does not exist.
2. Its prior schema definition is checked in separately as
   `supabase/invoice-batch-migration-draft.sql`.
3. On an empty isolated database, the initial `20260408103107_.sql`, that
   existing schema-only prerequisite, and then all remaining historical
   migrations in filename order applied successfully. Historical migration
   files were not changed. This is not evidence of parity with the deployed
   production schema, and migration-history records were not fabricated.

CLI 2.95.4 `supabase db query --local --file` rejects multi-statement files with
SQLSTATE 42601 (`cannot insert multiple commands into a prepared statement`).
Single-statement local queries work. The verified multi-statement fallback is
`psql -v ON_ERROR_STOP=1` inside the explicitly named local database container,
receiving the checked-in SQL file on stdin. No linked/remote query was used
to bootstrap or test the schema.

### Local Supabase permission-hint crash

Direct invocation of an EXECUTE-revoked function as `anon` crashed the local
backend with SIGSEGV before the body ran. The implementer reproduced this
with both billing RPCs and a trivial constant function, independently of
pgTAP. This matches [Supabase Postgres issue 2112](https://github.com/supabase/postgres/issues/2112)
and [supautils issue 214](https://github.com/supabase/supautils/issues/214).

The [supautils implementation](https://github.com/supabase/supautils/blob/master/src/supautils.c)
and [Enhanced hints documentation](https://github.com/supabase/supautils#enhanced-hints)
show that `supautils.hint_roles` adds error hints, independently of privilege
enforcement. Its `PGC_SIGHUP` configuration cannot be changed per test session.
For this isolated local database only, its administrator temporarily set
`supautils.hint_roles = ''` with `ALTER SYSTEM` and reloaded the configuration.
No role, grant, RLS policy, reserved-role setting or preload library changed.
The original value was `anon, authenticated, service_role` from
`/etc/postgresql-custom/supautils.conf`; reset this local override after tests.

A fresh normal `postgres` connection confirmed the empty hint list. Actual
`SET ROLE anon; SELECT public.read_billing_groups()` then returned a clean
permission-denied error without crashing. Tests run with real denied-role
calls, not replacement ACL-only assertions. Their evidence is conditional on
this local engine workaround; do not call the unmodified local stack healthy.

At the pause checkpoint, `ALTER SYSTEM RESET supautils.hint_roles` and reload
restored the original hint-role list, verified from a fresh connection. The
task-only Colima profile was then stopped successfully, preserving its data
volumes and test artifacts for resumption. No local database remains listening.

## Read-only deployment-target check

The application's configured Supabase URL and the account's project listing
identify the active `Staff` project (`gkxbluqkugprwcpdephk`, PostgreSQL
17.6.1.104). Only catalog reads have been performed there. A scan of public
functions using `set_config` or dynamic `EXECUTE` found fixed lifecycle flags
(`crewflow.invoice_receipt_mutation`, `crewflow.approved_timelog_import`), not
a generic caller-selected configuration/SQL endpoint. `rls_auto_enable()` is
an event trigger that enables RLS on newly created tables, not a callable RPC
with user-supplied SQL. Recheck the catalog at deployment time.

Read-only production settings also show the hint-role list and `supautils`
session preload. No crash reproduction was attempted there, and this record
does not establish whether that server build is affected. Do not change its
server settings as part of this feature without separate authorization.

### Blocking existing role self-escalation

Further catalog-only inspection found an existing
`public.set_current_user_role(app_role)` SECURITY DEFINER function, owned by
`postgres`, executable by `authenticated` (and `anon`). Its body checks only
that `auth.uid()` is non-null, deletes that user's existing `user_roles` rows,
then inserts the caller-supplied role. Consequently an authenticated crew
account can select `coo` or `crewhead` and satisfy the billing manager check.
The frontend's existing `AuthProvider.switchRole` calls this RPC for real
Supabase sessions. This is not merely a local preview switch.

No escalation call was executed and no production role or policy was changed.
This predates the billing feature, but blocks its promised production-only
authorization in the deployed application. On 2026-09-04 the user clarified
that role switching is intentional for testing different roles and will be
removed later. Leave the current test switch and server roles unchanged;
resume the approved billing-group implementation in the isolated branch.
This clarification does not authorize a production database migration or
claim that the current test role mechanism is production-safe. Before a real
release, restrict the server-side role-changing endpoint as well as removing
its UI. That release gate does not block local feature development or tests.

## Tasks 2–3 checkpoint

- Commit: `56653c15da254f871c43ea8f48a89b7bf5cef718`.
- Parent independently reran the actual pg_prove container: 107/107 assertions
  passed with the diagnostic-only local engine workaround above.
- Implementer verified two-session locking: B waited for A, then rejected
  with SQLSTATE 40001 after A committed; no partial B writes remained.
- Implementer cleanup check found revision 0 and no groups, memberships,
  requests, synthetic users or open test sessions.
- SQL lint and focused generated-type check passed. Local advisors had no
  new findings. The source and CLI-created migration are identical.
- Details and reproduction are in
  `supabase/tests/billing_groups.verification.md`.
- This checkpoint still needs independent specification and code-quality
  review before the next implementation task. It is not production-ready.

## Existing application preview

Port 8086 had no listener and the in-app browser showed connection refused.
The main checkout's dev server was restarted on `127.0.0.1:8086`; a new browser
tab displayed the app's login screen successfully. This restored preview
does not yet include the billing-groups feature. No login credentials were
entered and no production data was changed through the UI.
The separate local-data smoke preview on port 8087 loaded successfully;
its temporary tab and dev server were closed when work paused.

## Pending gates

- Complete/review the Tasks 2–3 database checkpoint; Tasks 4–10 have not been
  implemented. The frontend feature is not yet available in either preview.
- Resolve the existing role self-escalation with explicit user authorization
  before claiming production-only access or proceeding to deployment.
- Full frontend regression, build, changed-file lint and no-new-TypeScript-error
  checks must be rerun after implementation.
- Database role, RLS, replay, rollback and concurrency tests must pass locally.
- Mobile and desktop acceptance must be verified against the implemented UI.
- Production target/schema verification and explicit migration authorization
  are required before enabling the Supabase-backed feature there.
- Main integration/synchronization and separate simulator/physical iPhone
  development-installation reports are still required by `AGENTS.md`.

## Resumption on 2026-09-04

- The user confirmed that the role switch is currently intentional for testing.
  No role switch, authorization function or server role has been modified.
- Fresh model verification: 13/13 tests passed. A fresh application typecheck
  still reports 199 pre-existing diagnostics, none in `features/billing-groups`.
- Independent static specification and code-quality reviews approved database
  Tasks 2–3 for proceeding to frontend work; source and migration remain identical.
  The local database runtime was not restarted or retested during this review.
- Two nonblocking database-test improvements remain noted for acceptance:
  guard already-ended child stdin and bound exit waits in the concurrency
  harness; extend the mutex proof with a concurrent ordinary event edit.
  Neither review found an introduced blocking database correctness issue.
- Current Supabase changelog and RPC/abort documentation were consulted.
  The additive schema already includes the explicit grants required by the
  [Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
  [Automatic transient retries](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors)
  apply to GET/HEAD reads; billing mutations remain explicit POST RPC calls
  with application-controlled exact-command replay.
- Started a separate loopback-only Vite server on `127.0.0.1:8087` with
  `VITE_APP_DATA_SOURCE=local`. Through the actual UI, created synthetic
  projects `BILL-QA-A` / `BILL-QA-B` and events `QA Nakládka` (September 4),
  `QA Instal` (September 5), and `QA Jiná akce` (September 6), 2026. The first
  two share project A; the third belongs to B. These exist only in that tab's
  in-memory local app state. This is acceptance-fixture preparation, not
  evidence that the not-yet-integrated billing UI works. No real account was
  signed in and no remote record was created.

### Task 4 verified and reviewed

- Gateway/local adapter committed as `62b86d3`; a narrow follow-up
  `9969cb6` restricts known error tokens to exact `Map` entries, so inherited
  object names cannot be treated as definitive server failures.
- Parent independently reran all current billing feature tests after that
  fix: 2 files / 29 tests passed. Changed-file ESLint passed. Application
  typecheck diagnostics at the gateway checkpoint are byte-identical to the
  fresh 199-diagnostic baseline, with none in the billing feature.
- Independent specification and code-quality reviews both approved Task 4.
  Quality review noted nonblocking negative local deletion-test coverage;
  cover populated/missing groups without state changes when extending local
  deletion tests in Task 9.

### Task 5 implementation and specification verification

- Hook committed as `a97031b`; test-only follow-up `fe9b70d` independently
  covers every authentication readiness gate, local-mode bypass, unmount,
  A→B→A role switching and same-key readiness reactivation. Retained callbacks
  cannot submit from an obsolete activation; fresh callbacks remain usable.
- Parent independently reran all billing tests at `fe9b70d`: 3 files / 46 tests
  passed. Changed-file ESLint passed. Fresh application TypeScript output is
  byte-identical to the 199-diagnostic baseline, with no billing diagnostics.
- Independent specification re-review approved Task 5. Code-quality review
  found a P2 shared-query lifetime issue: a pending query used the initiating
  observer's activation guard, so same-scope readiness reactivation or that
  observer's unmount could publish a denied error to another active consumer.
  Fix `362b256` removes only the observer guards from the query function;
  scoped keys and the consumed AbortSignal govern shared reads. Strict
  activation guards remain on save/mutation/reload callbacks. Both corrected
  regressions failed against the old guards and passed with the fix. The
  StrictMode test now also exercises a successful fresh save.
- Specification re-review independently passed 19 hook tests. Quality re-review
  approved the fix without new findings. Parent's fresh feature rerun passed
  3 files / 48 tests in 1.33 seconds after running the same command outside the
  sandbox. Two restricted runs stalled before the Vitest banner with idle
  process stacks; their exact test PIDs were terminated. No test configuration,
  dependencies, application servers or database were changed for this retry.
  Task 6 editor implementation is now in progress.
- The user has been asked for separate permission to apply the additive
  billing schema to the connected Staff database after verification. There
  has not yet been an affirmative answer; remote schema/data remain unchanged.

### Fresh local database regression on 2026-09-04

- Restarted only the existing mount-free `crewflow-billing` Colima profile;
  Docker's default context remained `default`. The database exposed only
  `127.0.0.1:54322`, with an empty billing snapshot (revision 0).
- Source SQL and committed migration were still byte-identical. Reused the
  actual pg_prove container with the current test file: **107/107 passed**.
  This included the real anonymous-denial, crew privacy, exact replay,
  independent confirmation, transaction rollback and linked-event deletion
  assertions; original event/project/assignment/hour/invoice rows were unchanged.
- Applied only the previously documented temporary local `supautils.hint_roles`
  workaround during this test, then RESET/reloaded it and verified the original
  `anon, authenticated, service_role` value. Post-test groups, memberships,
  requests and revision were all 0. The isolated profile was stopped cleanly.
- The two-session harness was not rerun at this checkpoint; its follow-up
  improvements and concurrency acceptance remain pending.

### Task 6 editor verified and reviewed

- Commit `03d51ea` adds the production editor, synthetic fixtures and ten
  real-control tests. Parent independently reran all current billing tests:
  4 files / 58 passed, no React act/accessibility warnings. Changed-file ESLint
  passed, and fresh application TypeScript output is byte-identical to the
  199-diagnostic baseline (no billing diagnostics).
- Both independent specification and code-quality reviews approved Task 6.
  Review confirmed frozen inputs, separate cross-project/move confirmation,
  exact ambiguous replay, conflict recovery, remote identity filtering and
  initially-empty-only deletion. Bounded candidate scrolling, text wrapping
  and explicit disabled custom controls are present.
- Nonblocking coverage follow-ups for final UI/regression acceptance:
  confirmation resets after edits, definitive-error draft preservation,
  and Escape/X close interception. Integrated responsive/focus checks still
  await Task 7; the editor has not yet been claimed available in the app.
- Task 7 event-detail integration and crew-safe summary are in progress.

### Task 7 integration checkpoint (not complete)

- At `9679cee`, parent independently ran the billing feature and the three
  event-detail suites: 8 files / 121 tests passed. Changed-file ESLint passed.
  Application typecheck still reports 199 pre-existing diagnostics. The only
  textual difference from baseline is an existing event-detail test diagnostic
  moving from line 296 to line 300 after the added mock; no new diagnostic.
- Independent specification review reproduced a real React Query scheduling
  race: a successful refetch returns revision 2 before the observer updates its
  revision-1 props. Reopening the frozen editor from observer data can therefore
  retain obsolete membership/revision. The fix must reopen from the successful
  result's data, with a regression proving fresh command inputs.
- In the loopback-only local preview, parent explicitly grouped synthetic
  `QA Nakládka` and `QA Instal` as `QA Festival`. `QA Jiná akce` from project B
  was initially hidden; opt-in revealed it, and saving was rejected until the
  separate cross-project confirmation was checked. The resulting summary kept
  all three original names, dates and Job Numbers. No remote records changed.
- Both CrewHead and COO opened the editor. Crew saw the summary without a
  management button or any timelogs for the null local profile. Desktop Escape
  closed the idle editor. Broader privacy and in-flight cases remain covered by
  component/database tests, not by this synthetic UI observation alone.
- At 375 × 812, actual screenshots exposed another integration defect: the
  portal dialog and overlay have z-index 50, behind the mobile detail (70),
  floating actions (80) and test role switcher (90). Accessibility-tree presence
  was not sufficient evidence of a usable dialog. A narrowly scoped layering
  fix and fresh visual verification are required before accepting Task 7.
- Task 8 event-save assignment, Task 9 deletion guards, final acceptance,
  target-schema deployment approval, main integration and device refresh remain
  outstanding. Invoice upload and extraction are not part of this stage.

### Task 7 repairs verified and reviewed

- `7f3698d` repairs conflict recovery by retaining an explicit editor session
  built from the successful reload result. The regression failed with the old
  handoff and now proves the next command uses refreshed revision, name and
  membership while observer data is deliberately still stale.
- `8fb2a90` adds a backward-compatible optional overlay class to the shared
  dialog. Only the billing editor requests overlay z-index 100 / content 101;
  other dialogs retain their existing defaults. Parent repeated actual mobile
  screenshots at 375 × 812: overlay and editor now cover the detail and floating
  controls correctly. Keyboard Tab reaches the footer and scrolls it into view;
  Escape closes the editor. Dialog clientWidth and scrollWidth both measured
  326px, confirming no horizontal overflow for the synthetic review content.
  The temporary viewport override was reset afterwards.
- Parent fresh verification at `8fb2a90`: **9 files / 124 targeted tests passed**,
  changed-file ESLint and `git diff --check` passed. Fresh app typecheck retains
  exactly the 199 baseline diagnostics after normalizing the one known existing
  event-detail test line-number shift. It is not a globally passing typecheck.
- Independent specification and quality reviews both accepted Task 7. They
  independently passed 21 and 23 focused tests respectively. One nonblocking
  follow-up remains: return a realistic successful `data` payload in the
  late-old-scope reload fixture, so the active-scope guard is tested independently
  of the newer missing-data guard. Record this with the other final regression
  coverage follow-ups; no remaining functional Task 7 blocker was identified.
- This is a partial implementation checkpoint in the isolated worktree, not a
  completed or deployed app change. Tasks 8–10 remain as above. The synthetic
  local preview tab on port 8087 is retained for continuation; the user's main
  preview on port 8086 was not replaced, and no remote schema/data or development
  device installation was changed at this checkpoint.

### Simulator handoff requested — 2026-09-04

- User requested the existing detail-based grouping in the simulator, pointed
  out missing management overview styles and logout in local preview 8087, and
  explicitly approved adding the billing tables/functions to Staff. The current
  handoff therefore prioritizes reviewed Tasks 1–7 plus deletion safety (Task 9).
  Task 8 assignment inside the event-save form remains a separate follow-up;
  this checkpoint does not claim that workflow or invoice upload is complete.
- Root causes were distinct: the isolated branch lacked main's `7992c58` mobile
  overview CSS/routing fix; logout was already implemented but intentionally
  hidden by `isAuthRequired` in the `VITE_APP_DATA_SOURCE=local` preview. The
  ordinary ignored configuration uses Supabase and targets Staff. No auth UI
  workaround or fabricated local login was added.
- Merged current main `55e46b6` into the feature worktree as `f3dafe4`, without
  conflicts. Fresh integrated checks passed: 101 files / 982 tests, web build,
  lint (0 errors, 2 existing hook warnings), staged diff whitespace check.
  Main's uncommitted TimelogsView source/test edits were not changed or included.
- Repeated the isolated local pgTAP suite: **107/107 passed**. The two-session
  concurrency proof again observed the loser waiting, then rejecting stale
  revision with no partial state. Exact synthetic fixtures were cleaned; local
  counts and revision returned to 0. Restored Supautils hint settings and stopped
  the isolated Colima profile. No local test touched Staff data.
- Deployment target independently rechecked: Staff `gkxbluqkugprwcpdephk`,
  PostgreSQL 17.6.1.104, matching the ordinary app's public URL. Billing objects
  were absent; existing event columns/RLS and authoritative `has_role` helper
  matched the reviewed migration. Exposed GUC writers use fixed unrelated
  lifecycle settings; no generic SQL/GUC setter was found.
- After the user's explicit approval, applied the byte-identical reviewed SQL
  using Supabase migration tooling as **20260904112112 / billing_groups**.
  Renamed the local migration from its original local-only timestamp to match
  the actual remote history; source SQL still compares byte-for-byte identical.
  Post-deploy catalog confirms RLS on all four tables, no anon table/RPC access,
  invoker-only functions with empty search paths, private trigger helper, the
  restrictive event FK, and an empty snapshot at revision 0.
- Post-deploy advisors: no new security findings (33 pre-existing findings),
  no new performance warnings. Two INFO notices identify the expected unused
  indexes on the newly empty tables; these support group/actor access and are
  retained. The existing role-switch RPC and other historical security findings
  remain unchanged; this is development testing, not a production-security
  sign-off. Current Data API grant changes were checked against the official
  Supabase changelog; the migration already contains explicit grants and RLS.
- The live project currently has only a crew role, not a COO/crewhead actor.
  An attempted read-only manager-context probe therefore correctly returned
  false/null revision and is not counted as a successful manager test. Manager
  writes are established by the local role tests; no live user's role was
  changed to manufacture a passing result.
- Simulator/device installation and final integrated review remain pending at
  this checkpoint. Booted simulator identified as iPhone 17 Pro on iOS 26.5,
  UUID B337323A-264B-4AAC-9236-BEAAB3701659.

### Reviewed simulator candidate

- `2c4636b` completes Task 9: local grouped-event deletion is rejected before
  any dependent-data mutation; the remote Czech guidance applies only to SQLSTATE
  23503 with the exact quoted billing-membership FK. Other delete failures keep
  their existing mapping. The late-old-scope fixture now includes realistic data.
- Independent Task 9 specification review passed 139 focused tests. Final
  integrated quality review at `e99577d` passed 184 focused tests and found no
  actionable blocker for this development simulator checkpoint.
- Parent's final candidate verification: **101 files / 988 tests passed**;
  web build passed; lint passed with the same 2 existing hook warnings. App
  typecheck still fails with exactly the same 192 diagnostics as fresh clean
  main `55e46b6`, comparing diagnostic text with source line shifts normalized:
  no new or removed diagnostics. This is not a globally clean typecheck.
- Main integration and native refresh are the remaining handoff steps. The
  clean installation checkout preserves ignored `.env.local`; unrelated dirty
  TimelogsView source/test edits are excluded from the installation candidate.

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
  deletion tests in Task 9. Task 5 is now in progress.

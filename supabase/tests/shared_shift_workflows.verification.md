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

## Required feature evidence (pending)

- Authenticated role/ownership/RLS and ACL checks.
- Atomic membership, progressive saves, immutable submission sets and current targeted approval integration.
- Exact retries, altered-payload retries, version conflicts and rollback of every member.
- Old RPC/direct-write/import/assignment bypass checks.
- True multi-session assignment/membership/submit and approval races.
- Unchanged original events, hours, invoices, receipts and historical billing groups.
- Fresh migration replay, advisor delta and function lint.
- App integrations, mobile/desktop review, main integration and separate development-device results.

No shared-workflow migration has been applied to Staff. New remote rollout remains a separate concrete approval after local verification.

# Billing database checkpoint — 2026-09-03

Status: locally verified, **not approved for production rollout**. No production writes were performed.

## Verified behavior

- RED: before schema creation, pgTAP assertions 1–6 failed for missing tables/read RPC/write RPC, followed by the missing management helper error.
- GREEN: 107 real pgTAP assertions passed, including crewhead/COO management, forged-metadata denial, anonymous EXECUTE denial, direct-table guards, actor-private ledger, exact replay, stale versions (including removed members), independent cross-project/move confirmations, stable empty sources, explicit empty deletion, crew-filtered snapshots, and unchanged event/project/assignment/hour/invoice rows.
- A test-only late revision trigger forces a failure after header/member/ledger writes; all writes roll back and the previous transaction marker is restored.
- Existing `delete_event_atomic` fails with the membership FK and preserves the event and dependent rows.
- `billing_groups.concurrency.mjs` observed session B waiting on A via `pg_blocking_pids`. After A committed, B failed with SQLSTATE `40001`, leaving no B group, request, membership, or revision increment.
- Final local cleanup check: revision 0; groups, members, requests, synthetic users, and open concurrency sessions all 0.
- Local `supabase db lint --local --schema public --level warning --fail-on error`: no schema errors.
- Local advisors: 88 baseline findings (61 WARN / 27 INFO), 80 afterward, no new findings and no SECURITY findings. Unrelated existing findings were not changed.
- Types generated using `supabase gen types --local --lang typescript --schema public --network-id crewflow-billing-loopback`; only the four billing tables and three callable helpers/RPCs were added. Focused `tsc --noEmit --skipLibCheck --lib ES2022,DOM src/lib/database.types.ts` passed.
- `git diff --check` passed. CLI-created `20260903133657_billing_groups.sql` is byte-identical to verified `supabase/billing-groups.sql`.

## Local environment and reproduction

Database: disposable Supabase PostgreSQL 17.6, fixed Docker context `colima-crewflow-billing`, container `supabase_db_crewflow-billing-tests`, network `crewflow-billing-loopback`; parent verified only loopback port 54322. No production link/data was used. Legacy migration history needs an existing invoice-batch schema prerequisite; the parent bootstrapped that locally without rewriting historical migrations. Consequently migration generation used `supabase migration new billing_groups` and the verified SQL source, not a shadow-database diff.

The mount-free Colima VM causes ordinary `supabase test db <host-path> --local` to report **NOTESTS**; that result is not counted as verification. The actual pgTAP runner was run as follows:

```sh
docker --context colima-crewflow-billing create --name crewflow-billing-pgtap --network crewflow-billing-loopback -e PGPASSWORD=postgres public.ecr.aws/supabase/pg_prove:3.36 pg_prove -h db -U postgres -d postgres --verbose /tmp/billing_groups.test.sql
docker --context colima-crewflow-billing cp supabase/tests/billing_groups.test.sql crewflow-billing-pgtap:/tmp/billing_groups.test.sql
docker --context colima-crewflow-billing start -a crewflow-billing-pgtap
node supabase/tests/billing_groups.concurrency.mjs
```

For another run, reuse the stopped runner with `docker cp` and `docker start -a`. The concurrency script refuses nonempty/unexpected billing state and cleans only its exact synthetic fixtures. It resets the disposable singleton revision with an explicit guarded administrator-only teardown after checking that no other billing data exists; this is test code, not a client write path.

## Security assumptions and unresolved rollout gates

1. The local Supabase image crashes in the **existing supautils permission-error hint code** when invoking an EXECUTE-denied function. This reproduced with both billing RPCs and a constant-only test function. The parent temporarily disabled only `supautils.hint_roles` in the disposable database and reloaded it. With that diagnostic-only workaround, actual anonymous calls returned normal permission-denied errors and all 107 assertions passed. ACLs, RLS, reserved roles and preloads remained unchanged. See [Supabase Postgres issue 2112](https://github.com/supabase/postgres/issues/2112) and [supautils issue 214](https://github.com/supabase/supautils/issues/214). The parent owns restoring the temporary local override. Production behavior has not been exercised or declared unaffected.
2. The parent's read-only production catalog review found a pre-existing public `set_current_user_role(app_role)` SECURITY DEFINER RPC that lets authenticated callers assign their own authoritative role. This is absent from the bootstrapped local migration baseline. **Production crew-read-only protection cannot be claimed until separately authorized role hardening is completed.** The billing change intentionally does not modify that out-of-scope function.
3. Local exposed function inspection found only fixed-name GUC setters in the existing invoice/import RPCs, not a generic SQL or setting RPC. The guard relies on the API not exposing arbitrary SQL/GUC setting; it supplements actual role checks and RLS and is not a database-login security boundary.
4. Actor-only ledger RLS hides another actor's request. After taking the singleton lock, the invoker RPC reserves the complete immutable result with `INSERT ... ON CONFLICT DO NOTHING` before revision validation. This detects hidden request collisions without reading private payloads or using SECURITY DEFINER. Reservations roll back on all errors; exact visible replay is returned before revision validation. The parent approved this ordering adaptation.
5. Production migration application, role hardening, parent specification/quality reviews, application integration and device acceptance remain outside this checkpoint.

# Shared shifts — rollout preflight

Status (2026-10-09): the user authorized continuation of the concrete rollout below. Both exact reviewed migrations are deployed to Staff, the verified implementation is integrated into `main` at `e5de1af`, and the development simulator and paired iPhone have been built, installed and launched. Simulator inspection confirmed the styled dashboard and the real Staff-backed **Propojit směny** dialog. This is shared-shift development rollout completion, not production release or completion of the later per-person invoice-selection stage.

## Completed rollout — 2026-10-09

- Rechecked Staff migration history and the absence of shared-workflow objects before writing. The MCP migration request failed with an expired request state; read-only checks confirmed no write. The official CLI dry run offered only the two approved migrations; `supabase db push` then applied both successfully with their original version numbers. No migration-history repair, seed or unrelated migration was used. Both file hashes below still match.
- Remote catalog checks confirm all nine new tables have RLS, no anonymous access and no authenticated direct DML. The five public shared-workflow RPCs are invokers with authenticated-only EXECUTE. All 22 created/replaced function bodies match the exact reviewed SQL; preserved assignment helpers retain their original hashes and are not callable by API roles. The four shared write/version/assignment triggers are attached; no automatic invoice trigger is attached.
- Aggregate count plus ordered full-row JSON fingerprints of all 14 original business tables are identical before/after deployment. Workflow/round/request counts and the new revision remain zero. No existing records were converted or test business records created.
- Rollback-only read smoke passed for the available CrewHead account and rejected missing auth. Staff currently has no uniquely bound authenticated crew/COO account to use for those remote read-smoke cases; those roles' lifecycle behavior was verified in the existing local SQL/UI suites, not asserted as a new full remote approval test.
- The security advisor returns 30 findings across the same five pre-existing categories (1 / 3 / 9 / 16 / 1), with no shared-workflow finding. The three wrapped assignment APIs are now invokers, removing their old authenticated-definer findings. Remaining baseline warnings below are not remediated by this feature.
- A separate clean checkout at `/Users/peetax/Projekty/crewflow-shared-rollout-20261008` preserves the original checkout's three unrelated dirty files unchanged. The merged suite passed 143 files / 1,703 tests; the clean `main` was pushed and verified equal to `origin/main`. Existing ignored `.env.local` configuration was preserved, and refresh preflight checks stayed intact.
- `npm run ios:refresh:devices` built and installed the app on iPhone 17 Pro / iOS 26.5 simulator and paired iPhone 13 mini. The first restricted attempt could not access CoreSimulator; the same command succeeded through build/install with the required system access. iPhone launch initially required developer trust; after the user confirmed it on the phone, the explicit launch retry succeeded. Simulator UI inspection used only navigation and opening the picker, without saving membership or advancing real reports.
- The final complete refresh on synchronized main `9d5d31e` exited 0, reporting both simulator and phone updated. To avoid the reproduced default config-bundling stall, this run selected Vite's already-tested `--configLoader runner` only for that process; tracked source/config and refresh preflight checks were unchanged. Both native builds, installations and launches passed. The verification log records this final run and its raw evidence.

Evidence and acceptance limitations: `supabase/tests/shared_shift_workflows.verification.md`; manual test guide: `docs/testing/shared-shifts-acceptance-cs.md`.

The following sections retain the historical pre-deployment baseline and scope.

## Staff state observed 2026-09-29

- Project: Staff (`gkxbluqkugprwcpdephk`), active/healthy, Postgres 17.6.1.104.
- Last recorded migration: `20260914135908_targeted_event_approval`; earlier billing-group and schedule/blank-draft migrations are present.
- `public.shift_workflows` and `public.read_shift_workflows()` are absent. No new shared-workflow migrations have been applied.
- No attached automatic invoice trigger (including any trigger invoking `handle_timelog_approved()`). Old billing group/member counts are both zero at inspection; do not rely on those remaining zero at rollout.
- Body hashes of nine existing functions match the local tested baseline: targeted handoff/resolution, assignment/removal/withdrawal, and ordinary save/import/transition/delete. For the three wrapped assignment functions the comparison uses the local preserved `*_before_shared_rounds` bodies.
- Inspection read schema metadata and aggregate counts only; no business rows, roles, memberships or invoices were modified.

## Exact proposed remote scope

Apply, in order, the two reviewed repository migrations:

1. `supabase/migrations/20260923092136_shared_shift_workflows.sql`
2. `supabase/migrations/20260923100014_shared_shift_round_lifecycle.sql`

Inspected SHA-256 values, respectively: `baf2f2c6e494026c736d6c139e269ca7493e11b24f2254f61fd9bce3b9625128` and `d7fd8ed33612122d66635d4b2b74fde6f71b5076e8daf636170f9b2531565486`.

These add seven public workflow/membership/state/request/round/item/action tables and two private transaction-permit tables, with explicit privileges and RLS. Five public invoker entry points cover reading, membership, draft save, submission and transitions. Narrow private implementations validate the signed-in actor, role, exact target set and expected row versions. Assignment/removal/withdrawal retain their existing logic behind shared-round guards; hour/day guards prevent advancing only one frozen part via an old write path.

No existing hours, statuses, prices, event assignments, invoices, receipts or billing groups are merged, converted, reset or deleted. The migrations do not create groups from job numbers. Historical billing tables stay in place. Approval alone does not create an invoice. The existing testing role switch is not changed by this scope.

## Baseline security warnings — not introduced by this change

The current remote advisor reports 33 findings across five categories: one RLS-without-policy INFO for the intentionally inaccessible invoice-number sequence table; three mutable-search-path warnings in budget functions; nine public/anonymous definer-callability warnings; nineteen authenticated definer-callability warnings; and disabled leaked-password protection. These are a **pre-deployment baseline**, not an assertion that the application is production-secure. Some callability warnings concern intentional authenticated APIs or trigger functions; remediation requires separate review, not blanket revocation during this feature.

References: [RLS policy lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search path lint](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous definer lint](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Required gate and follow-up

- Local Task 9 spec/quality fixes, full suite, build and baseline-delta static checks are verified at `277033b`.
- Confirm final migration contents and refresh read-only Staff preflight immediately before deployment.
- Obtain the user's explicit approval for the new shared-hour approval mechanism and schema above. The earlier approval for billing groups does not cover this scope.
- After approval, deploy only these reviewed migrations, verify remote objects/ACL/RLS/function bodies and no unexpected data conversion; compare advisors to this current baseline.
- Integrate reviewed code into synchronized `main` without touching unrelated dirty files. Run `npm run ios:refresh:devices` from a clean synchronized checkout with the existing ignored local configuration preserved.
- Report simulator and physical iPhone separately; perform simulator acceptance and describe any uninstalled/unavailable device honestly.

Local evidence lives in `supabase/tests/shared_shift_workflows.verification.md`. The rollback-only migration rehearsal preserves all 14 original business-table snapshots with synthetic mixed historical data. That rehearsal does not authorize or perform a remote rollout.

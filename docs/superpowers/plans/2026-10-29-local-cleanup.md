# Nodu local technical cleanup implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded tasks and executing-plans for integration. Follow systematic-debugging and verification-before-completion. The user authorized the adjusted roadmap's technical cleanup and remaining local checks; domains, public hosting, real email and public rollout stay deferred.

**Goal:** Remove the current 108 application type diagnostics without weakening checks, finish the confirmed independent local regressions, reconcile obsolete work notes and verify the resulting development installations.

**Architecture:** Keep the existing domain models, UUID ownership, query lifecycle, approval protocol and Supabase schema. Repair the hand-maintained database contract at its source, then fix callers/fixtures using actual domain types. Local safety findings get an isolated failing regression before a fix; no live-data experiment or public configuration is authorized by this plan.

**Tech Stack:** TypeScript, React, Vitest, installed Supabase SDK, existing local Supabase pilot and Capacitor iOS.

## 1. Baseline and database contract

- [x] Verify clean isolated worktree and fetched main `ec88626`; preserve original checkout's unrelated files and ignored local runtime configuration.
- [x] Run `npx tsc --noEmit -p tsconfig.app.json --pretty false`: exit 2, **108 diagnostics**. Evidence `/private/tmp/nodu-cleanup-baseline-types-20261029.log`.
- [x] Repair `src/lib/database.types.ts` against existing migrations and installed SDK `GenericSchema`: explicit Views, each table's Row/Insert/Update/Relationships and accurate RPC Args. Do not use `any`, an untyped client, blanket Partial inserts or schema/permission changes to hide mismatches.
- [x] Extend meaningful SDK type contracts in `src/lib/database.types.test.ts` where needed: known table rows, required insert fields, precise update/RPC arguments and rejection of unknown fields remain checked. Observe the initial compiler failure, then run the compiler and the existing focused database/service tests.
- [x] Independent spec review, then quality review; fix material findings before integrating the next task.

## 2. Remaining application and fixture diagnostics

- [x] Recount after task 1; repair only surviving errors. Files are identified by the fresh diagnostic list, initially `src/types.ts`, `src/lib/app-data.ts`, `src/lib/supabase-mappers.ts`, event lifecycle/receipt services, affected views/modals, and their test fixtures.
- [x] Use `ReceiptItem`, explicit local/remote event identity and existing UUID helpers. Keep historical local numeric identifiers distinct from persisted UUIDs. Correct filter predicate input types, assertion declarations, JSON boundary validation and typed mocks/fixtures rather than widening everything to string or unknown.
- [x] Run each affected existing suite. Add a focused RED/GREEN regression only where the correction changes runtime behavior or exposes a real boundary bug; pure fixture/annotation repairs use compiler diagnostics as the failing check.
- [x] Add `"typecheck": "tsc --noEmit -p tsconfig.app.json"` and `"check": "npm run typecheck && npm run lint && npm test -- --maxWorkers=2 && npm run build"` to `package.json`. Document normal local validation in README. Keep compiler/linter strictness and test discovery intact.
- [x] Achieve `npm run typecheck` exit 0; review the complete patch independently.

## 3. Remaining independent local safety checks

- [x] Reproduce the actual ordinary Supabase singleton's implicit URL-session behavior in an isolated regression with no human credentials. If confirmed, set `detectSessionInUrl: false` in `src/lib/supabase.ts`, preserving ordinary persisted sessions and the existing isolated recovery operation; verify both supported activation/recovery fragment paths and ordinary login still work.
- [x] Reproduce own-profile sensitive-field writes in the existing disposable local pilot with synthetic identities, rollback test writes and verify legitimate personal updates. If confirmed, prepare the narrow migration/regression in source, apply only to the disposable local pilot, and preserve role/activation/rate/history invariants. Do not alter the live database as part of this local task.
- [x] Record exact environment, API/SQL outcomes and any remaining prerequisite. Full public deployment and final penetration-test acceptance stay open.

## 4. Reconcile notes and preserved work

- [x] Rewrite `TODO.md` around current evidence: completed backend/accounts/invoicing, actual first-version remaining tasks and separately deferred ideas. Preserve legitimate ideas without presenting already implemented work as missing.
- [x] Inspect old branch heads, worktree dirt/configuration and draft PR #6 against current main. Close only a demonstrably superseded PR; preserve unique commits and dirty/ignored configuration. Do not mass-delete branches or archive another task's worktree.
- [x] Audit confirmed broken Czech UI strings; make only evidence-backed small corrections and verify affected UI. No layout redesign or dependency upgrade.

## 5. Complete local verification and integration

- [x] Run `npm run typecheck`, `npm run lint`, full `npm test`, `npm run build`, `git diff --check`. Expect exit 0 for each; classify environmental timeouts honestly and fix real failures. Server runtime checks use their own toolchain.
- [ ] Integrate reviewed source into main, verify the merged code and clean synchronized main, preserve `.env.local`, and run `npm run ios:refresh:devices` per AGENTS. Report simulator/physical phone separately; unavailable paired phone waits, an available-device failure blocks that installation.
- [x] Save `docs/testing/2026-10-29-local-cleanup.md` and a clearly incomplete first-version acceptance record; update roadmap only for criteria actually completed. Public onboarding, real pilot, final push distribution and final security acceptance remain open.

## Výsledek 29. 10.

Databázový kontrakt, callery i profilová ochrana mají nezávislé spec a následné quality PASS. Čistý synchronizovaný main `e49c353` prošel celým `npm run check`: 0 typových chyb, lint, 219 souborů / 2 878 testů a build. Místní skutečné SQL/API regrese prošly. Refresh předepsaným příkazem aktualizoval a spustil simulátor; fyzický telefon byl úspěšně sestaven, podepsán a nainstalován, spuštění ale blokuje zamčené zařízení. Bez potvrzení spuštění zůstává tento instalační krok otevřený. [Úplná evidence](../../testing/2026-10-29-local-cleanup.md).

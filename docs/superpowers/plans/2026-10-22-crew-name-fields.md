# Crew Name Fields Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the implementation task and independent spec/quality review. Steps use checkbox syntax for tracking.

**Goal:** Split the member form into Jméno and Příjmení without losing saved name boundaries.

**Architecture:** Extend Contractor with optional structured components and preserve them in the existing profile mapper. A small resolver supplies legacy compatibility. The form updates components and display name together; the crew service normalizes and persists the existing columns directly.

**Tech Stack:** React, TypeScript, Vitest, existing Supabase profiles schema, Capacitor.

---

Spec: docs/superpowers/specs/2026-10-22-crew-name-fields-design.md. Reuse worktree tally-onboarding-design on codex/crew-name-fields, baseline fbc3dda. Parent baseline passed34 tests in3 files. Preserve root's three unrelated working files and all live input in the preview. Do not alter public recruitment, existing data or local runtime configuration.

## Task 1 — Form and structured name round trip

Files: src/types.ts; src/lib/supabase-mappers.ts and existing tests; src/features/crew/services/crew.service.ts and focused persistence tests; src/features/crew/services/crew-name.ts (small resolver); src/components/modals/ContractorEditModal.tsx; src/views/CrewView.form.test.tsx.

- [x] Extend meaningful tests first: new-member form enters surname before first name and saves name plus both components with rate250; editing preloads structured compound names and preserves them during an unrelated edit; clearing either component does not shift text; existing custom/zero-rate checks use the separate controls. Assert real Supabase insert/update payloads contain the exact components and mapper hydration retains them. Keep legacy full-name and mononym compatibility.
- [x] Run focused Vitest and record expected RED caused by missing controls/structured persistence.
- [x] Add optional firstName/lastName to Contractor. Implement a resolver returning explicit components when either is defined; otherwise split a trimmed legacy name into all-but-last and last (one token becomes first only). Preserve empty explicit values.
- [x] mapContractor returns firstName and lastName alongside name. normalizeCrewMember resolves and trims components, derives name and initials, retains current other-field normalization. toProfilePayload writes the resolved firstName/lastName instead of resplitting name.
- [x] Keep the legacy updateContractor Settings caller working: compare against the matching current member and re-resolve only a changed full name whose components were carried through unchanged. Regression-check both a full-name edit and unrelated edits to a compound name. No Settings UI changes.
- [x] Replace the combined input with associated Jméno/Příjmení inputs, autocomplete given-name/family-name. Their onChange passes both components and composed name to the parent. Keep city and remaining fields in the existing responsive grid system. Do not add new validation restrictions.
- [x] Run focused tests and lint; self-review and commit only the task files. Independent spec review, then quality/final review, resolving any findings before integration.

Run: node node_modules/vitest/vitest.mjs run src/views/CrewView.form.test.tsx src/features/crew/services/crew.service.test.ts src/lib/supabase-mappers.test.ts [new focused persistence test if created] --maxWorkers=4. Expected: all relevant tests pass after recorded RED.

## Task 2 — Parent acceptance and installations

- [x] Run full tests, full lint and normal web build. Compare type diagnostics against the accepted baseline if touched types produce concerns; no unrelated type fixes.
- [x] Inspect the actual form in the already running test preview, including mobile width and existing user input preservation. Do not submit an unwanted member or discard user-entered data.
- [x] Fast-forward verified changes into main, preserving the root's three unrelated files; push/synchronize. Reuse clean main checkout .crewflow-onboarding-main-20261021, preserving ignored .env.local. Verify merged code before refresh.
- [x] Run npm run ios:refresh:devices from synchronized clean main with IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-ios-device-refresh-20261022-manual (complete framework cache). Restore only verified Capacitor-generated path changes afterward. Report simulator and physical phone separately. Any available-device failure remains blocking until resolved.
- [x] Record actual acceptance and final checklist. Refresh the separate pilot native preview only if needed for the user's next test; public onboarding/Tally/real mail stay disabled.

## Acceptance — 2026-10-22

- Implementation e6eca70; test-only type correction 4446e7d. Integrated current main b891984 without a conflict. Independent spec and final quality reviews passed with no actionable findings.
- TDD observed23 expected failures/31 passes before implementation, then54/54 focused tests passed. Full suite passed2571/2571 in200 files. Fresh synchronized clean-main verification at4446e7d passed the same2571/2571 in37.23s; full ESLint passed.
- Clean current-main TypeScript baseline and final code both produce110 existing diagnostics; diagnostic sets match after line-number normalization. Nine new test-only unsupported options were removed before final acceptance. No claim of globally clean TypeScript checking.
- Actual browser form shows associated Jméno/Příjmení inputs stacked at mobile width with default250. Reopened the previously empty new-member form after development hot reload reset its UI state. No member or invitation was submitted by the agent. Screenshot: /Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020/evidence/crew-name-fields-web-20261022.png.
- Updated the separate nodu test native preview using the guarded local-only pilot build; native build/install/launch passed in9.2s and ordinary operator authentication survived. The original Mobilní Test account/session was untouched.
- Source4446e7d was pushed to main; clean main matched origin/main. Required npm run ios:refresh:devices passed preflight, normal web build and native sync using the existing complete DerivedData cache. Simulator iPhone17Pro: build/install/launch succeeded. Physical paired iPhone Peetax: available; existing-team signed build/install/launch succeeded. Refresh exit0. Preserved ignored local development-team configuration and restored only verified generated package-path rewrites.
- Root's unrelated TimelogsView source/test retained their original content hashes. Info.plist was independently reformatted/reordered during the session; semantic contents equal the baseline, and this task never wrote or committed it. Untracked vendor SwiftPM state was also left alone.
- No database migration, bulk profile update, linked backend deployment, Tally connection or real email delivery. Normal application onboarding/invitation opt-ins remain disabled.

Private parent logs: /private/tmp/crew-name-fields-{baseline,red,green,full-tests,full-lint,baseline-types,tsc-after-test-fix,merged-main-tests,merged-main-lint,pilot-build,pilot-sync,main-device-refresh}.log. Final follow-up commit changes this checklist only; installed application source remains4446e7d.

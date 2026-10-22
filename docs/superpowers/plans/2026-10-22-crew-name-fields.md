# Crew Name Fields Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the implementation task and independent spec/quality review. Steps use checkbox syntax for tracking.

**Goal:** Split the member form into Jméno and Příjmení without losing saved name boundaries.

**Architecture:** Extend Contractor with optional structured components and preserve them in the existing profile mapper. A small resolver supplies legacy compatibility. The form updates components and display name together; the crew service normalizes and persists the existing columns directly.

**Tech Stack:** React, TypeScript, Vitest, existing Supabase profiles schema, Capacitor.

---

Spec: docs/superpowers/specs/2026-10-22-crew-name-fields-design.md. Reuse worktree tally-onboarding-design on codex/crew-name-fields, baseline fbc3dda. Parent baseline passed34 tests in3 files. Preserve root's three unrelated working files and all live input in the preview. Do not alter public recruitment, existing data or local runtime configuration.

## Task 1 — Form and structured name round trip

Files: src/types.ts; src/lib/supabase-mappers.ts and existing tests; src/features/crew/services/crew.service.ts and focused persistence tests; src/features/crew/services/crew-name.ts (small resolver); src/components/modals/ContractorEditModal.tsx; src/views/CrewView.form.test.tsx.

- [ ] Extend meaningful tests first: new-member form enters surname before first name and saves name plus both components with rate250; editing preloads structured compound names and preserves them during an unrelated edit; clearing either component does not shift text; existing custom/zero-rate checks use the separate controls. Assert real Supabase insert/update payloads contain the exact components and mapper hydration retains them. Keep legacy full-name and mononym compatibility.
- [ ] Run focused Vitest and record expected RED caused by missing controls/structured persistence.
- [ ] Add optional firstName/lastName to Contractor. Implement a resolver returning explicit components when either is defined; otherwise split a trimmed legacy name into all-but-last and last (one token becomes first only). Preserve empty explicit values.
- [ ] mapContractor returns firstName and lastName alongside name. normalizeCrewMember resolves and trims components, derives name and initials, retains current other-field normalization. toProfilePayload writes the resolved firstName/lastName instead of resplitting name.
- [ ] Replace the combined input with associated Jméno/Příjmení inputs, autocomplete given-name/family-name. Their onChange passes both components and composed name to the parent. Keep city and remaining fields in the existing responsive grid system. Do not add new validation restrictions.
- [ ] Run focused tests and lint; self-review and commit only the task files. Independent spec review, then quality/final review, resolving any findings before integration.

Run: node node_modules/vitest/vitest.mjs run src/views/CrewView.form.test.tsx src/features/crew/services/crew.service.test.ts src/lib/supabase-mappers.test.ts [new focused persistence test if created] --maxWorkers=4. Expected: all relevant tests pass after recorded RED.

## Task 2 — Parent acceptance and installations

- [ ] Run full tests, full lint and normal web build. Compare type diagnostics against the accepted baseline if touched types produce concerns; no unrelated type fixes.
- [ ] Inspect the actual form in the already running test preview, including mobile width and existing user input preservation. Do not submit an unwanted member or discard user-entered data.
- [ ] Fast-forward verified changes into main, preserving the root's three unrelated files; push/synchronize. Reuse clean main checkout .crewflow-onboarding-main-20261021, preserving ignored .env.local. Verify merged code before refresh.
- [ ] Run npm run ios:refresh:devices from synchronized clean main with IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-ios-device-refresh-20261022-manual (complete framework cache). Restore only verified Capacitor-generated path changes afterward. Report simulator and physical phone separately. Any available-device failure remains blocking until resolved.
- [ ] Record actual acceptance and final checklist. Refresh the separate pilot native preview only if needed for the user's next test; public onboarding/Tally/real mail stay disabled.

# Mobile event form — paused checkpoint

Paused on 2026-09-04 at the user's request before going offline. Do not resume implementation until the user asks. No recurring task or background continuation was created.

## Saved code and verified progress

- Repository: `/Users/peetax/Projekty/crewflow`.
- Working tree: `/Users/peetax/Projekty/crewflow/.worktrees/mobile-event-form`.
- Branch: `codex/mobile-event-form`.
- Code commit: `aa01bac83e87924657a3aae57fb62e8ee486d143`.
- Latest plan commit before this checkpoint: `6134324`.
- Changes are committed locally, not merged into main or pushed. No remote migration or device installation has happened.
- Implemented: schedule-v2 domain resolver, blank/partial planned shifts and free days, additive schedule database migration with authenticated SQL tests, metadata persistence, strict actual-hours submission validation, v2 desktop/mobile timelog defaults, event readers/proposals and invoice-comment schedule inference.
- Schedule database work passed independent spec and quality reviews (final DB/index commit `7773fa9`).
- App integration at `aa01bac` passed independent spec review. Root and reviewers independently verified **98 test files / 1,017 tests**, production build; scoped lint has zero errors and two existing effect warnings.
- App integration quality review is interrupted, NOT approved yet. Finish it before starting the next implementation task.

## First next action: finish the interrupted quality review

Reviewer `/root/schedule_app_quality_review` found a concrete candidate in `MobileTimelogEditModal.tsx`'s `TimeWheelPicker`: the new `onKeyDown` marks every key, including Tab, as scroll intent. In its isolated real-component JSDOM reproduction, programmatic scroll alone wrote nothing, but `keyDown(Tab)` followed by programmatic scroll wrote `00:00` to an empty value without time selection or confirmation.

Reproduce in the repository's component tests, distinguish navigation keys from deliberate time selection/scrolling, make the minimal correction, and re-review. This is recorded, not fixed. The previous 1,017 passing tests do not cover this case. Earlier regressions already fixed: opening/confirming existing `9:10` must not round it to `09:00`; switching Od to a blank Do must not carry scroll intent (picker is keyed by date/entry/field).

The implementer was `/root/schedule_app_integration`; use a follow-up if still available. Otherwise give a fresh bounded fix agent the exact context. Follow the existing subagent-driven-development workflow: one implementation agent at a time, spec then quality review, no parallel conflicting writes.

## Remaining implementation sequence

1. Finish app integration quality review/fix above.
2. Implement targeted approval database routing, immutable identity snapshots, transition guards and real SQL tests.
3. Implement approval API/hydration, shared return-note flow and assigned-person gating across all entry points.
4. Implement pure event form state/validation and the fullscreen mobile editor/day planner.
5. Actual mobile QA, fresh migration replay, reviewed development DB rollout, final feature review, main integration/synchronization and development device refresh.

Full requirements and step-by-step work are preserved in these plans (read them, not just this checkpoint):

- `2026-09-04-event-schedule-persistence.md` (database Task1 complete; app Task2 implemented/spec approved, quality unfinished).
- `2026-09-04-targeted-event-approval.md` (not implemented yet).
- `2026-09-04-mobile-event-form-implementation.md` (not implemented yet).
- `2026-09-04-mobile-event-form-preflight.md` and `../specs/2026-09-04-mobile-event-form-design.md`.

Latest plan amendments: auth-user snapshots as well as profile IDs prevent re-binding `profiles.user_id` after handoff; a returned targeted report cannot bypass its next approval round via the legacy approved-import RPC; reports with history but no active round must not get the legacy UI fallback; legacy event upgrade happens only on explicit save, not open/cancel.

## Decisions that must not be reopened

- Required visible contact + phone. Visible “Schvaluje také hodiny”; off selects a separate intended COO.
- CH review then exactly one assigned COO. Additional approvers deferred.
- Real account onboarding deferred, not an implementation blocker: saving an intended contact without login is allowed; handoff fails clearly until a separate qualified COO account is linked. Never invent success, create live fixture accounts or grant roles to make the flow pass.
- Hours approval separate from invoicing. Remove only automatic approval-to-invoice trigger; preserve existing invoices/receipts and explicit billing.
- Crew/CH/COO development role switch unchanged.
- Whole-event boundaries separate from per-day plans/actual hours; phases by day, optional phase times, free/unknown days, rare repeated phases and legacy Přípravy preserved.
- No new phase self-application; production assigns people. Keep exact “Rozdělit akci na fáze” label.
- Description and meeting place optional but visible. Remove dresscode from editor only, preserve stored history.
- Preserve per-date draft caches through range/toggle/free-day changes and confirm dropping saved dates; preserve all actual hours.

## Local test environment (stopped, data preserved)

- Own Vite local/demo preview on `127.0.0.1:8086/app` was stopped (old exec session69018). Restart from worktree with `VITE_APP_DATA_SOURCE=local npm run dev -- --host 127.0.0.1 --port 8086 --strictPort`.
- CUA test tab was browser1/tab2, separate from user's prototype at60245. Viewport override was reset on pause. Existing test form was unsaved; no business data was created.
- Docker container `crewflow-event-form-db` stopped on pause, not removed. It contains schema-only baseline plus schedule migration/index, no business fixtures after rollback. Restart with `docker start crewflow-event-form-db`; psql via `docker exec -i ... psql -U postgres -d postgres -X -v ON_ERROR_STOP=1`.
- Docker containers `crewflow-event-form-replay` and `crewflow-event-form-replay-contract` are also stopped. The former has committed synthetic race fixtures: do NOT reuse it for the rollback suite (duplicate IDs). The latter is clean but predates index addition.
- Persistent schema-only baseline backup: `/Users/peetax/Projekty/crewflow-local-backups/mobile-event-form/schema-before-20260904.sql`. Original temp copy: `/private/tmp/crewflow-schema-before-20260904.sql`. No real row data in this dump.
- Supabase image: `public.ecr.aws/supabase/postgres:17.6.1.104`; original container bound only localhost55439. Existing image supplies auth schema/functions; no auth stubs necessary.
- Do not reapply additive migrations to an already-migrated container. Fresh replay = baseline dump, schedule migration, then new approval migration, then rollback tests.
- Use Supabase CLI `migration new` for the approval migration filename. Remote development project `gkxbluqkugprwcpdephk` has NOT been changed by this task. Main owns later reviewed rollout, no live fixtures.

## Additional verification notes for the next DB task

Root ran actual app typecheck `npx tsc -p tsconfig.app.json --noEmit --pretty false` on worktree and original main. Both fail with pre-existing broad diagnostics (268/276 output lines respectively). Plain `tsc --noEmit` against root config checks no app files and is not evidence of type correctness.

No new app-integration TS cause identified: existing Supabase `never` payload and fixture missing `allow_crew_time_proposal` diagnostics only changed object shape. However, the earlier new `event-schedule-migration.test.ts` duplicates an existing Node-test pattern without Node ambient types, adding four diagnostics for node:fs/node:path/process. Make a minimal scoped typing fix in this task-owned test when adding the next SQL contract test; do not expand into a global TS cleanup.

Review earlier schedule SQL fixtures for compatibility with the new targeted guard. Its separate documented race protocol currently performs a direct CH→COO status update; it will need a targeted handoff setup (or clearly documented pre-approval-migration scope). Keep all prior completeness assertions meaningful; do not weaken them just to make a combined replay green.

## Integration and user data preservation

Original main contains unrelated uncommitted user changes in `src/views/TimelogsView.tsx` and `.test.ts`: managerial month filtering, compact mobile status popover, preserving selected month on data updates. Preserve them on integration; they are intentionally absent from this worktree. Do not reset/overwrite them or accidentally claim them as task work.

AGENTS.md requires merge into main, verify merged code, synchronize origin/main, then `npm run ios:refresh:devices` from a clean main checkout. Preserve ignored `.env.local` without printing it; it supplies existing signing configuration. Simulator and physical iPhone results must be reported separately; unavailable paired phone is non-blocking/waiting, available-device build/sign/install/launch errors are blocking.

iOS debugger skill and refresh script were read. Preflight found booted iPhone17Pro / iOS26.5 / simulator `B337323A-264B-4AAC-9236-BEAAB3701659`. No device refresh performed. Re-read current skill/config as needed when resuming; follow AGENTS.md refresh command rather than bypassing its preflight.

No active implementation/review agents or test servers should continue working while paused. No production deployment has happened.

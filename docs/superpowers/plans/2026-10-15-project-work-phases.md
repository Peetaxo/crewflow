# Project work phases implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track steps below.

**Goal:** Show actual project work hours and cost by preparation, installation, operation and dismantling, and make preparation selectable when planning a new event.

**Architecture:** Extend the pure project summary with a focused work-phase calculation. Reuse its project membership, de-duplicated timelogs, invoice links and exact invoice shares; never change existing financial totals. A compact, always-visible horizontal bar chart directly below the total-cost card shows four phase rows and any unallocated amount. EventDayPlanner exposes the already supported preparation phase. No schema, auth or persistence changes.

**Tech stack:** React/TypeScript, existing Radix disclosure and nodu palette, Vitest, Capacitor iOS.

## Requirements

- User chose **hours and cost**. Use actual non-rejected timelog day types/times across project events; event plans only supply form defaults. Do not reclassify historical work from current plans.
- Latest user steering: place a compact graph directly below the “Celkem” card, before the existing category cards. Title “Práce podle fází”; four horizontal rows Přípravy / Instal / Provoz / Deinstal each show hours and work cost. Bar length represents share of work cost only, with a labelled work subtotal so it cannot be confused with overall project total. Use existing orange accent/shades, no new palette. This chart is visible without another disclosure. Existing category/stage totals, section order, event collapse/search and documents remain unchanged.
- Match project/event UUID identity and existing de-duplication rules. Count a non-rejected timelog's hours once, including invoice-linked logs. Handle overnight and multiple same-day phases with the existing hour calculation. Unsupported runtime phase types go to an unallocated bucket.
- Unlinked work costs use the same known-rate rules and rounded per-timelog amounts as the existing summary. Missing rates retain known hours and an explicit incomplete-price notice.
- Invoiced amounts use frozen **exact project work shares**, never today's contractor rate. Distribute those shares proportionally to actual phase hours only when linked timelog evidence is complete and unambiguous: all authoritative references resolve uniquely, invoice hours reconcile using billing rounding, project/event membership and contractor ownership are known, and links are not shared ambiguously across invoices. Label the allocation method alongside the chart.
- If invoice allocation evidence is incomplete, missing or ambiguous, keep that known amount as **Nerozřazeno**. Do not invent phase hours, silently drop money, or duplicate hours in the unallocated-price row. Unknown project invoice shares keep the existing warning and do not invent known amounts.
- Use deterministic cent allocation so phase work amounts plus unallocated work reconcile to the existing work total. Retain zero/negative finite amounts consistently; never render NaN/Infinity. Breakdown prices may show up to two decimal places so displayed allocation remains understandable.
- Show a “Nerozřazeno” row only when necessary, with an explanation. A dash in its hours column is appropriate when it represents unallocated money whose known hours already appear in phase rows. Known-hour totals are based on available actual work records.
- Preserve existing loading/error/auth-scope behavior. Accessible figure and text/list labels, mobile 320/390 px, existing light/dark nodu tokens only. Decorative bars are hidden from assistive technology; real values remain readable text. Draw comparable shares only for a positive finite work total and nonnegative finite reconciled parts; zero/negative/nonfinite inputs must not create misleading ratios or NaN/Infinity.
- In EventDayPlanner, make Přípravy a normal option for new and existing events. Existing validation/default/schedule serialization already supports all four types; preserve times and multiple phases per day. Do not alter worker-entered records or event date ranges.

### Task 1: Implement a complete vertical slice with meaningful tests

**Files:** `src/features/projects/services/project-summary.ts`; optional focused helper `project-work-phases.ts` and tests; `ProjectCosts.tsx` and focused tests / ProjectStatsView integration tests; optional presentational `ProjectWorkPhases.tsx`; narrowly scoped project-detail CSS; `EventDayPlanner.tsx` and tests. Keep ProjectDocuments and financial persistence services untouched.

- [x] Verify baseline project/planner tests and capture TypeScript diagnostics.
- [x] Add failing tests for phase hours/costs, invoice frozen amounts, conservative unallocated fallback, sum reconciliation, missing rates, duplicate/UUID/partial links, cross-project data, rounding and actual-over-plan classification.
- [x] Implement focused pure phase calculation and integrate it without changing any pre-existing summary totals.
- [x] Add failing UI tests, implement the compact phase graph below Celkem and normal preparation option. Preserve existing cost component test usage and notices.
- [x] Run scoped tests, changed-file ESLint and build; self-review and commit.
- [x] Independent specification review then quality review; address findings and recheck.

### Task 2: Verify and deliver

- [x] Browser QA with fictional data in light/dark, desktop/320/390 px, phase graph, zeros/unallocated work, and new-event preparation choice.
- [x] Merge into clean main; run full suite/build and compare normalized TypeScript diagnostics; synchronize main without force. Preserve unrelated primary checkout work.
- [x] Refresh simulator and paired iPhone using the required project script and preserved signing configuration. Verify and report installation/launch results separately.
- [x] Record evidence and clean up owned preview/worktree resources.


## Delivery evidence — 2026-10-15

- Implementation: `d927c71`; business-facing unallocated explanation: `ad7cde9`; reviewed application merged and pushed on main as `f0a33a1`.
- Independent specification and quality reviews passed without remaining findings. Existing category, stage and project total arithmetic was preserved; invoice phase prices use the frozen project work share and conservative evidence checks.
- Baseline scoped tests: 148 passed. Final scoped tests: 186 passed, including red/green regressions for fractional-cent preservation and unsafe cent-allocation fallback. Changed-file ESLint and whitespace checks passed.
- Merged main production build passed. Normalized TypeScript diagnostics exactly match the captured baseline: 111 existing diagnostics, zero added or removed.
- Initial full suite ran concurrently with build/TypeScript and hit five 5-second timeouts in four unchanged test files. Re-running the full suite with bounded concurrency (`npm test -- --maxWorkers=2`) passed all **167 files / 2,162 tests** without source or timeout changes.
- Actual app browser QA passed in light/dark, desktop and 320/390 px mobile layouts. Verified graph placement and price shares, frozen invoice rates, legacy unallocated price without invented hours, empty project values, and Přípravy in the new-event planner. All preview data was fictional; the test draft was discarded. Preview server/tab were closed and viewport reset.
- Required `npm run ios:refresh:devices` completed successfully from clean, synchronized main `f0a33a1`: **simulator updated and launched; physical iPhone updated and launched**. Existing local signing configuration was preserved; refresh preflight stayed intact.
- The merged feature worktree and branch were removed after remote ancestry verification. SHA-256 checks confirmed unrelated primary-checkout changes in Info.plist and both TimelogsView files were unchanged.

Evidence logs (local):

- `/private/tmp/crewflow-work-phases-main-tests-bounded.log`
- `/private/tmp/crewflow-work-phases-main-build.log`
- `/private/tmp/crewflow-work-phases-main-types.log`
- `/private/tmp/crewflow-work-phases-ios-refresh.log`
- `/private/tmp/crewflow-work-phases-red-preserve-totals.log`
- `/private/tmp/crewflow-work-phases-red-large.log`

Actual UI screenshots with fictional data:

- `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/project-work-phases-desktop-2026-10-15.jpg`
- `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/project-work-phases-mobile-2026-10-15.jpg`

This evidence update changes documentation only; the installed application source is `f0a33a1`.

# Project work phases implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track steps below.

**Goal:** Show actual project work hours and cost by preparation, installation, operation and dismantling, and make preparation selectable when planning a new event.

**Architecture:** Extend the pure project summary with a focused work-phase calculation. Reuse its project membership, de-duplicated timelogs, invoice links and exact invoice shares; never change existing financial totals. A collapsed detail inside the existing work-cost area reveals four phase rows and any unallocated amount. EventDayPlanner exposes the already supported preparation phase. No schema, auth or persistence changes.

**Tech stack:** React/TypeScript, existing Radix disclosure and nodu palette, Vitest, Capacitor iOS.

## Requirements

- User chose **hours and cost**. Use actual non-rejected timelog day types/times across project events; event plans only supply form defaults. Do not reclassify historical work from current plans.
- Keep the project detail compact: a clearly labelled, keyboard-accessible “Rozdělení práce” disclosure in the work-cost area defaults closed; four rows Přípravy / Instal / Provoz / Deinstal show hours and work cost. Existing summary categories/stages/order, event collapse/search and documents remain unchanged.
- Match project/event UUID identity and existing de-duplication rules. Count a non-rejected timelog's hours once, including invoice-linked logs. Handle overnight and multiple same-day phases with the existing hour calculation. Unsupported runtime phase types go to an unallocated bucket.
- Unlinked work costs use the same known-rate rules and rounded per-timelog amounts as the existing summary. Missing rates retain known hours and an explicit incomplete-price notice.
- Invoiced amounts use frozen **exact project work shares**, never today's contractor rate. Distribute those shares proportionally to actual phase hours only when linked timelog evidence is complete and unambiguous: all authoritative references resolve uniquely, invoice hours reconcile using billing rounding, project/event membership and contractor ownership are known, and links are not shared ambiguously across invoices. Label the allocation method in the expanded detail.
- If invoice allocation evidence is incomplete, missing or ambiguous, keep that known amount as **Nerozřazeno**. Do not invent phase hours, silently drop money, or duplicate hours in the unallocated-price row. Unknown project invoice shares keep the existing warning and do not invent known amounts.
- Use deterministic cent allocation so phase work amounts plus unallocated work reconcile to the existing work total. Retain zero/negative finite amounts consistently; never render NaN/Infinity. Breakdown prices may show up to two decimal places so displayed allocation remains understandable.
- Show a “Nerozřazeno” row only when necessary, with an explanation. A dash in its hours column is appropriate when it represents unallocated money whose known hours already appear in phase rows. Known-hour totals are based on available actual work records.
- Preserve existing loading/error/auth-scope behavior. Accessible disclosure and table/list labels, mobile 320/390 px, existing light/dark nodu tokens only.
- In EventDayPlanner, make Přípravy a normal option for new and existing events. Existing validation/default/schedule serialization already supports all four types; preserve times and multiple phases per day. Do not alter worker-entered records or event date ranges.

### Task 1: Implement a complete vertical slice with meaningful tests

**Files:** `src/features/projects/services/project-summary.ts`; optional focused helper `project-work-phases.ts` and tests; `ProjectCosts.tsx` and focused tests / ProjectStatsView integration tests; optional presentational `ProjectWorkPhases.tsx`; narrowly scoped project-detail CSS; `EventDayPlanner.tsx` and tests. Keep ProjectDocuments and financial persistence services untouched.

- [ ] Verify baseline project/planner tests and capture TypeScript diagnostics.
- [ ] Add failing tests for phase hours/costs, invoice frozen amounts, conservative unallocated fallback, sum reconciliation, missing rates, duplicate/UUID/partial links, cross-project data, rounding and actual-over-plan classification.
- [ ] Implement focused pure phase calculation and integrate it without changing any pre-existing summary totals.
- [ ] Add failing UI tests, implement collapsed phase detail and normal preparation option. Preserve existing cost component test usage and notices.
- [ ] Run scoped tests, changed-file ESLint and build; self-review and commit.
- [ ] Independent specification review then quality review; address findings and recheck.

### Task 2: Verify and deliver

- [ ] Browser QA with fictional data in light/dark, desktop/320/390 px, phase disclosure, zeros/unallocated work, and new-event preparation choice.
- [ ] Merge into clean main; run full suite/build and compare normalized TypeScript diagnostics; synchronize main without force. Preserve unrelated primary checkout work.
- [ ] Refresh simulator and paired iPhone using the required project script and preserved signing configuration. Verify and report installation/launch results separately.
- [ ] Record evidence and clean up owned preview/worktree resources.

# Simplified Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver the user's approved simple Projects list and four-part detail with accurate project financial totals.

**Architecture:** Pure project selectors derive periods, filtering and cost allocation from existing snapshots. Invoice hydration preserves persisted project item amounts. Views consume those selectors and reuse existing event forms and document download services; no database migration or new business workflow.

**Tech Stack:** React 18, TypeScript, Vite, Vitest/Testing Library, existing Supabase client and Capacitor iOS refresh.

## Task 1: Project selectors and financial snapshots

Files: `src/features/projects/services/project-summary.ts`, `project-summary.test.ts`, `projects.service.ts`, `projects.service.test.ts`, `src/types.ts`, `src/features/invoices/services/invoices.service.ts`, `invoices.service.test.ts`, `src/lib/supabase-mappers.ts` and its existing tests if needed.

- [ ] Add failing pure tests for period and filtering:

```ts
expect(getProjectPeriod([])).toBeNull();
expect(getProjectPeriod([event('2026-10-13', '2026-10-13')])).toEqual({ startDate: '2026-10-13', endDate: '2026-10-13' });
expect(getProjectPeriod([event('2026-10-20', '2026-10-23'), event('2026-10-10', '2026-10-12')])).toEqual({ startDate: '2026-10-10', endDate: '2026-10-23' });
```

- [ ] Add failing financial tests with real input snapshots: shared invoice has different job item values; one project gets only its own 1250 CZK share, linked receipt/timelog is not added again; later crew rate changes do not change persisted billed work; rejected expense contributes zero; current travel and meals contribute existing configured amounts; invoice draft/sent/paid stages remain disjoint; absent shared allocation is unknown, never a guessed full or equal amount.
- [ ] Run `npm test -- src/features/projects/services/project-summary.test.ts src/features/invoices/services/invoices.service.test.ts` and confirm new assertions fail for missing behavior.
- [ ] Implement exported `getProjectPeriod(events)`, `formatProjectPeriod(period)`, `matchesProjectFilters(project, period, filters)`, `getProjectSummary(projectId, snapshot)` with typed costs `{work, travel, meals, receipts, total}`, typed four-stage amounts, receipt records and invoice records including allocated cost or null and completeness indicators. Add `period` to existing project rows without changing legacy callers. Read latest snapshot only after dependency-load triggers. Retain persisted item amounts including `amount_meals` in Invoice mapping and local draft creation.
- [ ] Run the focused selector/service tests and TypeScript check; commit the data changes only after they pass.
- [ ] Obtain spec review, address gaps, then code quality review before Task 2.

## Task 2: Simple list and four-part detail

Files: `src/views/ProjectsView.tsx`, `ProjectsView.test.tsx`, `ProjectStatsView.tsx`, `ProjectStatsView.test.tsx`, `src/features/projects/components/ProjectDocuments.tsx` if separation helps, `src/components/modals/ProjectEditModal.tsx`.

- [ ] Write failing user-behavior assertions before view changes: the creation date is absent, period is a separate header, old segmented controls are absent, filter by client/date works and resets; plus opens project creation; detail contains events and costs but no graphs/timelog/crew KPI; event opens existing event view; plus opens a prefilled form; edit works; shared invoice row contains only project allocation and its actual invoice number; document loading errors surface without showing false zero totals.
- [ ] Run `npm test -- src/views/ProjectsView.test.tsx src/views/ProjectStatsView.test.tsx` and verify the assertions fail for missing new behavior.
- [ ] Implement list with toolbar filter, responsive table overflow, empty states and Events-style plus. Ignore obsolete persisted all/upcoming/past filters. In detail derive all values from the summary selector; sort events by startDate, then name; preserve project selection when returning from event; reuse `EventEditModal` locally and createEmptyEvent with projectId/job/client prefilled. Use existing role guards. Display project identity/period/edit, events, cost breakdown/stages and documents only. Hide the project note field but preserve its stored value on save.
- [ ] Use existing invoice PDF generation/download and receipt attachment download services for view actions. Guard asynchronous actions across project/scope changes and handle missing documents with clear empty states. Render 390px safely with no clipped cells or floating button overlap.
- [ ] Run focused component tests and build, commit, obtain spec review then code quality review.

## Task 3: Verify and integrate

- [ ] Run full `npm test`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and ESLint on changed TypeScript files. Fix regressions and rerun affected checks.
- [ ] Run isolated local preview with fabricated projects/events/expenses. Inspect desktop and mobile through cua_repl; verify date/client filter/reset, chronological event links, prefilled form, edit, shared allocation and document actions. Save a final screenshot for the user.
- [ ] Request final independent code review across the complete change.
- [ ] Commit verification notes, fetch remote and integrate the reviewed change into origin/main from the clean checkout. Preserve the unrelated main working changes.
- [ ] Verify synchronized main, run `npm run ios:refresh:devices`, inspect the simulator result and record simulator/iPhone outcomes separately. Deliver the screenshot and concise change report.

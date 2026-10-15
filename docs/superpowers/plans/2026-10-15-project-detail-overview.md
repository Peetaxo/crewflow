# Project detail overview implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track steps with checkboxes.

**Goal:** Implement the user-approved “Přehled” project detail with the application's existing palette, retaining all information and actions.

**Architecture:** Keep ProjectStatsView responsible for queries, permissions, editing and navigation. Extract focused presentational costs and event components if needed; restyle ProjectDocuments without changing its request lifecycle. Use existing `--nodu-*` theme tokens exclusively for colors, including dark mode.

**Tech stack:** React, TypeScript, Tailwind, Lucide, Vitest, Capacitor iOS.

## Approved specification

The user approved the first `data-variant="Přehled"` in the local concept artifact at `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/project-detail-design-concepts.html`. It is a layout reference, not a source of palette literals or fictional production data.

- Preserve order: project base, costs, events, documents. Preserve list/search unchanged.
- Header: Job Number chip, project name, client and realization period with small icons. Keep “Upravit projekt”. No producer/note fields.
- Costs: prominent total with cost-segment bar; four category cards (work, travel, meals, receipts); four stage cards (in progress, approved, invoiced, paid). Use existing actual selector values. Clearly retain incomplete-rate and unknown-allocation notices. Never render misleading percentages, NaN, or Infinity for zero or negative values. Do not change financial services/models.
- Palette: actual app orange accent, warm neutral surfaces/text, existing success/info/warning tokens. No copied mockup colors or new palette. Verify light/dark contrast. Decorative icons hidden from assistive technology.
- Events: responsive cards with date blocks, name, location, full period, occupancy, visible contact person, arrow and existing event-detail navigation. Keep management plus button prefilled with project/client. Preserve chronological selector order, loading/error/retry and empty states.
- Documents: responsive icon cards/rows, receipt amount/status/date and read-only detail; invoices with due date/status, explicitly labelled project share and existing PDF action. Preserve exact unknown-share handling and PDF request cancellation/scope guards.
- Mobile: 320/390 px widths without horizontal scrolling, long text wraps, legible controls and values. Desktop: make good use of available space without huge empty cards.
- No new sections, duplicated crew/open-work dashboards, data changes, new app chrome or navigation.

### Task 1: Implement approved detail and meaningful regression coverage

**Files:** `src/views/ProjectStatsView.tsx`, `src/views/ProjectStatsView.test.tsx`, `src/features/projects/components/ProjectDocuments.tsx`; optional focused `ProjectCosts.tsx`, `ProjectEvents.tsx`, corresponding behavior tests and scoped style file in the same feature directory.

- [ ] Establish passing project baseline; record TypeScript diagnostics before edits.
- [ ] Add failing behavioral tests for newly introduced cost-bar zero/negative safety and accessible breakdown, and preserve event/document actions. Avoid styling-class mirror tests.
- [ ] Replace flat financial output with semantic cards and bar using existing values and tokens. Reuse `formatCurrency`; keep warnings outside decorative graphics. Test zero values with `Number.isFinite` guards if numeric presentation is extracted.
- [ ] Replace wide event/document tables with responsive cards retaining visible data and real callbacks. Keep document request code unchanged.
- [ ] Run `npm test -- src/views/ProjectStatsView.test.tsx src/features/projects`, scoped ESLint and `npm run build`; inspect diff and commit. Expected: all project tests pass, no new lint diagnostics, build success.
- [ ] Independent spec review, then quality review; fix issues and repeat relevant checks.

### Task 2: Verify, integrate and refresh local installations

- [ ] Root verifies actual app with fictional local preview fixture: light/dark, 320/390/desktop, long text, receipt details, edit and event navigation/prefill.
- [ ] Run full tests once and compare normalized TypeScript diagnostics to baseline; investigate new failures.
- [ ] Merge into clean main clone, fetch and synchronize remote main; verify merged code and push without force. Preserve primary checkout's unrelated changes.
- [ ] Run `npm run ios:refresh:devices` with existing ignored signing configuration and a healthy task-specific DerivedData path. Report simulator and iPhone separately; ask for manual OS authorization only if an actual prompt blocks progress.
- [ ] Record concrete validation/native outcomes, clean up own preview/worktree resources and show an actual app screenshot to user.

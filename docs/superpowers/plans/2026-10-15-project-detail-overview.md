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

- [x] Establish passing project baseline; record TypeScript diagnostics before edits.
- [x] Add failing behavioral tests for newly introduced cost-bar zero/negative safety and accessible breakdown, and preserve event/document actions. Avoid styling-class mirror tests.
- [x] Replace flat financial output with semantic cards and bar using existing values and tokens. Reuse `formatCurrency`; keep warnings outside decorative graphics. Test zero values with `Number.isFinite` guards if numeric presentation is extracted.
- [x] Replace wide event/document tables with responsive cards retaining visible data and real callbacks. Keep document request code unchanged.
- [x] Run `npm test -- src/views/ProjectStatsView.test.tsx src/features/projects`, scoped ESLint and `npm run build`; inspect diff and commit. Expected: all project tests pass, no new lint diagnostics, build success.
- [x] Independent spec review, then quality review; fix issues and repeat relevant checks.

### Task 2: Verify, integrate and refresh local installations

- [x] Root verifies actual app with fictional local preview fixture: light/dark, 320/390/desktop, long text, receipt details, edit and event navigation/prefill.
- [x] Run full tests once and compare normalized TypeScript diagnostics to baseline; investigate new failures.
- [x] Merge into clean main clone, fetch and synchronize remote main; verify merged code and push without force. Preserve primary checkout's unrelated changes.
- [x] Run `npm run ios:refresh:devices` with existing ignored signing configuration and a healthy task-specific DerivedData path. Report simulator and iPhone separately; ask for manual OS authorization only if an actual prompt blocks progress.
- [x] Record concrete validation/native outcomes, clean up own preview/worktree resources and show an actual app screenshot to user.


## Verification and rollout — 2026-10-15

- Implemented at `6d8e78a`; accessibility follow-up `4d4ece8`; merged and synchronized main `5645265`.
- Independent specification review passed. Quality review found omitted card descriptions for assistive technology; corrected with per-card `aria-describedby` and re-review approved.
- Baseline: 76 scoped project tests. Final: 90 scoped tests; merged main: 165 test files / 2,108 tests passed. Changed-file ESLint and production build passed.
- TypeScript has 111 pre-existing diagnostics. Normalized file/code/message multiset is unchanged on merged main: zero added or removed diagnostics.
- Actual app verified with fictional local fixtures in both themes at desktop and 320/390 px widths, including zero costs, long unbroken names, receipt detail, event navigation/back, project editing, and new-event project/client prefill. No horizontal overflow found. Two-digit event date wrapping found and fixed before merge.
- Invoice project shares, incomplete-cost notices, financial services, auth scoping and PDF cancellation guards preserved. No database changes or production deployment.
- `npm run ios:refresh:devices` completed successfully from clean synchronized main `5645265`, using the preserved `.env.local` and existing healthy DerivedData. Simulator: updated and launched (screenshot inspected). Physical paired iPhone: updated and launched after the user confirmed the macOS codesign request.
- Actual app screenshots saved to the chat visualization directory as `project-detail-overview-desktop-2026-10-15.jpg` and `project-detail-overview-mobile-2026-10-15.jpg`.
- Temporary browser tab and preview server closed. Feature worktree and merged local feature branch removed. Primary checkout's three unrelated modified files verified unchanged by SHA-256.

Evidence logs (local): `/private/tmp/crewflow-overview-main-tests.log`, `/private/tmp/crewflow-overview-main-build.log`, `/private/tmp/crewflow-overview-main-types.log`, `/private/tmp/crewflow-overview-ios-refresh.log`.

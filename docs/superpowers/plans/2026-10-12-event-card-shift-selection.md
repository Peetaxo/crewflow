# Event Card Shift Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create shared shift workflows by selecting existing event cards, initially anchored at today with older weeks above, and saving only after a complete confirmation.

**Architecture:** Keep the existing authoritative management loader, impact calculation and atomic command unchanged. Separate pure calendar-window logic from scroll anchoring and one captured workflow draft shared by cards and confirmation; reuse that draft's safety state in the existing detail editor. Integrate the create session into Akce without persisting temporary date/search/view choices to AppContext.

**Tech Stack:** React, TypeScript, date-fns, TanStack Query, existing Radix dialog and button components, Vitest/Testing Library, Capacitor iOS.

---

## Approved scope and environment

Spec: `docs/superpowers/specs/2026-10-12-event-card-shift-selection-design.md`, explicitly approved by user. Work only in `/Users/peetax/Projekty/crewflow/.worktrees/shared-crew-workflow`, starting at `a4774dcde53774b4822dd71a4e10cc212abeb56f`. Reuse this clean task-owned worktree; do not modify or merge into the original dirty checkout.

Current app source is the reviewed installed `134431f` main range. Fresh baseline: 147 files / 1,755 tests, exit 0 in 70.41 s, `/private/tmp/crewflow-card-selection-20261012-baseline-tests.txt`. Actual TypeScript baseline has 112 diagnostics, exit 2, `/private/tmp/crewflow-card-selection-20261012-types-before.txt`; do not claim a green global typecheck.

The original checkout contains user edits to `ios/App/App/Info.plist`, `src/views/TimelogsView.tsx`, and `src/views/TimelogsView.test.tsx`. Preserve their contents. Preserve ignored `.env.local`, dependencies and development team in the clean rollout checkout `/Users/peetax/Projekty/crewflow-shared-rollout-20261008`.

No SQL, migration, gateway/API change, auth/role expansion, dependency change, invoice feature, Staff test save or change to the preview role switch. Existing linked-event detail editing remains available in its current dialog. Crew detail remains read-only.

## Files and responsibilities

- Create `src/features/shift-workflows/shift-workflow-card-timeline.ts` and `.test.ts`: calendar windows, chronological occurrences, global search, empty-week progress.
- Create `src/features/shift-workflows/useShiftWorkflowDraft.ts` and `.test.tsx`: extract existing EditorSession's captured data, selection, confirmations, immutable retry, explicit refresh and activation retirement into one reusable hook.
- Create `src/features/shift-workflows/ShiftWorkflowConfirmation.tsx` and `.test.tsx`: full impact and confirmation controls shared by detail editor and new create summary, not a second picker.
- Create `src/features/shift-workflows/EventShiftWorkflowCardSelection.tsx` and `.test.tsx`: scope-owned create provider/session, search/date toolbar, card stage and confirmation stage. Own a captured management read and keep the session mounted across stage changes.
- Create `src/features/shift-workflows/useShiftWorkflowCardScroll.ts` and `.test.tsx`: actual `.nodu-page-frame` scroll-root anchoring, today/date jumps, prepend compensation, search/back restoration and listener cleanup.
- Create `src/features/events/components/EventListCard.tsx` and `.test.tsx`: extract the existing event-list card presentation with explicit normal vs selection behavior. It never saves a workflow; normal handlers and visual structure remain equivalent.
- Modify `src/views/EventsView.tsx`: compose existing normal content and scoped create selection, wire toolbar/card mode, hide normal create/delete/copy/navigation actions during selection, preserve normal AppContext state and detail retirement.
- Modify `src/features/shift-workflows/EventShiftWorkflowManagement.tsx`: use the new create entry; keep keyed detail overview, manual reads and existing editor lifetime behavior.
- Modify `src/features/shift-workflows/ShiftWorkflowEditor.tsx`: use the shared draft and confirmation without changing its detail-picker behavior.
- Modify `src/styles/mobile-events.css` only for scoped picker/bar/keyboard-safe layout; use existing tokens and safe-area conventions. No global shell changes unless a demonstrated scope-local solution is impossible.
- Extend actual route/owner/query regressions in `src/views/EventsView.shift-workflows.test.tsx`, `src/views/EventsView.test.tsx`, `src/features/shift-workflows/EventShiftWorkflowManagement.test.tsx`, `src/features/shift-workflows/EventShiftWorkflowManagement.query.test.tsx`, and `src/features/shift-workflows/ShiftWorkflowEditor.test.tsx`.
- Update `docs/testing/shared-shifts-acceptance-cs.md`; create `docs/testing/2026-10-12-event-card-shift-selection-verification.md` after real evidence exists.

The named boundaries are intentional. If exact prop plumbing requires a different small integration helper, report the change before expanding file scope. Do not add a second business-rule implementation or turn EventsView into a larger monolith.

## Runner commands

Execute from the task worktree. The supported runner loader avoids the known default config-bundling stall.

```bash
node --input-type=module -e 'globalThis.__dirname=process.cwd();process.argv=["node","vitest","run","--maxWorkers=1","--configLoader=runner"];await import("./node_modules/vitest/vitest.mjs");'
node --input-type=module -e 'globalThis.__dirname=process.cwd();process.argv=["node","vite","build","--configLoader","runner"];await import("./node_modules/vite/bin/vite.js");'
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
git diff --check
```

For a targeted run insert exact test paths after `"run"` in `process.argv`. Record actual RED failures before production changes, then GREEN results and git SHA. Missing-module failure alone is not behavioral RED: add an empty implementation with the intended signature if needed, then observe the actual missing-behavior assertion.

## Task 1 Calendar windows and chronological occurrences

**Files:** Create the timeline module and its test, only. No route, UI, database or data-loading changes in this task.

- [ ] Step 1: Write the initial failing tests for seven calendar-day ranges, chronology and a global search which ignores the date boundary. Use real Event identities and schedule helpers; each candidate is `{ id: string, event: Event }`.

```ts
import { describe, expect, it } from 'vitest';
import type { Event } from '../../types';
import { createCardTimeline, previousTimelineWeek, cardTimelineOccurrences, expandCardTimelineHistory } from './shift-workflow-card-timeline';

const make = (id: string, date: string, name = id) => ({
  id, event: { id: Number(id), name, job: 'QA100',
    startDate: date, endDate: date, status: 'upcoming' } as Event,
});
it('prepares the preceding week but keeps today as anchor', () => {
  expect(createCardTimeline('2026-10-12')).toEqual({
    anchorDate: '2026-10-12', startDate: '2026-10-05', query: '',
  });
});
it('moves in seven calendar-day batches', () => {
  expect(previousTimelineWeek('2026-10-05')).toBe('2026-09-28');
});
it('sorts older above today and future below it', () => {
  const rows = cardTimelineOccurrences([
    make('13', '2026-10-13'), make('11', '2026-10-11'), make('12', '2026-10-12'),
  ], createCardTimeline('2026-10-12'));
  expect(rows.map((row) => row.date)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
});
it('searches beyond the window by name and jobnumber', () => {
  const timeline = { ...createCardTimeline('2026-10-12'), query: 'qa100' };
  expect(cardTimelineOccurrences([make('1', '2026-02-01')], timeline)[0].date).toBe('2026-02-01');
});
```

- [ ] Step 2: Run this test file with the runner command; verify expected missing behavior, not fixture/import mistakes.
- [ ] Step 3: Implement the pure model using date-fns `parseISO`, `subDays`, `format`, `isValid` and `listEventDates` for scheduleVersion 2; legacy dates use existing `getDatesBetween`. Export these exact contracts:

```ts
import type { Event } from '../../types';
export interface CardTimeline {
  anchorDate: string;
  startDate: string;
  query: string;
}
export interface CardTimelineCandidate { id: string; event: Event }
export interface CardTimelineOccurrence extends CardTimelineCandidate { date: string }
export const createCardTimeline = (anchorDate: string): CardTimeline => ({
  anchorDate, startDate: previousTimelineWeek(anchorDate), query: '',
});
```

`previousTimelineWeek(date)` returns the local ISO date seven days earlier; invalid input is rejected, never silently interpreted as UTC or NaN. `cardTimelineOccurrences(candidates, timeline)` returns actual schedule occurrences at/after startDate, sorted by date then name then stable ID. With nonempty trimmed Czech-lowercased query it searches name and jobnumber across all occurrences instead. Duplicate candidate identities/occurrences must not generate duplicate card keys. Include active multiday scheduled occurrences on today, not just their first day.

- [ ] Step 4: Add behavioral RED tests for multiday cards sharing one identity, scheduleVersion 2 gaps, blank query, Czech name matching, invalid date and empty-history gaps. Implement `expandCardTimelineHistory(timeline, occurrenceDates)`: if older dates exist, lower startDate by seven-day increments until the next prior occurrence is reachable; otherwise return unchanged. This keeps week arithmetic while preventing empty weeks trapping the user. It never changes anchorDate or query.

```ts
it('crosses empty weeks without declaring history finished', () => {
  const timeline = createCardTimeline('2026-10-12');
  const next = expandCardTimelineHistory(timeline, ['2026-09-20', '2026-10-12']);
  expect(next.startDate).toBe('2026-09-14');
  expect(next.anchorDate).toBe('2026-10-12');
});
it('stops when no earlier occurrence exists', () => {
  const timeline = createCardTimeline('2026-10-12');
  expect(expandCardTimelineHistory(timeline, ['2026-10-12'])).toEqual(timeline);
});
```

Use a bounded calculation from the nearest earlier date rather than an unbounded render-triggered loop. These functions are pure display logic; do not filter candidate eligibility or mutate selected IDs here.

- [ ] Step 5: Run all timeline tests and existing `shift-workflows.management.test.ts`, `shift-workflows.selection.test.ts`, `src/views/EventsView.test.tsx`; verify GREEN, diff-check, self-review and commit only the two new files. Spec review then quality review must pass before Task 2.

## Task 2 Shared safe draft and selection directly in Akce cards

**Files:** All named UI/draft/scroll/integration modules and their tests; no documentation except checkbox state after completed review, no gateway/schema/package/native project changes.

- [ ] Step 1: Add failing actual-route tests before modifying production code. Reuse the current route's realistic fixture boundary, actual event cards, manager owner and atomic command builder. Mock I/O only, not the new picker/draft/card/confirmation. Freeze only Date, leaving real asynchronous timers available. Extend fixtures with today, future, yesterday, an older empty-week gap, an ongoing multiday event, a submitted event, an existing source group and differing raw jobs.

```tsx
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-10-12T12:00:00'));
render(<EventsView />);
fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
await screen.findByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
expect(screen.getByText('Vybráno: 0')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Pokračovat' })).toBeDisabled();
```

In tests select actual card checkboxes by full accessible name and assert all copies of a multiday identity agree. Click header/card Enter/Space and assert no detail/copy/delete/profile navigation occurs. Select two distinct IDs, change search/date and assert count is still two; **Pokračovat** opens a summary with both even if one is hidden. Assert no save before final confirmation. Tests must restore Date after each run.

- [ ] Step 2: Run RED and record exact failures. Split tests into focused behavioral cases; do not reduce existing detail/query/approval coverage just to make the new tests pass.
- [ ] Step 3: Extract EditorSession's existing draft behavior into a shared hook. Port the capture, activation, inFlight, send/save/reload logic from current `ShiftWorkflowEditor.tsx` without weakening any branch; keep safeMessage and current snapshot/version command behavior. The exact state contract is:

```ts
interface ShiftWorkflowDraftInput {
  scope: ShiftWorkflowScope;
  workflowId: string | null;
  data: ShiftWorkflowManagementData;
  onSave: (command: SaveShiftWorkflow) => Promise<unknown>;
  onReload: () => Promise<ShiftWorkflowManagementData>;
  onClose: () => void;
}
interface ShiftWorkflowDraftActions {
  changeSelection: (ids: string[]) => void;
  save: () => void;
  reload: () => Promise<void>;
  send: (command: SaveShiftWorkflow) => Promise<void>;
  close: () => void;
}
```

The hook also returns captured data, eventIds, impact from `getWorkflowSelectionImpact`, busy/locked/error/conflict/pending/reviewRequired/reviewed, cross/moves/dissolveConfirmed and their setters. Capture with lazy `structuredClone(input.data)`. Selection changes clear cross/moves/dissolve/review/error exactly as before. The keyed owner decides true retirement; date/search/stage changes never change the session key.

Extract complete existing impact/confirmation rendering into `ShiftWorkflowConfirmation`. Detail editor keeps its picker and original save/dissolve controls, using this hook. New create summary renders every selected title/job/date including missing-ID warning, no picker; its final button is **Propojit směny**, with **Zpět k výběru** separate from guarded close. Do not let back escape pending/conflict lock; explicit refresh/review works in the same session. All original editor tests, including exact retry object equality and source-remnant versions, must remain valid.

- [ ] Step 4: Add the scope-owned create session. Use authoritative `useShiftWorkflows` ready/scopeKey and `loadEventShiftWorkflowManagementData`, not page role or a person's assignments. Preserve abort/request-version guards for initial reads, retries and scope reactivation. Render the new card stage only after full management data is available. Reuse the existing create action's toolbar placement; do not leave a second legacy create dialog entry behind.

Provide a create-session provider/context or render-prop boundary with this explicit public UI contract; integrate within EventsView so selected-detail navigation unmounts/retires it:

```ts
interface EventCardSelectionState {
  data: ShiftWorkflowManagementData;
  scope: ShiftWorkflowScope;
  eventIds: readonly string[];
  locked: boolean;
  busy: boolean;
  toggle: (id: string) => void;
  blockedReason: (id: string) => string | null;
  continueToSummary: () => void;
  cancel: () => void;
}
```

The session computes prospective whole-group impact before toggling, permits no unauthorized role, and never drops IDs after a query publication or refresh. Share one draft across card and summary phases. On success or cancel restore normal content; if an old request finishes after unmount/scope change, it cannot close a new session.

- [ ] Step 5: Extract only the existing card presentation required for reuse. Preserve its normal layout, multiday date labels/accent, staffing and ordinary handlers. Selection mode takes explicit controlled props:

```ts
interface EventCardSelection {
  checked: boolean;
  disabled: boolean;
  reason: string | null;
  onToggle: () => void;
}
```

Use checkbox semantics and one event identity for all occurrences. In selection mode turn crew chips into noninteractive text, omit deletion/copy/application controls and have the card activate only the checkbox selection. No nested-button/checkbox double-toggle or propagation to detail. Retain the standard event-card visual identity; do not create a unrelated second card design.

- [ ] Step 6: Compose a local timeline from Task 1 in the selection stage. Initial anchor is today's local date; prepare the preceding week above it, then scroll to today's marker or first following card without opening full history. Use a persistent toolbar with labelled search and date picker, and stable date/occurrence markers. Change date by `createCardTimeline(date)` preserving selected IDs; global search overrides the window without overwriting the prior date/window.

Preserve AppContext's normal view mode, filter, calendar date and global search. The temporary selection does not call those setters. Return to the existing month/calendar/mobile feed on cancel/success, preserving the original scroll position.

- [ ] Step 7: Implement actual scroll-root anchoring and RED geometry tests. Find the real `.nodu-page-frame` ancestor, not window; store the stable visible occurrence key and its offset. Measure before prepend, then compensate in a layout effect after commit. If measured top was `beforeTop`, resulting root adjustment is:

```ts
root.scrollTop += afterTop - beforeTop;
```

Use the same offset capture/restore for first entry/date jump, leaving search, back from confirmation and normal-mode restoration. Scope listeners to the active root with cleanup; use passive listeners when not preventing native gestures. Keep high-frequency positions in refs, not per-pixel React state. Derive primitive effect dependencies and guard one expansion per committed range, user movement towards older cards only; do not auto-expand the entire history on mount.

Test a previous card moving from 100px to 350px adds 250px to root.scrollTop and keeps the key/offset; test repeated notifications, empty weeks, no earlier data, search suspend/resume and a new session ignoring old scheduled scroll work. A tiny DOM fixture is acceptable for geometry, but route/lifecycle tests must retain real components.

- [ ] Step 8: Add scoped layout for the selection bar above mobile navigation, sufficient end padding, safe areas and keyboard visibility. Validate today anchor after keyboard focus changes; do not replace ordinary native scroll with a custom swipe gesture. Native date change must preserve existing selection. On desktop normal calendar changes restore correctly after selection.

- [ ] Step 9: Run focused GREEN regressions including both CH and COO, crew/admin no management, actual query publication deletion/error and scope switches. Required error cases: initial read failure/retry, frozen opening versions despite live publication, blocked other-person/source remnant, missing selected member, conflict refresh failure and review, exact ambiguous retry, duplicate save, old load/save/refresh after identity/detail/tab changes. Record concrete test counts and all changed files; self-review/diff-check and commit. Spec review then quality review must pass.

## Task 3 Verification documentation and development rollout

**Files:** The testing guide, new verification report and plan checkboxes only. Parent handles integration, UI diagnostics and devices; documentation worker records actual evidence, never performs source/main/remote/device changes.

- [ ] Step 1: Update the manual guide with new creation path: Akce card mode, today/yesterday weekly navigation and date jump, all-history search, retained multiday selection, summary/back/final confirmation. Keep existing edit, evidence, approval and invoice-limit scenarios. Use a two-person overlap fixture and independent source group.
- [ ] Step 2: Parent independently runs all tests, web build, changed-file ESLint and actual tsc. Compare normalized file/message diagnostics to the fresh 112-error baseline; global typecheck remains non-green if unchanged. Write exact measured results and log paths, not expectations.
- [ ] Step 3: Parent visually verifies real local UI at desktop and 390 × 844 mobile, with only runtime/local fixtures and no Staff business mutations. Check exact scroll offsets before/after prepend, initial today view, crossing empty weeks, date jump, global search, repeated multiday selection count, summary/back retention, cancelled normal-view position, bar versus keyboard/nav, locked-card reason and both roles.
- [ ] Step 4: Review documentation and whole code range. FF integrate the reviewed app into the clean rollout checkout, reverify merged code and push/synchronize main. Check original three dirty file hashes remain untouched.
- [ ] Step 5: Run mandatory `npm run ios:refresh:devices` with preserved config, intact preflight and required system access. Existing process-only Vite runner preload is allowed; no tracked build-config workaround. Inspect actual simulator UI after launch without saving Staff test data. Report physical build/sign/install/launch separately; unavailable phone waits, available-device failure blocks.
- [ ] Step 6: Record installed app commit, actual simulator/iPhone results and limits. Review final docs-only evidence, commit, FF merge and push that documentation. Prove no app-code difference from installed commit before omitting an unnecessary second native build. Final answer explains actual new path and installation status, with a real screenshot.

## Review and completion gates

After each implementation task: independent spec review first, code quality second; resolve concrete findings before starting the next task. Parent runs final independent verification and the final whole-range review before integration. Preserve the actual source boundaries and safety checks rather than treating passing mocked tests as sufficient.

This plan does not authorize test writes in Staff, broader auth changes, production deployment, PR creation or touching unrelated user files. Completion includes the two separately reported development installations required by AGENTS.md.

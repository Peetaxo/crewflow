# Mobile In Place Shift Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn mobile linking into immediate selection of the current event cards, preserving their date and position, with a floating footer and safe deferred evidence checks.

**Architecture:** Reuse the existing task worktree. Separate the nullable initial evidence phase from the established immutable workflow draft, but share the same command, conflict and ambiguous-retry implementation. A mobile owner exposes selection state while a stable overview renders the existing header and cards; desktop creation and event-detail editing retain their current paths.

**Tech Stack:** React 18, TypeScript, TanStack Query, existing EventListCard, date-fns, Vitest and Testing Library, CSS, Capacitor iOS.

## Approved specification and scope

Implement `docs/superpowers/specs/2026-10-13-mobile-in-place-shift-selection-design.md`, explicitly approved by the user on 13 October. The chosen layout is Spodní lišta, with a fixed physical viewport, not the stretching demonstration. Keep the original 12 October desktop behavior. No database migrations, production business writes, invoice changes, dependencies, global TypeScript cleanup, or unrelated refactors.

Work in `/Users/peetax/Projekty/crewflow/.worktrees/shared-crew-workflow`, starting from specification commit `88c7d67`. Reuse its installed dependencies. Preserve the four dirty 12 October documentation files exactly; do not stage them. Preserve the original checkout's Info.plist and TimelogsView files and the other chats' rollout checkout. Use the existing clean `/Users/peetax/Projekty/crewflow-card-selection-rollout-20261012` only for parent integration and refresh.

## Files and responsibilities

- Create `src/features/shift-workflows/useDeferredShiftWorkflowDraft.ts`: shared draft state, nullable opening evidence, freeze-on-first-complete-read, selection, command and save protections, actual mobile session reset.
- Modify `src/features/shift-workflows/useShiftWorkflowDraft.ts`: compatibility wrapper and existing public type exports; existing callers continue receiving non-null evidence and impact.
- Create `src/features/shift-workflows/useDeferredShiftWorkflowDraft.test.tsx`: pending evidence, retained provisional selection, freeze, reset and save guards.
- Create `src/features/shift-workflows/MobileEventShiftWorkflowSelection.tsx`: role-scoped mobile owner, immediate opening, guarded initial read/retry, draft controls and existing confirmation.
- Create `src/features/shift-workflows/MobileEventShiftWorkflowSelection.test.tsx`: owner lifecycle and pending-read integration with real draft behavior.
- Modify `src/views/EventsView.tsx` and `src/views/EventsView.test.tsx`: stable mobile overview, current cards, header, shared date picker, local selection timeline and state filters, restoration, no mobile calendar view.
- Modify the mobile cases in `src/views/EventsView.shift-workflows.test.tsx`: migrate replacement-gallery assumptions to the approved captured-entry query behavior; retain desktop, retirement and save-protection assertions.
- Modify `src/features/shift-workflows/useShiftWorkflowCardScroll.ts` and its tests only for explicit preservation of entry position; preserve desktop default anchoring.
- Modify `src/styles/mobile-events.css`: scoped mobile toolbar, search and floating footer; reuse the existing visual-viewport hook and safe-area geometry.
- Modify `src/features/shift-workflows/useShiftWorkflowVisualViewport.ts` and its tests only if native geometry requires a change; no speculative replacement.
- Create `docs/testing/2026-10-13-mobile-in-place-shift-selection-verification.md`: exact evidence, remaining limitations and simulator/phone outcomes.

## Commands and verification discipline

The environment has an existing Vite configuration `__dirname` issue. Use the already-established runner, never change tracked tooling to hide it. Focused baseline is 7 files and 137 tests, exit 0, recorded in `/private/tmp/crewflow-mobile-in-place-20261013-baseline-tests.txt`. Actual baseline TypeScript output is `/private/tmp/crewflow-mobile-in-place-20261013-baseline-types.txt`; compare complete diagnostics after normalizing only line/column positions. Existing failures are not a green type check.

Run focused tests with this actual command, adding new test paths for the task:

```sh
node --input-type=module -e 'globalThis.__dirname=process.cwd();process.argv=["node","vitest","run","src/views/EventsView.test.tsx","src/features/shift-workflows/useShiftWorkflowDraft.test.tsx","src/features/shift-workflows/EventShiftWorkflowManagement.test.tsx","src/features/shift-workflows/EventShiftWorkflowManagement.query.test.tsx","src/features/shift-workflows/EventShiftWorkflowCardSelection.test.tsx","src/features/shift-workflows/useShiftWorkflowCardScroll.test.tsx","src/features/shift-workflows/useShiftWorkflowVisualViewport.test.tsx","--maxWorkers=1","--configLoader=runner"];await import("./node_modules/vitest/vitest.mjs");'
```

Save RED, GREEN, lint, type and build logs under `/private/tmp/crewflow-mobile-in-place-20261013-`. Run CPU-heavy test suites serially. Never raise timeouts or remove behavior assertions to obtain a pass. Each implementation task gets a fresh worker, then spec review, then quality review; fixes return to that worker and are re-reviewed. The parent performs the final integrated verification and device refresh.

## Task 1 Shared draft with deferred opening evidence

**Files:** `useDeferredShiftWorkflowDraft.ts`, `useDeferredShiftWorkflowDraft.test.tsx`, `useShiftWorkflowDraft.ts`, `useShiftWorkflowDraft.test.tsx`.

- [x] Write failing hook tests before modifying production code. Copy the real fixture shape from `useShiftWorkflowDraft.test.tsx`; mock only asynchronous save/reload boundaries. Include this pending-read behavior:

```tsx
const props = { scope, workflowId: null, data: null as ShiftWorkflowManagementData | null,
  onSave: vi.fn(), onReload: vi.fn(), onClose: vi.fn() };
const { result, rerender } = renderHook(input => useDeferredShiftWorkflowDraft(input), { initialProps: props });
act(() => result.current.changeSelection([id(21), id(22)]));
expect(result.current.eventIds).toEqual([id(21), id(22)]);
expect(result.current.data).toBeNull();
await act(async () => result.current.save());
expect(props.onSave).not.toHaveBeenCalled();
rerender({ ...props, data: makeData() });
expect(result.current.data?.snapshot.revision).toBe(4);
expect(result.current.eventIds).toEqual([id(21), id(22)]);
```

The fixtures `id`, `scope` and `makeData` are defined in the existing hook test and must be copied into the new test, with its imports; do not export test helpers from production. Add separate cases for direct `send` while data is null, a missing selected event after the first read, later prop publication, reset followed by a new opening, retirement, and the existing exact ambiguous request behavior.

- [x] Run both hook test files and confirm new behavior fails for the expected missing API or evidence gate. Preserve the RED log.
- [x] Extract the shared existing implementation into the deferred hook. Keep the established input type for existing callers. Define the nullable input and readiness guard explicitly:

```ts
export interface DeferredShiftWorkflowDraftInput extends Omit<ShiftWorkflowDraftInput, 'data'> {
  data: ShiftWorkflowManagementData | null;
}
const impact = data ? getWorkflowSelectionImpact(data, props.scope, props.workflowId, eventIds) : null;
const ready = Boolean(data && impact);
// Both save and direct send must return without dispatch while evidence is absent.
if (!data || !impact) return;
```

Initialize creation IDs to an empty array when evidence is absent. On the first complete `props.data`, atomically capture a structured clone and display metadata without changing selected IDs. Ignore all subsequent ordinary prop publication. Explicit conflict refresh retains IDs and resets confirmations exactly as before. Do not create an empty authoritative snapshot to stand in for missing data.

The mobile owner's actual close/new-open lifecycle needs a `reset()` operation. It retires the current activation, clears captured evidence and all draft IDs, confirmations, errors, pending commands and in-flight references, and creates a fresh activation. Only the owner's protected close or acknowledged-success callback calls it. A reset must not allow the old request's completion or `finally` to alter the new activation. After reset, ignore every non-null props publication until the owner has actually rendered `data: null`; only then may a new complete props read be captured. An explicit `reload()` may capture its own complete fresh read without this props boundary. Test stale-object and new-object publication before the null boundary. Add real production use in Task 2; this is not a test-only API.

A display-metadata error during deferred first capture leaves evidence null and readiness false, exposes a safe error and preserves selected IDs. Do not throw from the layout effect, partially publish data, or reattempt the same failed object every render. A new read can retry capture atomically; test failure followed by a fresh successful input.

Preserve the compatibility wrapper's non-null public return type:

```ts
export function useShiftWorkflowDraft(props: ShiftWorkflowDraftInput) {
  const deferred = useDeferredShiftWorkflowDraft(props);
  const { reset, ...draft } = deferred;
  void reset;
  return { ...draft, data: deferred.data!, impact: deferred.impact! };
}
export type ShiftWorkflowDraft = ReturnType<typeof useShiftWorkflowDraft>;
```

Keep old type exports available from their current module. Share all command and retry logic, rather than maintaining a second copy. Existing synchronous inputs must capture on initial render and never briefly return null through the wrapper. Preserve save locks, ambiguous request identity, conflict refresh, display-only assignment distinction and retired callbacks.

- [x] Run the new hook tests plus all existing workflow draft, card-selection and management tests. Require exit 0, changed-file lint exit 0, diff-check exit 0, and no new actual TypeScript diagnostics against baseline.
- [x] Self-review, commit only this task's files, and report exact SHA, files, RED/GREEN evidence, and any concerns. Parent completes spec and quality review before Task 2.

Task 1 independently approved by both fresh reviewers at `5ca65c3dc952e5cfeae0afa1320880a5f04beec7`: 45 hook tests, 153 focused regressions, changed-file lint and diff check pass; actual TypeScript retains the same 111 baseline diagnostics.

## Task 2 Mobile owner and selection in the stable event overview

**Files:** new mobile owner and tests, `EventsView.tsx`, `EventsView.test.tsx`, mobile cases in `EventsView.shift-workflows.test.tsx`, scroll hook/test if needed, mobile CSS, visual-viewport hook/test only if needed.

The parent approved this additional test-only file after reading its existing mixed desktop/mobile gallery tests. The mobile cases must now preserve the initial page query, then explicitly clear inline search before selecting a hidden card and wait for actual evidence readiness. Desktop cases and all protection assertions remain intact; no additional production scope is introduced.

- [x] Write integration regressions before production changes. Update the existing mobile management expectation so every mobile role lacks Seznam and Kalendář; keep desktop calendar tests. Add CH and COO cases that choose 12 May, capture the actual card DOM nodes, activate linking, and assert the same nodes/date remain. Use real EventListCard and actual draft logic; mock network/gateway boundaries, not the behavior under test.

Use this acceptance assertion pattern in the existing EventsView fixture setup, retaining its mocked provider/service setup:

```tsx
const dateButton = screen.getByRole('button', { name: 'Vybrat datum akci' });
fireEvent.click(dateButton);
fireEvent.click(screen.getByRole('button', { name: 'Zobrazit akce od 12. května 2026' }));
const before = [...document.querySelectorAll('[data-workflow-occurrence]')];
fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
expect(screen.getByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' })).toBeInTheDocument();
expect([...document.querySelectorAll('[data-workflow-occurrence]')]).toEqual(before);
expect(document.activeElement).not.toBe(screen.getByRole('searchbox'));
expect(screen.queryByText('Načítání propojení…')).not.toBeInTheDocument();
expect(screen.queryByLabelText('Přejít na datum')).not.toBeInTheDocument();
```

Choose May fixture events with stable real identities and local clock control. Check DOM identity with `toBe` per element as well as count, not merely equal labels. Include a held initial loader promise: mark two cards while it is pending, assert selected count 2 and disabled Continue; resolve the real fixture evidence, assert marks and node identities persist and Continue becomes available. Add rejection/retry, selected event removed or blocked, cancel before resolve, scope change and switching back, summary/back, and zero unintended saves.

- [x] Run these tests and confirm the existing replacement/today/reset/loading behavior fails. Preserve the RED log.
- [x] Create a role-scoped owner with the following concrete responsibility and state boundary:

```ts
export interface MobileEventShiftWorkflowSelectionState {
  active: boolean;
  draft: ReturnType<typeof useDeferredShiftWorkflowDraft>;
  readError: boolean;
  opening: boolean;
  open: () => void;
  retry: () => void;
  toggle: (id: string) => void;
  continueToSummary: () => void;
  close: () => void;
}
```

Use `useShiftWorkflows()` and key the scoped owner by its actual `scopeKey`; return the same overview with a null state for users who cannot manage. `open()` synchronously sets `active` before starting `loadEventShiftWorkflowManagementData(scope, reload, signal)`. The read has its own AbortController and request version per opening; close and context cleanup retire it. Clear prior opening data to null on close and before a new read, and actually render that null boundary before accepting another props capture after reset. The first complete result feeds the deferred hook without replacing its provisional selection. Do not add a preload cache or additional background network reads unless necessary; loading on open in parallel with selection already meets immediate UX.

Pending reads allow draft selection, but `continueToSummary()` checks actual evidence, at least two distinct IDs and the whole impact. After evidence arrives, use `getWorkflowSelectionImpact` for known blocked additions; removals remain allowed. A provisional invalid choice remains selected, with a visible reason and disabled Continue. Read error/retry remains visible without removing the overview. Saving uses the shared draft, existing confirmation, and `useShiftWorkflows.save`; no alternate mutation route. Keep the existing confirmation's cross-project/moves, conflict review and ambiguous retry UI. A render adapter with narrowed non-null data/impact can supply `ShiftWorkflowConfirmation` only when ready; never coerce pending data into a usable draft.

- [x] Keep the overview component type and keyed card DOM stable across normal, pending, ready and summary-back states. A small module-scope `EventsOverview` with a typed mobile-selection prop is allowed; do not declare React component types inside render functions. The mobile owner always renders that overview in the same child position. Capture presentation events from the normal event query at opening; incoming authoritative reads assess eligibility and summary data, not replacement of the visible cards.

Force mobile effective mode to list with this logic and hide the entire view-mode switch on mobile:

```ts
const canUseCalendarView = !isMobile;
const effectiveViewMode: EventsViewMode = isMobile ? 'list' : viewMode;
```

Use the existing mobile header pattern for managers too. Place an accessible Link2 icon button in its right slot; Crew retains its existing filter action. Keep the date picker on the left. Mark the selection button with `aria-pressed`, don't focus search automatically, and hide the normal create/copy/delete controls while selecting.

The overview captures its date, state filter, existing search and visible occurrence position before opening. Selection owns local view values initialized from them; do not write global setters while selecting. The existing date picker dispatches to the local selection date when active. Preserve the normal source of day occurrences so activation cannot add, remove or reorder visible cards, including legacy and schedule-v2 multiday cases.

- [x] Preserve older history, global name/job search and the selected status filter. Use the existing timeline helper and scroll capture/restore, with an explicit entry position option rather than the scroll hook's desktop default first-mount anchor. Preserve normal behavior for existing callers. Prepare older cards above the anchor only without changing its visible position; subsequent upward movement expands seven days. Keep empty-week reachability and stop at the oldest known date. Render no helper/history paragraph. Search remains local and clearing it restores the prior local time window/position. Summary/back restores the exact selection view; cancel/success restores normal entry preferences and position.

- [x] Use the existing EventListCard selection prop for stable IDs and reasons. Add stable occurrence markers to normal cards as needed, so before/after capture uses the same key. One event across multiple day cards counts once and marks all its copies. Keep click, Enter, Space and nested-action protections.
- [x] Add a compact search row below the status filters and the floating footer using current tokens and the existing viewport hook. Keep the real page-frame height unchanged. Scope all new styling to mobile selection. Use this footer positioning principle, preserving existing safe-area and navigation tokens rather than introducing a second guessed device-height model:

```css
.nodu-mobile-workflow-selection .nodu-workflow-selection__bar {
  position: fixed;
  bottom: max(calc(5.5rem + env(safe-area-inset-bottom)), calc(var(--nodu-workflow-viewport-inset, 0px) + 0.75rem));
}
```

This is the existing mobile bar formula in `mobile-events.css`, preserving proven navigation and keyboard clearance. Add content bottom clearance based on actual bar height. Preserve the 4eff3dd measured toolbar-space/fixed keyboard header mechanism; the header marker now covers the compact mobile header, filters and search. CSS/viewport listeners must not store pixel scroll positions in React state, replace cards or animate the whole overview again.

- [x] Run new owner/integration tests and all existing selection, management, scroll and viewport tests; changed-file lint, diff-check, build and actual TypeScript comparison. Self-review and commit only scoped task files, with no dirty historic documentation. Parent completes fresh spec then quality review; fix and re-review before proceeding.

Task 2 initially approved at `de11b561ccb6b8369c1c20910ed918cf935a035d`. Actual native QA then found entry toolbar clearance; `1e6750c` corrects it, and `3745f22cfc514ac2672b4d2ded29eb90a0b15123` prevents its delayed programmatic scroll event from expanding history. Fresh spec and quality reviews approve the final correction. Final focused evidence: 281 tests across 12 files, independent entry/search-scroll probes, 160 branch suites / 2007 tests, lint, build and diff check pass; actual TypeScript retains 111 baseline diagnostics. Corrected native entry, keyboard, real scrolling, last-card clearance and cancellation were observed on 14 October. Native eligible summary/back remains a separate acceptance check; the physical-phone installation subsequently succeeded at 13:41 as recorded in Task 3.

## Task 3 Parent integration and actual device verification

**Files:** new 13 October verification report; this plan's checkboxes only after the corresponding gate is truly passed.

- [x] Request final code review of the entire app delta against the approved specification. Re-run the complete test suite serially on integrated clean main; then build, lint changed source, diff-check and compare complete actual TypeScript baseline diagnostics. Record exact SHA and exit statuses. Do not claim global type checking passes when existing diagnostics remain.
- [x] Preserve ignored `.env.local` and its existing Apple team. Fetch origin, check for new changes, integrate reviewed commits into the dedicated clean main checkout, reverify merged code and synchronize local main and origin/main. No force-push, reset, stash, or dirty original checkout changes.
- [x] Run the required refresh with unchanged preflight checks:

```sh
NODE_OPTIONS='--import=file:///private/tmp/crewflow-card-selection-vite-runner-preload-20261012.mjs' IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-card-selection-ios-20261012 npm run ios:refresh:devices
```

Record simulator and physical-phone outcomes separately. For an available phone, any signing/install/launch failure blocks completion; an unavailable phone is waiting, not updated. This refresh is development-only, not an App Store or production release.

- [ ] On the freshly refreshed simulator, visually verify CH/COO mobile header, no calendar-view switch, date picker, entry on a chosen past date, stable cards and scroll, immediate selection, search, keyboard and accessory bar, a real finger drag, summary/back/cancel, bottom clearance and unchanged screen height. Avoid test workflow saves to Staff. Use isolated local data for writable integration scenarios. Do not confuse installation on the physical phone with direct visual verification there.
- [x] Create the 13 October verification report with actual evidence and only observed claims. Confirm original dirty files and historic dirty documentation hashes are unchanged. Include any genuine remaining limitation in the handoff, plus concise test instructions for the user.
- [x] Self-review documentation, commit only the new report and this plan's verified progress, integrate documentation into main and synchronize it. A docs-only commit does not imply the phone contains a rebuilt app for that SHA; identify the actual installed source SHA separately. Do not delete or archive the existing shared worktree.

Parent evidence on 14 October: synchronized main `fc3047a847d939e21249e129723d9775f66d26df`, fresh 163 suites / 2076 tests, lint of all 37 combined changed TypeScript files, build and diff checks pass. Actual TypeScript exits 2 with a full coordinate-only match to all 111 updated-origin diagnostics. Final integration review is approved. The required refresh installs and launches the simulator, then fails to resolve the unavailable phone destination; the phone is waiting, not updated. Native CH/COO/Crew headers, May 12 entry, real software keyboard and drag, last-card clearance and exact cancellation pass. The native checkbox remains open specifically for eligible summary/back: sampled Staff history is approval-locked, and no test business writes are authorized. See the dated verification report for separate observations and limits.

Documentation commit `089829f` was integrated and synchronized while preserving newer origin `21c03d9` compact Projects changes. Final combined source `76b94bc030cbe1b3164377d9acd9c8a943e4d380` then passed fresh 163 suites / 2077 tests, 37-file lint, build and diff checks; the actual 111 TypeScript diagnostics still match completely after coordinate normalization. Its mandatory refresh again installs/launches the simulator, with the physical phone unavailable. The mobile-selection files are unchanged from detailed `fc3047a` QA, and native May 12 entry was rechecked on installed `76b94bc`. Later documentation-only progress does not change that installed source identity.

After the user confirmed the phone connected and unlocked, the 13:41 refresh from clean synchronized `0a0dcae13c80f48557dd03b8d9197d8944e06d0b` exited 0: simulator updated; iPhone 13 mini build/sign/install/launch succeeded and phone updated. A fresh non-documentation diff confirms application source still matches verified `76b94bc`. Both devices now contain installed source `0a0dcae`; the detailed simulator QA remains distinct from phone installation. Only native eligible summary/back remains unobserved; no Staff test business writes were performed.

## Plan self review

The two app tasks cover pending evidence and immutable saves, same cards/date/filter/scroll, all-mobile list-only navigation, scoped role/owner retirement, history/search/multiday behavior, summary/back and footer/keyboard geometry. Task 3 covers independent final review, actual complete-source verification, native proof and both required development installations. The deferred nullable API is isolated behind the existing non-null wrapper, so desktop and detail callers keep their contracts. The user has already chosen separate implementation with independent reviews; no repeat execution-choice question is needed.

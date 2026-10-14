# Mobile toolbar parity correction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening mobile shift selection preserves the ordinary Akce header, date button and state-filter appearance and position; only search and card marking appear, with the existing floating bottom bar.

**Architecture:** Correct the presentation deviation from the approved 13 October design and the user's explicit 14 October feedback. Keep the stable EventsOverview and existing deferred owner. Preserve metadata markers for measured keyboard clearance without applying the legacy sticky toolbar class or a selection-specific panel to the normal mobile header. The existing keyboard-only header protection and floating footer remain scoped to actual keyboard occlusion.

**Tech Stack:** React, TypeScript, existing mobile CSS, Vitest and Testing Library, Capacitor iOS.

## Scope and diagnosis

The current mobile overview assigns `nodu-workflow-selection__toolbar-space` only after selection opens; this enables sticky positioning with a safe-area top offset that ordinary Akce does not have. It also adds `nodu-mobile-workflow-selection__toolbar`, introducing panel background, border and padding. The ordinary mobile page already owns safe-area padding. The previous native captures show normal title/buttons around y94 and selected title/buttons around y150. Preserving card identity alone did not verify header parity.

This is a correction to the already approved same-overview design, not a new billing or approval design. Do not alter workflow membership guards, hours, invoices, billing groups, role switching, data scope, database schema, dependencies or tooling. The separate invoice-selection path already selects approved, uninvoiced reports for one contractor and one invoice customer across events/jobnumbers; it does not require modifying shared approval membership.

Reuse `/Users/peetax/Projekty/crewflow/.worktrees/shared-crew-workflow`. Preserve its four historical dirty 12 October documents byte-for-byte, and preserve the original checkout's Info.plist and TimelogsView files. Parent integration/refresh uses only the existing clean `/Users/peetax/Projekty/crewflow-card-selection-rollout-20261012`. Retain the ignored environment and signing team. The user previously chose separate implementation with independent controls; do not ask that execution choice again.

## Task 1 Preserve ordinary mobile toolbar presentation

**Files:** Modify `src/views/EventsView.tsx`, `src/views/EventsView.test.tsx`, `src/styles/mobile-events.css`. Existing viewport tests may receive a mobile-marker regression only if needed; no production viewport/scroll-hook changes without escalating a concrete requirement to the parent.

- [ ] Add a regression inside the existing real mobile-overview test fixture for CH and COO. Reuse its `setup`, `cards`, `sameCards`, `workflowBoundary`, `held` and `workflowEvents` helpers and existing boundary mocks. Preserve the actual overview/card/draft implementation.

```tsx
it.each(['crewhead', 'coo'])('keeps ordinary toolbar presentation while selecting as %s', async role => {
  const read = held<typeof workflowEvents>();
  workflowBoundary.events.mockReturnValue(read.promise);
  await setup(role);
  const title = screen.getByRole('heading', { name: 'Akce' });
  const toolbar = title.closest<HTMLElement>('.nodu-mobile-events-toolbar')!;
  const space = toolbar.parentElement!;
  const normalToolbarClass = toolbar.className;
  const normalSpaceClass = space.className;
  const before = cards();
  fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
  expect(screen.getByRole('heading', { name: 'Akce' })).toBe(title);
  expect(title.closest('.nodu-mobile-events-toolbar')).toBe(toolbar);
  expect(toolbar.className).toBe(normalToolbarClass);
  expect(space.className).toBe(normalSpaceClass);
  expect(toolbar).toHaveAttribute('data-workflow-toolbar');
  expect(space).toHaveAttribute('data-workflow-toolbar-space');
  expect(toolbar).not.toHaveClass('nodu-mobile-workflow-selection__toolbar');
  expect(space).not.toHaveClass('nodu-workflow-selection__toolbar-space');
  const search = screen.getByRole('searchbox', { name: 'Hledat směnu nebo jobnumber' });
  expect(search).not.toHaveFocus();
  expect(screen.getByRole('button', { name: 'Vse' }).compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  sameCards(before);
  await act(async () => read.resolve(workflowEvents));
  await waitFor(() => expect(workflowBoundary.events).toHaveBeenCalledOnce());
  expect(toolbar.className).toBe(normalToolbarClass);
  expect(space.className).toBe(normalSpaceClass);
  sameCards(before);
  fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));
  expect(toolbar.className).toBe(normalToolbarClass);
  expect(space.className).toBe(normalSpaceClass);
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(workflowBoundary.save).not.toHaveBeenCalled();
});
```

- [ ] Run the regression before implementation using the established runner, and retain expected RED class mismatch. Do not fake geometry to make an appearance test pass. DOM/style contract tests must be complemented by actual parent native screenshots.

```sh
node --input-type=module -e 'globalThis.__dirname=process.cwd();process.argv=["node","vitest","run","src/views/EventsView.test.tsx","--maxWorkers=1","--configLoader=runner"];await import("./node_modules/vitest/vitest.mjs");'
```

- [ ] Make the mobile overview keep its normal toolbar and wrapper classes while retaining active measurement attributes. The ordinary mobile wrapper is not sticky. Keep desktop/legacy selection unchanged:

```tsx
<div data-workflow-toolbar-space={selectionActive ? '' : undefined}
  className={selectionActive && !isMobileEventFeed ? 'nodu-workflow-selection__toolbar-space' : undefined}>
<div data-workflow-toolbar={selectionActive ? '' : undefined}
  className={isMobileEventFeed ? 'nodu-mobile-events-toolbar' : 'mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-start'}>
```

Remove the unused normal mobile-selection toolbar panel block. Replace its keyboard-only class selector with the existing measurement markers, preserving actual occlusion handling inside the mobile media block:

```css
.nodu-mobile-workflow-selection[data-workflow-keyboard-header] [data-workflow-toolbar-space] {
  height: var(--nodu-workflow-toolbar-height);
}
.nodu-mobile-workflow-selection[data-workflow-keyboard-header] [data-workflow-toolbar] {
  position: fixed;
  top: calc(env(safe-area-inset-top) + var(--nodu-workflow-viewport-top, 0px));
  left: var(--nodu-workflow-toolbar-left);
  width: var(--nodu-workflow-toolbar-width);
  box-sizing: border-box;
  background: rgb(var(--nodu-paper-rgb) / 0.98);
}
```

Do not change search ordering, footer formula, card keys, capture/restore semantics, pending evidence, history/search, summary/back, cancellation, save guards or lifecycle ownership. Do not introduce pixel positions into React state or remount the overview.

- [ ] Run EventsView, scroll, viewport, owner, management and workflow selection regressions serially; changed-file lint, diff-check, production build and full-output TypeScript comparison with the fresh task baseline. Baseline targeted run: 3 files / 101 tests, exit 0; baseline TypeScript is an actual failing check and must not be called green. Logs use `/private/tmp/crewflow-mobile-header-parity-20261014-`. Use the existing temporary Vite runner/preload, never tracked tooling fixes.
- [ ] Self-review and commit only scoped source/test files. Return exact SHA, RED/GREEN evidence, lint/type/build statuses and concerns. Parent obtains independent spec review, then quality review; all important fixes are re-reviewed.

## Task 2 Parent verification and development delivery

- [ ] Independently inspect the complete delta and run complete tests on merged clean main, lint/build/diff checks and actual diagnostic comparison. Fetch/inspect/preserve upstream changes and synchronize main non-destructively.
- [ ] Run the unchanged mandatory `npm run ios:refresh:devices` with the existing temporary preload and derived-data root. Report simulator and phone build/install/launch outcomes separately. An available-device failure blocks delivery; an unavailable phone is waiting. This is development only.
- [ ] On the actual corrected simulator, compare normal and selected date button/title/filter coordinates at the same date and scroll position, including a chosen past date. Header appearance/position must match; only search/cards/footer change. Check keyboard and accessory clearance, real scrolling, cancellation and fixed screen height. Do not save test business records to Staff.
- [ ] Update plan progress and the existing 13 October verification report with exact source identities, observations and genuine remaining limitations. Confirm protected hashes and ignored configuration remain unchanged, commit only new/current task documents, and synchronize documentation without implying a docs-only native rebuild.

## Independent review correction before integration

The fresh quality review of `d8f2ed4..af25c4b` identified two concrete consequences of removing the sticky mobile wrapper. Removing its `z-index: 12` leaves the keyboard-only fixed toolbar below later relatively positioned cards. Also, entry still uses `clearToolbar` occurrence restoration: with inline search height S and the normal toolbar/card gap g > 12, it adds positive scroll `min(S, g - 12)`, moving the now-flowing header upward. The old native-entry fixture holds toolbar position constant rather than modeling flow. Both must be corrected before merge, not hidden by passing class tests.

- [ ] Add expected RED regressions for keyboard-only z-index and mobile entry at scroll positions 0 and 137 with realistic flowing-toolbar geometry. Model the toolbar and cards moving with the frame's scrollTop; search increases their flow height. Assert unchanged heading/date/filter positions and raw entry scroll, same cards/date, card clearance, and cancellation restoration. Keep non-entry scroll/history/search protections intact; label simulated geometry honestly, and retain actual native screenshots as the final gate.
- [ ] Add `z-index: 12` only to the keyboard-occlusion mobile toolbar rule. For initial mobile selection entry only, restore the captured raw `frame.scrollTop` instead of legacy `clearToolbar` occurrence alignment. Preserve the latter for non-mobile/legacy paths and keep all later capture/restore bookkeeping, search/history, summary/back and cancellation logic unchanged. This authorizes a bounded entry correction in EventsView and its geometry regression; no production scroll or viewport hook rewrite is needed.
- [ ] Verify the complete focused suite, changed-source lint, build and full ordered checked-config TypeScript diagnostic comparison. Obtain spec recheck followed by quality recheck before integration.

## Plan self review

The correction removes activation-only mobile presentation while keeping measurement metadata, keyboard protection, footer geometry and immutable draft behavior. Existing desktop/calendar/editor contracts and approval/invoice locks are untouched. Native coordinate parity is an explicit final gate, not inferred from passing DOM tests or retained card identity. All previously dirty files remain outside staging.

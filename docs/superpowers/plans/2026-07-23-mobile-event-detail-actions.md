# Mobile Event Detail Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved mobile Crew event detail with an info-first layout, hidden global mobile nav while viewing an event detail, a floating `Evidence prace` action panel, and a confirmation modal before withdrawal requests.

**Architecture:** Keep the mobile Crew implementation inside the existing React app and reuse existing event/timelog workflow functions. `AppLayout` decides whether the global `MobileCrewNav` is visible. `EventDetailView` owns the mobile event-detail layout, floating action panel, and local withdrawal confirmation state.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind utility classes, existing `src/index.css` custom classes.

---

### Task 1: Hide Global Mobile Nav In Event Detail

**Files:**
- Modify: `src/components/layout/AppLayout.test.tsx`
- Modify: `src/components/layout/AppLayout.tsx`

- [x] **Step 1: Write the failing test**

Add this test to `src/components/layout/AppLayout.test.tsx` after the existing mobile Crew shell test:

```tsx
it('hides the mobile Crew nav while a Crew event detail is open', () => {
  mockAppContext = {
    ...mockAppContext,
    currentTab: 'events',
    role: 'crew',
    selectedEventId: 'event-uuid-1',
  };
  mockIsMobile = true;

  render(<AppLayout />);

  expect(screen.queryByTestId('mobile-crew-nav')).not.toBeInTheDocument();
  expect(screen.getByTestId('events-view')).toBeInTheDocument();
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/layout/AppLayout.test.tsx --reporter verbose`

Expected: FAIL because `mobile-crew-nav` still renders when `currentTab === 'events'` and `selectedEventId` is set.

- [x] **Step 3: Implement the minimal layout condition**

In `src/components/layout/AppLayout.tsx`, derive whether an event detail is open and suppress only the mobile nav:

```tsx
const isMobileCrewShell = isMobile && role === 'crew';
const isMobileCrewEventDetail = isMobileCrewShell && currentTab === 'events' && Boolean(selectedEventId);
```

Render:

```tsx
{isMobileCrewShell && !isMobileCrewEventDetail && <MobileCrewNav badgeCounts={badgeCounts} />}
```

The sidebar should remain hidden for the mobile Crew shell.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/layout/AppLayout.test.tsx --reporter verbose`

Expected: PASS for all AppLayout tests.

### Task 2: Add Mobile Event Detail Behavior Tests

**Files:**
- Modify: `src/views/EventDetailView.test.tsx`
- Modify: `src/views/EventDetailView.tsx`

- [x] **Step 1: Write failing tests for the approved mobile detail**

In `src/views/EventDetailView.test.tsx`, add tests that verify:

```tsx
expect(container.querySelector('.nodu-mobile-event-detail')).toBeInTheDocument();
expect(screen.queryByText('Moje výkazy')).not.toBeInTheDocument();
expect(screen.getByText('Přiřazená crew')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Evidence práce' })).toBeInTheDocument();
```

Add a second test:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Požádat o odhlášení' }));
expect(screen.getByRole('dialog', { name: 'Opravdu požádat o odhlášení?' })).toBeInTheDocument();
expect(requestEventWithdrawal).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole('button', { name: 'Zůstat na akci' }));
expect(requestEventWithdrawal).not.toHaveBeenCalled();
```

Add a third test:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Požádat o odhlášení' }));
fireEvent.click(screen.getByRole('button', { name: 'Požádat' }));
await waitFor(() => expect(requestEventWithdrawal).toHaveBeenCalledWith(1, 'profile-1'));
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/views/EventDetailView.test.tsx --reporter verbose`

Expected: FAIL because the current mobile detail still shows old workflow cards/actions and directly calls withdrawal.

- [x] **Step 3: Implement mobile detail state and layout**

In `src/views/EventDetailView.tsx`:

- add local state `const [showWithdrawalConfirm, setShowWithdrawalConfirm] = useState(false);`
- change assigned Crew mobile withdrawal action to open the modal instead of calling `handleRequestWithdrawal`,
- render only info-first sections and a floating action panel in the mobile Crew branch,
- keep `openCrewTimelog(currentContractor, myTimelogs[0])` or `openCrewTimelog(currentContractor)` behind `Evidence prace`,
- show only assigned crew in the mobile Crew detail,
- remove `Moje výkazy`, `Moje účtenky`, and metrics cards from the mobile event-detail body.

- [x] **Step 4: Run the event detail tests**

Run: `npm test -- src/views/EventDetailView.test.tsx --reporter verbose`

Expected: PASS for all EventDetailView tests.

### Task 3: Style The Approved Mobile Detail

**Files:**
- Modify: `src/index.css`
- Test: `src/index.css.test.ts`

- [x] **Step 1: Write or extend CSS assertions**

In `src/index.css.test.ts`, assert that the CSS contains:

```ts
expect(css).toContain('.nodu-mobile-event-floating-panel');
expect(css).toContain('backdrop-filter: blur');
expect(css).toContain('.nodu-mobile-event-withdrawal-dialog');
expect(css).toContain('padding-bottom');
```

- [x] **Step 2: Run the CSS test to verify it fails**

Run: `npm test -- src/index.css.test.ts --reporter verbose`

Expected: FAIL until the new class names exist.

- [x] **Step 3: Implement CSS**

Update the existing `.nodu-mobile-event-*` styles in `src/index.css` to support:

- info-first mobile event detail spacing,
- map/location block,
- assigned crew rows,
- fixed/floating bottom action panel,
- safe bottom padding,
- withdrawal confirmation dialog styles.

- [x] **Step 4: Run the CSS test**

Run: `npm test -- src/index.css.test.ts --reporter verbose`

Expected: PASS.

### Task 4: Verify And Commit

**Files:**
- Verify: changed files only

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/components/layout/AppLayout.test.tsx src/views/EventDetailView.test.tsx src/index.css.test.ts --reporter verbose
```

Expected: PASS.

- [x] **Step 2: Run build**

Run: `npm run build`

Expected: exit 0. Existing bundle-size or Browserslist warnings are acceptable if unchanged.

- [x] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit 0. Existing warnings are acceptable if unchanged and no new errors are introduced.

- [x] **Step 4: Inspect diff**

Run: `git diff -- src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/index.css src/index.css.test.ts docs/superpowers/plans/2026-07-23-mobile-event-detail-actions.md`

Expected: only planned mobile detail, tests, styles, and plan changes.

- [x] **Step 5: Commit**

Run:

```bash
git add src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/index.css src/index.css.test.ts docs/superpowers/plans/2026-07-23-mobile-event-detail-actions.md
git commit -m "feat: refine mobile event detail actions"
```

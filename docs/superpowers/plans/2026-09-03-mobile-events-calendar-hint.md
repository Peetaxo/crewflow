# Mobile Events Calendar Hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the approved calendar guidance in the empty mobile crew event list without changing filtering.

**Architecture:** Change only the helper-text conditional in the existing `EventsView` empty state. Keep all current filters, date selection, layout, headline, and other-role/desktop copy untouched.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Vite, Capacitor iOS.

---

## Task 1: Regression test and copy change

**Files:**
- Modify: `src/views/EventsView.tsx`
- Test: `src/views/EventsView.test.tsx`

- [x] Run baseline: `npm test -- src/views/EventsView.test.tsx` (25 passing).
- [x] Add the following test inside the existing `describe('EventsView')`, reusing existing mocks and fixtures:

```tsx
it.each([
  { isMobile: true, role: 'crew' },
  { isMobile: true, role: 'crewhead' },
  { isMobile: true, role: 'coo' },
  { isMobile: false, role: 'crew' },
  { isMobile: false, role: 'crewhead' },
  { isMobile: false, role: 'coo' },
] as const)('shows calendar guidance only for mobile crew ($isMobile, $role)', async ({ isMobile, role }) => {
  mobileMockState.isMobile = isMobile;
  vi.doMock('../context/useAppContext', () => ({
    useAppContext: () => ({ ...mockAppContext, role }),
  }));
  vi.doMock('../features/events/queries/useEventsQuery', () => ({
    useEventsQuery: () => ({ data: [], isLoading: false, error: null }),
  }));
  vi.doMock('../features/events/services/events.service', () => ({
    createEmptyEvent: vi.fn(),
    createEventCopy: vi.fn((eventToCopy) => eventToCopy),
    applyForEvent: vi.fn(),
    requestEventWithdrawal: vi.fn(),
    withdrawEventApplication: vi.fn(),
    filterEventsByStatus: () => [],
    getEventsWithDerivedStatus: () => [],
    getReferenceDate: () => new Date('2026-04-20'),
    getEventDetailData: () => eventDetail,
  }));
  vi.doMock('./EventDetailView', () => ({ default: () => <div>detail</div> }));
  vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
  vi.doMock('../components/modals/AssignCrewModal', () => ({ default: () => null }));
  const { default: EventsView } = await import('./EventsView');
  render(<QueryClientProvider client={new QueryClient()}><EventsView /></QueryClientProvider>);
  const hint = 'Chceš zobrazit i starší akce? Klepni na ikonu kalendáře vlevo nahoře a vyber datum, od kterého je chceš vidět.';
  if (isMobile && role === 'crew') {
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.getByText('Od zvoleného data tu zatím nejsou žádné akce.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filtrovat akce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Moje akce' }));
    expect(screen.getByText(hint)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vybrat datum akci' }));
    expect(document.querySelector('.nodu-mobile-events-date-panel')).not.toBeNull();
  } else {
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(screen.getByText(isMobile
      ? 'Nove moznosti se tu objevi automaticky.'
      : 'Zkuste prepnout filtr nebo vytvorit novou akci.')).toBeInTheDocument();
  }
});
```

- [x] Run `npm test -- src/views/EventsView.test.tsx`; the mobile crew case must fail because the new hint is missing, with other cases passing.
- [x] Replace the helper text expression, preserving its surrounding element:

```tsx
{isMobileCrewEventFeed
  ? 'Chceš zobrazit i starší akce? Klepni na ikonu kalendáře vlevo nahoře a vyber datum, od kterého je chceš vidět.'
  : isMobileEventFeed
    ? 'Nove moznosti se tu objevi automaticky.'
    : 'Zkuste prepnout filtr nebo vytvorit novou akci.'}
```

- [x] Run `npm test -- src/views/EventsView.test.tsx` (31 passing), `npm run build`, and `git diff --check`.
- [x] Review only the scoped changes; commit the two source/test files as `fix: guide mobile crew to event date picker`.

## Task 2: Review, integration, and device refresh

- [ ] Controller performs independent spec and code-quality reviews, verifies the final diff, and runs relevant tests/build on the integrated result. No filter logic or calendar control changes are allowed.
- [ ] Inspect a mobile-width rendering of the new empty state, checking wrapping and no overflow. Prefer the existing running iOS simulator for final proof.
- [ ] Fetch `origin`, integrate latest `origin/main` into the feature branch, verify, and fast-forward remote `main` without force. Synchronize local `main` without disturbing unrelated local changes.
- [ ] Prepare a clean checkout of that synchronized main revision, preserve the ignored `.env.local` without printing its contents, and run `npm run ios:refresh:devices` with preflight checks intact.
- [ ] Report simulator and physical iPhone installation/launch outcomes separately. An unavailable phone is waiting for installation; a failure on an available device is blocking. This is not a production deployment.

## Verification evidence before integration

- Implementation commit: `a496415`.
- Test-first cycle: new mobile crew case failed while the other 30 cases passed; after the copy edit all 31 event-view tests passed.
- Integrated latest `origin/main` (`b5857b1`) in the isolated feature worktree.
- Full suite: 95 files, 899 tests passed. The initial run needed the existing MapLibre dependency linked into the worktree because its version test reads a physical path under `process.cwd()`; no source fix was necessary.
- Production build succeeded; existing dependency-age, large-chunk and dynamic-import warnings remain unchanged.
- ESLint on the two changed source/test files and `git diff --check` passed.
- Independent specification review confirmed exact approved copy and no filtering, ordering, layout or control changes.
- Device refresh outcomes will be reported after the synchronized-main preflight and installation run.

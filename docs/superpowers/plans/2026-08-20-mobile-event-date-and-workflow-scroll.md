# Mobile Event Date and Workflow Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default every mobile role's Events list to today while preserving relevant ongoing work, and constrain the mobile Crew Workflow card list to a discoverable internal scroll area.

**Architecture:** Keep date selection as view-local mobile state in `EventsView` and apply one role-aware visibility predicate before participation/status filtering. Reuse the existing calendar picker for all mobile roles without altering desktop month navigation. Bound only the mobile My Shifts card grid through responsive CSS, leaving data and desktop layouts unchanged.

**Tech Stack:** React, TypeScript, date-fns, Vitest, Testing Library, CSS, Vite, Capacitor iOS

---

### Task 1: Add the role-aware mobile date boundary

**Files:**
- Modify: `src/views/EventsView.test.tsx`
- Modify: `src/views/EventsView.tsx:276-620`

- [ ] **Step 1: Rewrite the existing mobile Crew visibility regression around today's boundary**

In `src/views/EventsView.test.tsx`, update `keeps occupied mobile Crew events visible by default and filters by participation` so its fake clock stays on `2026-08-11`, then add these fixtures to `mobileCrewEvents`:

```tsx
{
  id: 106,
  supabaseId: 'event-ongoing-unrelated',
  name: 'Probihajici cizi akce',
  job: 'ONGOING001',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'full' as const,
  client: 'Klient F',
},
{
  id: 107,
  supabaseId: 'event-ongoing-assigned',
  name: 'Probihajici moje akce',
  job: 'ONGOING002',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'full' as const,
  client: 'Klient G',
},
{
  id: 108,
  supabaseId: 'event-ongoing-pending',
  name: 'Probihajici cekajici akce',
  job: 'ONGOING003',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 2,
  filled: 1,
  status: 'upcoming' as const,
  client: 'Klient H',
},
```

Extend the mocked event detail membership:

```tsx
applications: eventId === 'event-pending' || eventId === 'event-ongoing-pending'
  ? [{
      id: eventId === 'event-pending' ? 201 : 202,
      eventId: eventId === 'event-pending' ? 104 : 108,
      eventSupabaseId: String(eventId),
      contractorProfileId: 'profile-current',
      status: 'pending' as const,
    }]
  : [],
crewAssignments: eventId === 'event-assigned' || eventId === 'event-ongoing-assigned'
  ? [{
      eventId: eventId === 'event-assigned' ? 103 : 107,
      eventSupabaseId: String(eventId),
      contractorProfileId: 'profile-current',
      name: 'Petr Heitzer',
    }]
  : [],
```

Replace the old assertion that `Stara akce` is visible with:

```tsx
expect(screen.queryByText('Stara akce')).not.toBeInTheDocument();
expect(screen.queryByText('Probihajici cizi akce')).not.toBeInTheDocument();
expect(screen.getByText('Probihajici moje akce')).toBeInTheDocument();
expect(screen.getByText('Probihajici cekajici akce')).toBeInTheDocument();
```

- [ ] **Step 2: Add a mobile manager overlap regression**

Add a parameterized test after the Crew visibility test:

```tsx
it.each(['crewhead', 'coo'] as const)(
  'keeps active overlapping events visible from today for mobile %s',
  async (role) => {
    mobileMockState.isMobile = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-11T12:00:00'));

    const managerEvents = [
      { ...events[0], id: 301, supabaseId: 'past-event', name: 'Skoncena akce', startDate: '2026-08-08', endDate: '2026-08-09' },
      { ...events[0], id: 302, supabaseId: 'active-event', name: 'Probihajici akce', startDate: '2026-08-10', endDate: '2026-08-12' },
      { ...events[0], id: 303, supabaseId: 'future-event', name: 'Budouci akce', startDate: '2026-08-15', endDate: '2026-08-15' },
    ];

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({ ...mockAppContext, role, eventsCalendarDate: '2026-08-11' }),
    }));
    vi.doMock('../features/events/queries/useEventsQuery', () => ({
      useEventsQuery: () => ({ data: managerEvents, isLoading: false, error: null }),
    }));
    vi.doMock('../features/events/services/events.service', () => ({
      createEmptyEvent: vi.fn(() => managerEvents[2]),
      createEventCopy: vi.fn((eventToCopy) => eventToCopy),
      applyForEvent: vi.fn(),
      requestEventWithdrawal: vi.fn(),
      withdrawEventApplication: vi.fn(),
      filterEventsByStatus: (items: typeof managerEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getEventsWithDerivedStatus: (items: typeof managerEvents) => items.map((item) => ({ ...item, derivedStatus: 'upcoming' as const })),
      getReferenceDate: () => new Date('2026-08-11'),
      getEventDetailData: (eventId: string | number) => ({
        ...eventDetail,
        event: managerEvents.find((event) => event.supabaseId === eventId || event.id === eventId) ?? managerEvents[0],
        timelogs: [],
        applications: [],
        crewAssignments: [],
      }),
    }));
    vi.doMock('./EventDetailView', () => ({ default: () => <div>detail</div> }));
    vi.doMock('../components/modals/EventEditModal', () => ({ default: () => null }));
    vi.doMock('../components/modals/AssignCrewModal', () => ({ default: () => null }));

    const { default: EventsView } = await import('./EventsView');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EventsView />
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Skoncena akce')).not.toBeInTheDocument();
    expect(screen.getByText('Probihajici akce')).toBeInTheDocument();
    expect(screen.getByText('Budouci akce')).toBeInTheDocument();
  },
);
```

- [ ] **Step 3: Run the boundary tests and verify RED**

Run:

```bash
npm test -- src/views/EventsView.test.tsx -t "keeps occupied mobile Crew|keeps active overlapping events"
```

Expected: Crew still renders the old and unrelated ongoing events; manager list remains month-bound instead of using today's overlap boundary.

- [ ] **Step 4: Add one explicit mobile feed flag and visibility predicate**

In `src/views/EventsView.tsx`, keep the existing Crew-specific flag and add the shared mobile-list flag:

```tsx
const isMobileEventFeed = isMobile && effectiveViewMode === 'list';
const isMobileCrewEventFeed = isMobileEventFeed && role === 'crew';
```

Initialize the boundary to today and rename the state away from Crew-only terminology:

```tsx
const [mobileListStartDate, setMobileListStartDate] = useState(() => getTodayDateKey());
const [mobilePickerMonthDate, setMobilePickerMonthDate] = useState(() => getTodayDateKey());
```

Add this helper after `getMobileCrewEventState`:

```tsx
const isEventVisibleFromMobileDate = (
  event: Event,
  role: 'crew' | 'crewhead' | 'coo',
  currentProfileId: string | null | undefined,
  startDate: string,
) => {
  if (role !== 'crew') return event.endDate >= startDate;
  if (event.startDate >= startDate) return true;
  if (event.endDate < startDate) return false;

  const { hasPendingApplication, isAssigned } = getMobileCrewEventState(event, currentProfileId);
  return isAssigned || hasPendingApplication;
};
```

Replace the mobile branch inside `listVisibleEvents` with:

```tsx
if (isMobileEventFeed) {
  return visibleEvents
    .filter((event) => (
      isEventVisibleFromMobileDate(event, role, currentProfileId, mobileListStartDate)
      || (isMobileEventDetailOpen && selectedEventId != null && getEventSelectionId(event) === selectedEventId)
    ))
    .filter((event) => (
      !isMobileCrewEventFeed
      || matchesMobileCrewEventFilter(event, currentProfileId, mobileCrewFilter)
    ))
    .sort((a, b) => (
      a.startDate.localeCompare(b.startDate)
      || a.name.localeCompare(b.name)
    ));
}
```

Use `mobileListStartDate` for the mobile list range and occurrence clipping:

```tsx
const listRangeStart = isMobileEventFeed ? mobileListStartDate : selectedMonthStart;
const listRangeEnd = isMobileEventFeed ? '9999-12-31' : selectedMonthEnd;
```

Pass `mobileListStartDate` into `getListOccurrencesForEvent` whenever `isMobileEventFeed` is true. Update the affected dependency arrays to include `isMobileEventFeed`, `role`, and `mobileListStartDate`.

- [ ] **Step 5: Run the boundary tests and verify GREEN**

Run:

```bash
npm test -- src/views/EventsView.test.tsx -t "keeps occupied mobile Crew|keeps active overlapping events"
```

Expected: 3 tests pass (Crew plus CrewHead and COO cases).

### Task 2: Reuse the mobile calendar for every role

**Files:**
- Modify: `src/views/EventsView.test.tsx`
- Modify: `src/views/EventsView.tsx:720-1010`

- [ ] **Step 1: Update the calendar regression to prove today's default and reset**

In `opens an in-app date picker for mobile Crew events and filters from the selected date`, add a past event:

```tsx
{
  id: 200,
  supabaseId: 'event-before-today',
  name: 'Akce pred dneskem',
  job: 'PAST001',
  startDate: '2026-08-05',
  endDate: '2026-08-05',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 1,
  filled: 0,
  status: 'past' as const,
  client: 'Klient Z',
},
```

Before opening the picker, assert today's default:

```tsx
expect(screen.queryByText('Akce pred dneskem')).not.toBeInTheDocument();
expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
```

Select `5. srpna 2026`, verify the past event appears, then replace the old `Všechny akce` click with:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Dnes a dál' }));

expect(screen.queryByText('Akce pred dneskem')).not.toBeInTheDocument();
expect(screen.getByText('Akce pred vyberem')).toBeInTheDocument();
expect(screen.getByText('Akce po vyberu')).toBeInTheDocument();
```

- [ ] **Step 2: Extend the manager regression to require the calendar action**

Inside the parameterized CrewHead/COO test from Task 1, assert:

```tsx
expect(screen.getByRole('button', { name: 'Vybrat datum akci' })).toBeInTheDocument();
```

- [ ] **Step 3: Run the calendar tests and verify RED**

Run:

```bash
npm test -- src/views/EventsView.test.tsx -t "opens an in-app date picker|keeps active overlapping events"
```

Expected: the Crew test still starts unbounded and has `Všechny akce`; manager roles do not expose the date picker.

- [ ] **Step 4: Generalize the calendar state handlers and mobile rendering**

In `src/views/EventsView.tsx`, use the shared state names in the picker date calculation and handlers:

```tsx
const mobilePickerDate = useMemo(
  () => getSafeDateFromKey(mobilePickerMonthDate, getSafeDateFromKey(mobileListStartDate, new Date())),
  [mobileListStartDate, mobilePickerMonthDate],
);

const toggleMobileDatePicker = () => {
  setShowMobileCrewFilters(false);
  setMobilePickerMonthDate(mobileListStartDate);
  setShowMobileCrewDatePicker((isOpen) => !isOpen);
};

const updateMobileStartDate = (value: string) => {
  if (!value) return;
  setMobileListStartDate(value);
  setMobilePickerMonthDate(value);
  setShowMobileCrewDatePicker(false);
  setEventsCalendarDate(value);
};

const resetMobileStartDate = () => {
  const today = getTodayDateKey();
  setMobileListStartDate(today);
  setMobilePickerMonthDate(today);
  setShowMobileCrewDatePicker(false);
  setEventsCalendarDate(today);
};
```

Keep the existing compact header branch Crew-only. In that branch, replace `onClick={toggleMobileCrewDatePicker}` with `onClick={toggleMobileDatePicker}`.

In the existing CrewHead/COO header, insert this button immediately before the `Akce` heading. It appears only in the mobile list, so desktop month controls remain byte-for-byte unchanged:

```tsx
{isMobileEventFeed && (
  <button
    type="button"
    aria-label="Vybrat datum akci"
    aria-pressed={showMobileCrewDatePicker}
    onClick={toggleMobileDatePicker}
    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] text-[color:var(--nodu-text-soft)] shadow-[0_12px_28px_rgba(47,38,31,0.08)] ${
      showMobileCrewDatePicker ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.18)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]' : ''
    }`}
  >
    <CalendarDays size={18} />
  </button>
)}
```

Change the list-month navigation condition from:

```tsx
effectiveViewMode === 'list' && !isMobileCrewEventFeed
```

to:

```tsx
effectiveViewMode === 'list' && !isMobileEventFeed
```

This removes the irrelevant month arrows only from mobile list mode while preserving the list/calendar switch and calendar-mode navigation for managers.

Gate the existing date panel with `isMobileEventFeed` instead of `isMobileCrewEventFeed`. Replace its reset button with:

```tsx
<button
  type="button"
  className="mb-3 w-full rounded-xl border border-[color:rgb(var(--nodu-accent-rgb)/0.2)] bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-3 py-2 text-xs font-bold text-[color:var(--nodu-accent)]"
  onClick={resetMobileStartDate}
>
  Dnes a dál
</button>
```

Use `updateMobileStartDate(dayKey)` for date cells. Keep the existing Crew participation panel and manager status chips unchanged. Change the empty-state role check from `isMobileCrewEventFeed` to `isMobileEventFeed`, with the copy `Od zvoleného data tu zatím nejsou žádné akce.`.

- [ ] **Step 5: Run all Events view tests**

Run:

```bash
npm test -- src/views/EventsView.test.tsx
```

Expected: all EventsView tests pass, including the existing desktop month-navigation tests.

- [ ] **Step 6: Commit the mobile Events work**

```bash
git add src/views/EventsView.tsx src/views/EventsView.test.tsx
git diff --cached --check
git commit -m "fix: default mobile events to today"
```

### Task 3: Bound the mobile Workflow card list

**Files:**
- Modify: `src/index.css.test.ts`
- Modify: `src/styles/mobile-my-shifts.css:394-470`

- [ ] **Step 1: Add a failing responsive CSS contract test**

Extend `loads the complete mobile My Shifts stylesheet` in `src/index.css.test.ts`:

```ts
const mobileCardGridRule = myShiftsCss.match(
  /\.nodu-my-shifts-card-grid\s*\{[\s\S]*?\}/,
)?.[0];
const tabletCardGridRule = myShiftsCss.match(
  /@media \(min-width: 768px\)[\s\S]*?\.nodu-my-shifts-card-grid\s*\{[\s\S]*?\}/,
)?.[0];

expect(mobileCardGridRule).toContain('max-height: min(26rem, 52dvh);');
expect(mobileCardGridRule).toContain('overflow-y: auto;');
expect(mobileCardGridRule).toContain('overscroll-behavior-y: contain;');
expect(mobileCardGridRule).toContain('-webkit-overflow-scrolling: touch;');
expect(tabletCardGridRule).toContain('max-height: none;');
expect(tabletCardGridRule).toContain('overflow-y: visible;');
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```bash
npm test -- src/index.css.test.ts -t "loads the complete mobile My Shifts stylesheet"
```

Expected: FAIL because the card grid has no max height or vertical overflow contract.

- [ ] **Step 3: Implement the mobile scroll viewport**

Update the base card-grid rule in `src/styles/mobile-my-shifts.css`:

```css
.nodu-my-shifts-card-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.8rem;
  max-height: min(26rem, 52dvh);
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding-right: 0.15rem;
  -webkit-overflow-scrolling: touch;
}
```

Reset the scroll constraint inside the existing tablet media query:

```css
@media (min-width: 768px) {
  .nodu-my-shifts-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
    overflow-y: visible;
    padding-right: 0;
  }
}
```

- [ ] **Step 4: Run the focused and complete CSS suites**

Run:

```bash
npm test -- src/index.css.test.ts -t "loads the complete mobile My Shifts stylesheet"
npm test -- src/index.css.test.ts
```

Expected: focused and complete CSS suites pass.

- [ ] **Step 5: Commit the Workflow scroll work**

```bash
git add src/index.css.test.ts src/styles/mobile-my-shifts.css
git diff --cached --check
git commit -m "fix: bound mobile timelog workflow height"
```

### Task 4: Verify the combined mobile behavior

**Files:**
- Verify only; generated iOS assets must not be committed.

- [ ] **Step 1: Run the relevant regression matrix**

```bash
npm test -- src/views/EventsView.test.tsx src/index.css.test.ts src/components/layout/AppLayout.test.tsx
npx tsc --noEmit
npx eslint src/views/EventsView.tsx src/views/EventsView.test.tsx src/index.css.test.ts
npm run build
git diff --check
```

Expected: every command exits zero. Existing non-blocking bundle-size and ineffective-dynamic-import warnings may remain.

- [ ] **Step 2: Review scope and repository state**

```bash
git status --short
git log -5 --oneline
```

Expected: implementation files are committed. The Xcode-generated untracked `Package.resolved` directory may remain while Xcode is open; it must not be staged.

- [ ] **Step 3: Build with the existing local Supabase environment**

```bash
set -a
source /Users/peetax/Projekty/crewflow/.env.local
set +a
npm run build
npx cap sync ios
```

- [ ] **Step 4: Build and install on the connected iPhone**

Create a fresh derived-data directory and use it for both build and installation:

```bash
MOBILE_EVENT_DERIVED_DATA=$(mktemp -d /tmp/crewflow-mobile-event-filter-build.XXXXXX)
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=00008110-000C284E2299801E' \
  -derivedDataPath "$MOBILE_EVENT_DERIVED_DATA" \
  DEVELOPMENT_TEAM=53SY44H4ZS CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

Install and launch:

```bash
xcrun devicectl device install app \
  --device 75DA6037-2430-56C9-A791-4DD552D102BA \
  "$MOBILE_EVENT_DERIVED_DATA/Build/Products/Debug-iphoneos/App.app"
xcrun devicectl device process launch \
  --device 75DA6037-2430-56C9-A791-4DD552D102BA \
  --terminate-existing --activate cz.nodu.app
```

- [ ] **Step 5: Complete physical-device acceptance**

Verify on the iPhone:

1. Crew, CH, and COO mobile Events initially exclude completed historical events.
2. Crew does not see an unrelated already-started multi-day event, but retains its own assigned or pending ongoing event.
3. CH and COO retain active overlapping multi-day events.
4. The calendar can select an older start date and `Dnes a dál` resets the boundary.
5. Workflow → Výkazy shows roughly two cards plus a partial next card and scrolls internally.
6. Desktop month behavior is unchanged in the automated tests.

Do not publish, deploy to production, or push a release as part of this plan.

# Crew Mobile Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first workflow-first mobile Crew experience: mobile Crew shell, cross-device preview, and a mobile calendar-based timelog editor that preserves the current desktop management workflow.

**Architecture:** Keep one React app, one role model, and one timelog data model. Desktop continues through `Sidebar` and the existing table-style `TimelogEditModal`; mobile Crew gets a bottom navigation shell and a mobile-specific timelog editor over the same `editingTimelog` state and `saveTimelog` service. Supabase changes are limited to optional per-day notes if the remote schema does not already expose `timelog_days.note`.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, Vitest, Testing Library, Supabase CLI, Supabase Postgres.

---

## File Structure

- Create `src/components/layout/nav-badges.ts`
  - Shared helper for notification counts used by desktop sidebar and mobile nav.
- Create `src/components/layout/MobileCrewNav.tsx`
  - Crew-only bottom navigation for mobile viewports.
- Modify `src/components/layout/Sidebar.tsx`
  - Reuse `buildNavBadgeCounts` and keep desktop behavior unchanged.
- Modify `src/components/layout/AppLayout.tsx`
  - Render desktop sidebar normally; render `MobileCrewNav` only for mobile Crew.
- Modify `src/index.css`
  - Add mobile shell, safe-area padding, bottom nav, and timelog mobile sheet classes.
- Modify `src/index.css.test.ts`
  - Assert mobile CSS helpers exist and use safe-area values.
- Modify `src/components/layout/AppLayout.test.tsx`
  - Assert desktop sidebar remains and mobile Crew shell uses bottom nav.
- Create `src/components/layout/MobileCrewNav.test.tsx`
  - Assert labels, badges, active state, and context reset behavior.
- Modify `src/types.ts`
  - Add optional `note?: string` to `TimelogDay`.
- Create `src/features/timelogs/services/timelog-day-ui.ts`
  - Pure helpers for event date ranges, 15-minute options, default day values, and outside-event detection.
- Create `src/features/timelogs/services/timelog-day-ui.test.ts`
  - Unit tests for the pure mobile timelog helpers.
- Modify `src/lib/supabase-mappers.ts`
  - Map `timelog_days.note` when available.
- Modify `src/lib/database.types.ts`
  - Add `note: string | null` to `timelog_days.Row` after schema verification or migration.
- Modify `src/features/timelogs/services/timelogs.service.ts`
  - Persist optional day notes on create/save/assignment day inserts.
- Modify `src/features/timelogs/services/timelogs.service.test.ts`
  - Verify day notes hydrate and persist.
- Create `src/components/modals/MobileTimelogEditModal.tsx`
  - Mobile calendar editor for Crew timelogs.
- Create `src/components/modals/MobileTimelogEditModal.test.tsx`
  - Mobile editor tests: event days highlighted, outside days allowed, 15-minute options, notes optional, save works.
- Modify `src/components/modals/TimelogEditModal.tsx`
  - Delegate to `MobileTimelogEditModal` for mobile Crew; keep existing desktop markup.

## Scope Notes

- Do not implement PWA install, Capacitor, Xcode, push notifications, self-billing generation, or contract generation in this plan.
- Treat `K vyplaceni` as a UI concept derived from `approved` timelogs, not a new database status in this plan.
- Keep every commit scoped. The current working tree contains unrelated changes; do not stage or revert files outside the task being committed.

---

### Task 1: Shared Nav Badge Counts

**Files:**
- Create: `src/components/layout/nav-badges.ts`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: existing sidebar behavior through `src/components/layout/AppLayout.test.tsx` and new mobile nav tests in Task 2

- [ ] **Step 1: Write the helper file**

Create `src/components/layout/nav-badges.ts`:

```ts
import type { Candidate, Invoice, ReceiptItem, Timelog } from '../../types';

export type NavBadgeInput = {
  candidates: Candidate[];
  currentProfileId: string | null;
  invoices: Invoice[];
  receipts: ReceiptItem[];
  timelogs: Timelog[];
};

export const buildNavBadgeCounts = ({
  candidates,
  currentProfileId,
  invoices,
  receipts,
  timelogs,
}: NavBadgeInput): Record<string, number> => ({
  timelogs: timelogs.filter((timelog) => timelog.status === 'pending_ch' || timelog.status === 'pending_coo').length,
  'my-timelogs': timelogs.filter((timelog) => (
    timelog.contractorProfileId === currentProfileId
    && ['draft', 'pending_ch', 'pending_coo', 'rejected'].includes(timelog.status)
  )).length,
  invoices: invoices.filter((invoice) => invoice.status === 'sent').length,
  'my-invoices': invoices.filter((invoice) => invoice.contractorProfileId === currentProfileId && invoice.status !== 'paid').length,
  receipts: receipts.filter((receipt) => receipt.status === 'submitted' || receipt.status === 'approved').length,
  'my-receipts': receipts.filter((receipt) => receipt.contractorProfileId === currentProfileId && receipt.status !== 'reimbursed').length,
  recruitment: candidates.filter((candidate) => candidate.stage === 'new').length,
});
```

- [ ] **Step 2: Replace inline sidebar badge logic**

In `src/components/layout/Sidebar.tsx`, import the helper:

```ts
import { buildNavBadgeCounts } from './nav-badges';
```

Replace the current `const badgeCounts: Record<string, number> = useMemo(() => ({ ... }))` block with:

```ts
const badgeCounts = useMemo(() => buildNavBadgeCounts({
  candidates,
  currentProfileId,
  invoices,
  receipts,
  timelogs,
}), [candidates, currentProfileId, invoices, receipts, timelogs]);
```

- [ ] **Step 3: Run current layout tests**

Run:

```bash
npm test -- src/components/layout/AppLayout.test.tsx
```

Expected: PASS. If it fails, fix only regressions caused by the helper extraction.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-badges.ts src/components/layout/Sidebar.tsx
git commit -m "refactor: share navigation badge counts"
```

---

### Task 2: Mobile Crew Bottom Navigation

**Files:**
- Create: `src/components/layout/MobileCrewNav.tsx`
- Create: `src/components/layout/MobileCrewNav.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/layout/MobileCrewNav.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCurrentTab = vi.fn();
const setSelectedContractorProfileId = vi.fn();
const setSelectedEventId = vi.fn();
const setSelectedProjectIdForStats = vi.fn();
const setSelectedClientIdForStats = vi.fn();

let context = {
  currentTab: 'my-shifts',
  setCurrentTab,
  setSelectedContractorProfileId,
  setSelectedEventId,
  setSelectedProjectIdForStats,
  setSelectedClientIdForStats,
};

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => context,
}));

describe('MobileCrewNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context = {
      currentTab: 'my-shifts',
      setCurrentTab,
      setSelectedContractorProfileId,
      setSelectedEventId,
      setSelectedProjectIdForStats,
      setSelectedClientIdForStats,
    };
  });

  it('renders compact Crew navigation labels', async () => {
    const { default: MobileCrewNav } = await import('./MobileCrewNav');

    render(<MobileCrewNav badgeCounts={{ 'my-timelogs': 2, 'my-invoices': 1 }} />);

    expect(screen.getByRole('navigation', { name: 'Mobilni navigace Crew' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Smeny' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schv.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fakt.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uct.' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('switches tabs and clears detail selections', async () => {
    const { default: MobileCrewNav } = await import('./MobileCrewNav');

    render(<MobileCrewNav badgeCounts={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Akce' }));

    expect(setCurrentTab).toHaveBeenCalledWith('events');
    expect(setSelectedContractorProfileId).toHaveBeenCalledWith(null);
    expect(setSelectedEventId).toHaveBeenCalledWith(null);
    expect(setSelectedProjectIdForStats).toHaveBeenCalledWith(null);
    expect(setSelectedClientIdForStats).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/layout/MobileCrewNav.test.tsx
```

Expected: FAIL because `MobileCrewNav` does not exist.

- [ ] **Step 3: Implement mobile nav**

Create `src/components/layout/MobileCrewNav.tsx`:

```tsx
import React from 'react';
import { getNavItemsForRole, NAV_ITEMS } from '../../constants';
import { useAppContext } from '../../context/useAppContext';

type NavItemId = typeof NAV_ITEMS[number]['id'];

const mobileLabels: Partial<Record<NavItemId, string>> = {
  'my-shifts': 'Smeny',
  events: 'Akce',
  'my-timelogs': 'Schv.',
  'my-invoices': 'Fakt.',
  'my-receipts': 'Uct.',
};

type MobileCrewNavProps = {
  badgeCounts: Record<string, number>;
};

const MobileCrewNav: React.FC<MobileCrewNavProps> = ({ badgeCounts }) => {
  const {
    currentTab,
    setCurrentTab,
    setSelectedClientIdForStats,
    setSelectedContractorProfileId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
  } = useAppContext();
  const navItems = getNavItemsForRole('crew');

  const handleNavClick = (tabId: string) => {
    setCurrentTab(tabId);
    setSelectedContractorProfileId(null);
    setSelectedEventId(null);
    setSelectedProjectIdForStats(null);
    setSelectedClientIdForStats(null);
  };

  return (
    <nav className="nodu-mobile-crew-nav" aria-label="Mobilni navigace Crew">
      {navItems.map((item) => {
        const label = mobileLabels[item.id] ?? item.label;
        const isActive = currentTab === item.id;
        const badge = badgeCounts[item.id] || 0;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavClick(item.id)}
            className={`nodu-mobile-crew-nav-item ${isActive ? 'nodu-mobile-crew-nav-item-active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            title={item.label}
          >
            <span className="relative">
              <item.icon size={18} aria-hidden="true" />
              {badge > 0 && <span className="nodu-mobile-crew-nav-badge">{badge}</span>}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileCrewNav;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/layout/MobileCrewNav.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/MobileCrewNav.tsx src/components/layout/MobileCrewNav.test.tsx
git commit -m "feat: add mobile crew navigation"
```

---

### Task 3: Responsive App Shell Integration

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`
- Modify: `src/components/layout/AppLayout.test.tsx`

- [ ] **Step 1: Write failing layout tests**

In `src/components/layout/AppLayout.test.tsx`, mock mobile detection and mobile nav:

```tsx
let isMobile = false;

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => isMobile,
}));

vi.mock('./MobileCrewNav', () => ({
  default: () => <nav data-testid="mobile-crew-nav" />,
}));
```

Expand `defaultAppContext` with the role and reset callbacks used by `AppLayout`:

```tsx
const defaultAppContext = {
  darkMode: false,
  currentTab: 'dashboard',
  role: 'crewhead',
};
```

Reset `isMobile` in `beforeEach`:

```tsx
beforeEach(() => {
  isMobile = false;
  mockAppContext = { ...defaultAppContext };
});
```

Add tests:

```tsx
it('keeps the desktop sidebar for management roles on desktop', () => {
  render(<AppLayout />);

  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  expect(screen.queryByTestId('mobile-crew-nav')).not.toBeInTheDocument();
});

it('uses the mobile Crew shell for Crew on mobile', () => {
  isMobile = true;
  mockAppContext = {
    ...mockAppContext,
    role: 'crew',
    currentTab: 'my-shifts',
  };

  render(<AppLayout />);

  expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  expect(screen.getByTestId('mobile-crew-nav')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveClass('nodu-page-frame--mobile-crew');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/layout/AppLayout.test.tsx
```

Expected: FAIL because `AppLayout` does not yet import `useIsMobile` or `MobileCrewNav`.

- [ ] **Step 3: Implement AppLayout conditional shell**

Update `src/components/layout/AppLayout.tsx` imports:

```tsx
import { useAuth } from '../../app/providers/useAuth';
import { useIsMobile } from '../../hooks/use-mobile';
import { getCandidates } from '../../features/recruitment/services/candidates.service';
import { useTimelogsQuery } from '../../features/timelogs/queries/useTimelogsQuery';
import { useReceiptsQuery } from '../../features/receipts/queries/useReceiptsQuery';
import { useInvoicesQuery } from '../../features/invoices/queries/useInvoicesQuery';
import { buildNavBadgeCounts } from './nav-badges';
import MobileCrewNav from './MobileCrewNav';
```

Inside `AppLayout`, read role and mobile state:

```tsx
const {
  darkMode,
  currentTab,
  role,
} = useAppContext();
const { currentProfileId } = useAuth();
const isMobile = useIsMobile();
const isMobileCrewShell = role === 'crew' && isMobile;
const timelogsQuery = useTimelogsQuery();
const receiptsQuery = useReceiptsQuery();
const invoicesQuery = useInvoicesQuery();
const badgeCounts = buildNavBadgeCounts({
  candidates: getCandidates() ?? [],
  currentProfileId,
  invoices: invoicesQuery.data ?? [],
  receipts: receiptsQuery.data ?? [],
  timelogs: timelogsQuery.data ?? [],
});
```

Update the shell markup:

```tsx
<div className={`nodu-app-shell ${isMobileCrewShell ? 'nodu-app-shell--mobile-crew' : ''} ${darkMode ? 'dark' : ''}`}>
  {!isMobileCrewShell && <Sidebar />}

  <main className={`nodu-page-frame ${isMobileCrewShell ? 'nodu-page-frame--mobile-crew' : ''}`}>
    <div className="mx-auto max-w-6xl">
      <AnimatePresence mode="wait">{renderCurrentView()}</AnimatePresence>
    </div>
  </main>

  {isMobileCrewShell && <MobileCrewNav badgeCounts={badgeCounts} />}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/components/layout/AppLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppLayout.tsx src/components/layout/AppLayout.test.tsx
git commit -m "feat: use mobile crew shell on phones"
```

---

### Task 4: Mobile Shell CSS And Safe Areas

**Files:**
- Modify: `src/index.css`
- Modify: `src/index.css.test.ts`

- [ ] **Step 1: Write failing CSS assertions**

Add to `src/index.css.test.ts`:

```ts
it('defines mobile Crew shell safe-area helpers', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const mobileShellRule = css.match(/\.nodu-app-shell--mobile-crew\s*\{[\s\S]*?\}/)?.[0];
  const mobilePageRule = css.match(/\.nodu-page-frame--mobile-crew\s*\{[\s\S]*?\}/)?.[0];
  const mobileNavRule = css.match(/\.nodu-mobile-crew-nav\s*\{[\s\S]*?\}/)?.[0];

  expect(css).toContain('.nodu-app-shell--mobile-crew');
  expect(css).toContain('.nodu-page-frame--mobile-crew');
  expect(css).toContain('.nodu-mobile-crew-nav');
  expect(mobileShellRule).toContain('min-height: 100dvh');
  expect(mobilePageRule).toContain('env(safe-area-inset-bottom)');
  expect(mobileNavRule).toContain('env(safe-area-inset-bottom)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/index.css.test.ts
```

Expected: FAIL because the mobile classes do not exist.

- [ ] **Step 3: Add CSS helpers**

Append to `src/index.css` after the sidebar/nav rules:

```css
.nodu-app-shell--mobile-crew {
  min-height: 100dvh;
  height: 100dvh;
  overflow: hidden;
}

.nodu-page-frame--mobile-crew {
  padding: 16px 14px calc(92px + env(safe-area-inset-bottom));
}

.nodu-mobile-crew-nav {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom));
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid rgb(var(--nodu-text-rgb) / 0.08);
  border-radius: 22px;
  background: rgb(var(--nodu-surface-rgb) / 0.96);
  box-shadow: 0 18px 46px rgb(var(--nodu-text-rgb) / 0.16);
  padding: 8px;
  backdrop-filter: blur(18px);
}

.nodu-mobile-crew-nav-item {
  display: flex;
  min-width: 0;
  min-height: 52px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 14px;
  color: var(--nodu-text-soft);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.nodu-mobile-crew-nav-item-active {
  background: rgb(var(--nodu-accent-rgb) / 0.12);
  color: var(--nodu-accent);
}

.nodu-mobile-crew-nav-badge {
  position: absolute;
  right: -8px;
  top: -8px;
  min-width: 16px;
  border-radius: 999px;
  background: var(--nodu-accent);
  color: white;
  font-size: 9px;
  line-height: 16px;
  text-align: center;
}
```

- [ ] **Step 4: Run CSS test**

Run:

```bash
npm test -- src/index.css.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/index.css.test.ts
git commit -m "style: add mobile crew shell safe areas"
```

---

### Task 5: Timelog Day Helpers And Optional Day Notes

**Files:**
- Modify: `src/types.ts`
- Create: `src/features/timelogs/services/timelog-day-ui.ts`
- Create: `src/features/timelogs/services/timelog-day-ui.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/features/timelogs/services/timelog-day-ui.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types';
import {
  buildQuarterHourOptions,
  buildTimelogCalendarDates,
  createDefaultTimelogDay,
  isDateInEventRange,
} from './timelog-day-ui';

const event: Event = {
  id: 1,
  name: 'TEST',
  job: 'JOB-1',
  startDate: '2026-07-13',
  endDate: '2026-07-15',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'upcoming',
  client: 'NEXTLEVEL',
  showDayTypes: true,
  dayTypes: {
    '2026-07-13': 'instal',
    '2026-07-14': 'provoz',
    '2026-07-15': 'deinstal',
  },
};

describe('timelog day UI helpers', () => {
  it('builds time options in 15 minute steps', () => {
    const options = buildQuarterHourOptions();

    expect(options).toContain('00:00');
    expect(options).toContain('08:15');
    expect(options).toContain('23:45');
    expect(options).not.toContain('08:10');
    expect(options).toHaveLength(96);
  });

  it('marks dates inside and outside the event range', () => {
    expect(isDateInEventRange('2026-07-13', event)).toBe(true);
    expect(isDateInEventRange('2026-07-15', event)).toBe(true);
    expect(isDateInEventRange('2026-07-12', event)).toBe(false);
  });

  it('builds a padded calendar containing event dates and outside dates', () => {
    const dates = buildTimelogCalendarDates(event);

    expect(dates).toContain('2026-07-13');
    expect(dates).toContain('2026-07-15');
    expect(dates[0]).toBe('2026-07-07');
    expect(dates[dates.length - 1]).toBe('2026-07-21');
  });

  it('creates default day values with optional empty note', () => {
    expect(createDefaultTimelogDay('2026-07-14', event)).toEqual({
      d: '2026-07-14',
      f: '08:00',
      t: '17:00',
      type: 'provoz',
      note: '',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/features/timelogs/services/timelog-day-ui.test.ts
```

Expected: FAIL because `timelog-day-ui.ts` does not exist.

- [ ] **Step 3: Update `TimelogDay` type**

In `src/types.ts`, change `TimelogDay` to:

```ts
export interface TimelogDay {
  /** Datum (YYYY-MM-DD) */
  d: string;
  /** Cas od (HH:MM) */
  f: string;
  /** Cas do (HH:MM) */
  t: string;
  type: TimelogType;
  /** Volitelna poznamka ke konkretnimu dni */
  note?: string;
}
```

- [ ] **Step 4: Implement pure helpers**

Create `src/features/timelogs/services/timelog-day-ui.ts`:

```ts
import { addDays, format, parseISO, subDays } from 'date-fns';
import type { Event, TimelogDay, TimelogType } from '../../../types';

const DATE_FORMAT = 'yyyy-MM-dd';

export const buildQuarterHourOptions = (): string[] => (
  Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15;
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  })
);

export const isDateInEventRange = (date: string, event: Pick<Event, 'startDate' | 'endDate'>): boolean => (
  date >= event.startDate && date <= event.endDate
);

export const buildTimelogCalendarDates = (event: Pick<Event, 'startDate' | 'endDate'>): string[] => {
  const start = subDays(parseISO(event.startDate), 6);
  const end = addDays(parseISO(event.endDate), 6);
  const dates: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(format(cursor, DATE_FORMAT));
  }

  return dates;
};

export const getDefaultTimelogType = (date: string, event: Event): TimelogType => (
  event.dayTypes?.[date] ?? (event.showDayTypes ? 'provoz' : 'instal')
);

export const createDefaultTimelogDay = (date: string, event: Event): TimelogDay => {
  const type = getDefaultTimelogType(date, event);
  const matchingSlot = event.phaseSchedules?.[type]?.find((slot) => slot.dates.includes(date));

  return {
    d: date,
    f: matchingSlot?.from ?? event.phaseTimes?.[type]?.from ?? event.startTime ?? '08:00',
    t: matchingSlot?.to ?? event.phaseTimes?.[type]?.to ?? event.endTime ?? '17:00',
    type,
    note: '',
  };
};
```

- [ ] **Step 5: Run helper test**

Run:

```bash
npm test -- src/features/timelogs/services/timelog-day-ui.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/features/timelogs/services/timelog-day-ui.ts src/features/timelogs/services/timelog-day-ui.test.ts
git commit -m "feat: add mobile timelog day helpers"
```

---

### Task 6: Supabase Timelog Day Note Persistence

**Files:**
- Possibly create: Supabase migration generated by `supabase migration new add_timelog_day_notes`
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Modify: `src/features/events/services/events.service.ts`
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/timelogs/services/timelogs.service.test.ts`

- [ ] **Step 1: Verify current remote schema**

Run:

```bash
supabase db query --linked "select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'timelog_days' order by ordinal_position;"
```

Expected: The output either includes `note text YES` or confirms that the column is missing.

- [ ] **Step 2: If `note` is missing, apply the linked database change**

Run:

```bash
supabase db query --linked "alter table public.timelog_days add column if not exists note text;"
```

Expected: command exits 0. Re-run Step 1 and confirm `note` exists.

- [ ] **Step 3: If `note` was missing, create a local migration record**

Run:

```bash
supabase migration new add_timelog_day_notes
```

Expected: Supabase creates a timestamped SQL file in `supabase/migrations/`.

Open the exact file printed by the CLI and write:

```sql
alter table public.timelog_days
add column if not exists note text;
```

Run:

```bash
git status --short supabase/migrations
```

Expected: exactly one new migration file appears for `add_timelog_day_notes`.

- [ ] **Step 4: Write failing mapper/service tests**

In `src/features/timelogs/services/timelogs.service.test.ts`, extend the existing hydration test so a day row contains `note: 'Priprava pred akci'` and assert:

```ts
expect(timelogs[0].days[0].note).toBe('Priprava pred akci');
```

Extend the existing save test day insert expectation to include notes:

```ts
expect(timelogDaysInsert).toHaveBeenCalledWith([
  {
    timelog_id: 'timelog-row-1',
    date: '2026-04-10',
    time_from: '08:00',
    time_to: '18:00',
    day_type: 'instal',
    note: 'Ranni priprava',
  },
  {
    timelog_id: 'timelog-row-1',
    date: '2026-04-11',
    time_from: '09:00',
    time_to: '15:00',
    day_type: 'provoz',
    note: null,
  },
]);
```

- [ ] **Step 5: Run test to verify it fails**

Run:

```bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts
```

Expected: FAIL because day notes are not mapped or inserted yet.

- [ ] **Step 6: Update database types**

In `src/lib/database.types.ts`, update `timelog_days.Row`:

```ts
timelog_days: {
  Row: {
    id: string;
    timelog_id: string;
    date: string;
    time_from: string | null;
    time_to: string | null;
    day_type: TimelogType;
    note: string | null;
    created_at: string;
  };
};
```

- [ ] **Step 7: Map day notes**

In `src/lib/supabase-mappers.ts`, update `mapTimelogDay`:

```ts
export function mapTimelogDay(row: TimelogDayRow): TimelogDay {
  return {
    d: row.date,
    f: row.time_from ?? '',
    t: row.time_to ?? '',
    type: row.day_type,
    note: row.note ?? '',
  };
}
```

- [ ] **Step 8: Persist day notes**

In `src/features/timelogs/services/timelogs.service.ts`, add `note: day.note?.trim() || null` to both `timelog_days.insert(...)` mappings in `createTimelog` and `saveTimelog`:

```ts
{
  timelog_id: timelogRowId,
  date: day.d,
  time_from: day.f,
  time_to: day.t,
  day_type: day.type,
  note: day.note?.trim() || null,
}
```

In `src/features/events/services/events.service.ts`, add the same `note` property to the `assignCrewToEvent` `timelog_days.insert(...)` mapping.

- [ ] **Step 9: Run service tests**

Run:

```bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

If no migration was needed:

```bash
git add src/lib/database.types.ts src/lib/supabase-mappers.ts src/features/events/services/events.service.ts src/features/timelogs/services/timelogs.service.ts src/features/timelogs/services/timelogs.service.test.ts
git commit -m "feat: persist optional timelog day notes"
```

If a migration was needed, include the generated migration file:

```bash
git add supabase/migrations src/lib/database.types.ts src/lib/supabase-mappers.ts src/features/events/services/events.service.ts src/features/timelogs/services/timelogs.service.ts src/features/timelogs/services/timelogs.service.test.ts
git commit -m "feat: persist optional timelog day notes"
```

---

### Task 7: Mobile Timelog Editor

**Files:**
- Create: `src/components/modals/MobileTimelogEditModal.tsx`
- Create: `src/components/modals/MobileTimelogEditModal.test.tsx`
- Modify: `src/components/modals/TimelogEditModal.tsx`

- [ ] **Step 1: Write failing mobile editor tests**

Create `src/components/modals/MobileTimelogEditModal.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEditingTimelog = vi.fn();
const saveTimelog = vi.fn().mockResolvedValue(undefined);

const event = {
  id: 1,
  name: 'TEST',
  job: 'JOB-1',
  startDate: '2026-07-13',
  endDate: '2026-07-15',
  startTime: '08:00',
  endTime: '17:00',
  city: 'Praha',
  needed: 1,
  filled: 1,
  status: 'upcoming' as const,
  client: 'NEXTLEVEL',
  showDayTypes: true,
  dayTypes: {
    '2026-07-13': 'instal' as const,
    '2026-07-14': 'provoz' as const,
    '2026-07-15': 'deinstal' as const,
  },
};

const contractor = {
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
  tags: [],
  events: 1,
  rate: 300,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
};

const timelog = {
  id: 1,
  eid: 1,
  contractorProfileId: 'profile-1',
  days: [{ d: '2026-07-13', f: '08:00', t: '17:00', type: 'instal' as const, note: '' }],
  km: 0,
  note: '',
  status: 'draft' as const,
};

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({
    editingTimelog: timelog,
    setEditingTimelog,
    role: 'crew',
  }),
}));

vi.mock('../../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({ contractors: [contractor], events: [event] }),
  saveTimelog,
}));

describe('MobileTimelogEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows event days and outside days in a mobile calendar', async () => {
    const { default: MobileTimelogEditModal } = await import('./MobileTimelogEditModal');

    render(<MobileTimelogEditModal />);

    expect(screen.getByRole('dialog', { name: 'Upravit vykaz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '13.07.2026 zadano v terminu akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12.07.2026 mimo termin akce' })).toBeInTheDocument();
  });

  it('opens a day sheet with 15 minute time options and optional note', async () => {
    const { default: MobileTimelogEditModal } = await import('./MobileTimelogEditModal');

    render(<MobileTimelogEditModal />);
    fireEvent.click(screen.getByRole('button', { name: '12.07.2026 mimo termin akce' }));

    expect(screen.getByRole('dialog', { name: 'Upravit den 12.07.2026' })).toBeInTheDocument();
    expect(screen.getByLabelText('Od')).toHaveDisplayValue('08:00');
    expect(screen.getByLabelText('Do')).toHaveDisplayValue('17:00');
    expect(screen.getByRole('option', { name: '08:15' })).toBeInTheDocument();
    expect(screen.getByLabelText('Poznamka')).toHaveDisplayValue('');
  });

  it('saves without requiring a note', async () => {
    const { default: MobileTimelogEditModal } = await import('./MobileTimelogEditModal');

    render(<MobileTimelogEditModal />);
    fireEvent.click(screen.getByRole('button', { name: '13.07.2026 zadano v terminu akce' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit den' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit vykaz' }));

    await waitFor(() => expect(saveTimelog).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/components/modals/MobileTimelogEditModal.test.tsx
```

Expected: FAIL because `MobileTimelogEditModal` does not exist.

- [ ] **Step 3: Implement mobile editor**

Create `src/components/modals/MobileTimelogEditModal.tsx` with these behaviors:

```tsx
// Required public behavior:
// - return null when no editingTimelog exists
// - use getTimelogDependencies() to find contractor and event
// - render role="dialog" aria-label="Upravit vykaz"
// - render summary with total hours and reward
// - render buildTimelogCalendarDates(event)
// - use isDateInEventRange(date, event) for outside styling
// - on day click, open an inner sheet role="dialog" aria-label={`Upravit den ${formatCzechDate(date)}`}
// - use select controls with buildQuarterHourOptions()
// - do not validate note as required
// - save via saveTimelog(localTimelog)
```

Use this state shape:

```tsx
const [draft, setDraft] = React.useState(editingTimelog);
const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
const selectedDay = draft.days.find((day) => day.d === selectedDate) ?? null;
```

Use this upsert helper inside the component:

```tsx
const upsertDay = (nextDay: TimelogDay) => {
  setDraft((current) => ({
    ...current,
    days: current.days.some((day) => day.d === nextDay.d)
      ? current.days.map((day) => (day.d === nextDay.d ? nextDay : day))
      : [...current.days, nextDay],
  }));
};
```

When opening a date:

```tsx
const handleOpenDay = (date: string) => {
  if (!draft.days.some((day) => day.d === date)) {
    upsertDay(createDefaultTimelogDay(date, event));
  }
  setSelectedDate(date);
};
```

- [ ] **Step 4: Delegate mobile Crew from desktop modal**

In `src/components/modals/TimelogEditModal.tsx`, import:

```tsx
import { useIsMobile } from '../../hooks/use-mobile';
import MobileTimelogEditModal from './MobileTimelogEditModal';
```

After reading `role`, add:

```tsx
const isMobile = useIsMobile();

if (editingTimelog && role === 'crew' && isMobile) {
  return <MobileTimelogEditModal />;
}
```

Keep the existing desktop modal code below this guard.

- [ ] **Step 5: Run mobile editor tests**

Run:

```bash
npm test -- src/components/modals/MobileTimelogEditModal.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run existing timelog modal-adjacent tests**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx src/views/TimelogsView.test.tsx
```

Expected: PASS. If failures come from accessible labels changed by the new mobile-only component, update the tests only when the expected behavior truly changed.

- [ ] **Step 7: Commit**

```bash
git add src/components/modals/MobileTimelogEditModal.tsx src/components/modals/MobileTimelogEditModal.test.tsx src/components/modals/TimelogEditModal.tsx
git commit -m "feat: add mobile timelog editor"
```

---

### Task 8: Mobile Preview Verification

**Files:**
- No production files required unless visual verification finds overlap bugs.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/components/layout/MobileCrewNav.test.tsx src/components/layout/AppLayout.test.tsx src/components/modals/MobileTimelogEditModal.test.tsx src/features/timelogs/services/timelog-day-ui.test.ts src/features/timelogs/services/timelogs.service.test.ts src/views/EventDetailView.test.tsx src/views/TimelogsView.test.tsx src/index.css.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Existing chunk-size or Browserslist warnings are acceptable if no new build error appears.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Vite serves the app on `http://127.0.0.1:8080/` or the next available port.

- [ ] **Step 4: Verify desktop preview**

Open `/app` at a desktop viewport around `1280x720`.

Expected:

- sidebar is visible,
- management role can still use full labels,
- main content is not hidden behind the mobile bottom nav,
- existing desktop timelog modal remains table-style.

- [ ] **Step 5: Verify iPhone preview**

Set browser viewport to `390x844` and switch to role `Crew`.

Expected:

- desktop sidebar is hidden,
- bottom Crew nav is visible,
- bottom nav does not overlap page content,
- opening a draft timelog shows the mobile calendar editor,
- event dates are highlighted and outside dates are allowed.

- [ ] **Step 6: Verify Android preview**

Set browser viewport to `412x915` and switch to role `Crew`.

Expected:

- same behavior as iPhone preview,
- labels fit in the bottom nav,
- touch targets look at least 44px high,
- save buttons remain reachable above the safe-area padding.

- [ ] **Step 7: Fix visual bugs with tests first when possible**

If a visual issue is found, write or extend the closest test before changing code:

```bash
npm test -- src/components/modals/MobileTimelogEditModal.test.tsx src/components/layout/AppLayout.test.tsx src/components/layout/MobileCrewNav.test.tsx src/index.css.test.ts
```

Expected: the new test fails for the observed issue before the fix.

- [ ] **Step 8: Commit final fixes**

```bash
git add src/index.css src/components/layout/AppLayout.tsx src/components/layout/MobileCrewNav.tsx src/components/layout/MobileCrewNav.test.tsx src/components/modals/MobileTimelogEditModal.tsx src/components/modals/MobileTimelogEditModal.test.tsx
git commit -m "fix: polish mobile crew workflow preview"
```

---

## Self-Review Notes

- Spec coverage:
  - Workflow-first Crew mobile shell: Tasks 2, 3, 4, and 8.
  - Desktop remains management-first: Tasks 3, 4, and 8.
  - Mobile calendar timelog editor: Tasks 5 and 7.
  - 15-minute time selection: Tasks 5 and 7.
  - Optional notes everywhere in first editor scope: Tasks 5, 6, and 7.
  - Outside-event days allowed: Tasks 5 and 7.
  - Supabase persistence for per-day notes: Task 6.
  - PWA, Xcode, contracts, and self-billing excluded: Scope Notes and Task 8.
- Placeholder scan: no unresolved placeholders remain in implementation steps.
- Type consistency:
  - `TimelogDay.note?: string` is used in helpers, mapper, persistence, and mobile editor.
  - Mobile nav ids use existing `NAV_ITEMS` ids and `getNavItemsForRole('crew')`.
  - `K vyplaceni` stays derived from existing `approved` timelogs.

# Crew Calendar Shift Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Crew calendar that shows active crew-member names on assigned shifts, with event context revealed after clicking a name.

**Architecture:** Build a small crew-calendar data service that derives assignment ranges from existing `timelogs`, `events`, `contractors`, and `eventCrewAssignments`. Render the calendar in a new `CrewShiftCalendarView` and let `CrewView` toggle between the existing crew table and the new calendar. Keep navigation local: clicking `Otevrit akci` sets the current tab to `events`, selects the event, and opens the overview tab.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, date-fns, lucide-react, existing Tailwind utility classes and app context.

---

## File Structure

- Create `src/features/crew/services/crew-calendar.service.ts`
  - Purely derives `CrewCalendarAssignment[]` from existing app data.
  - Exports a pure `buildCrewCalendarAssignments()` for tests and runtime `getCrewCalendarAssignments()` / `subscribeToCrewCalendarChanges()`.
- Create `src/features/crew/services/crew-calendar.service.test.ts`
  - Unit coverage for grouping contiguous days, splitting separate ranges, search filtering, and fallback assignments.
- Create `src/views/CrewShiftCalendarView.tsx`
  - Read-only monthly calendar UI, assignment-name buttons, assignment detail popover, month navigation, and `Otevrit akci`.
- Create `src/views/CrewShiftCalendarView.test.tsx`
  - Component coverage for rendering names, opening detail, navigating to event detail, month switching, and search passthrough.
- Modify `src/views/CrewView.tsx`
  - Add `Kalendar smen` button next to `+ Novy clen`.
  - Toggle between existing table and `CrewShiftCalendarView`.
- Create `src/views/CrewView.test.tsx`
  - Integration smoke test for opening and leaving the Crew calendar without breaking the existing list.

Do not modify database migrations or Supabase schema. Do not change existing Akce behavior.

---

### Task 1: Crew Calendar Assignment Service

**Files:**
- Create: `src/features/crew/services/crew-calendar.service.test.ts`
- Create: `src/features/crew/services/crew-calendar.service.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/features/crew/services/crew-calendar.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCrewCalendarAssignments } from './crew-calendar.service';
import type { Contractor, Event, EventCrewAssignment, Timelog } from '../../../types';

const contractor = (overrides: Partial<Contractor> = {}): Contractor => ({
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Jouda',
  ii: 'PJ',
  bg: '#E1F5EE',
  fg: '#0F6E56',
  tags: [],
  events: 1,
  rate: 200,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
  ...overrides,
});

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 10,
  supabaseId: 'event-uuid-10',
  name: 'Prima Festival',
  job: 'PF001',
  startDate: '2026-05-16',
  endDate: '2026-05-18',
  city: 'Plzen',
  needed: 2,
  filled: 1,
  status: 'upcoming',
  client: 'Next Level',
  ...overrides,
});

const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 100,
  eid: 10,
  contractorProfileId: 'profile-1',
  days: [
    { d: '2026-05-16', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-17', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-18', f: '09:00', t: '18:00', type: 'provoz' },
  ],
  km: 0,
  note: '',
  status: 'draft',
  ...overrides,
});

describe('crew-calendar.service', () => {
  it('groups contiguous timelog days for one contractor and event into one assignment range', () => {
    expect(buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [timelog()],
      eventCrewAssignments: [],
    })).toEqual([
      expect.objectContaining({
        id: 'timelog-100-0',
        contractorProfileId: 'profile-1',
        contractorName: 'Petr Jouda',
        contractorInitials: 'PJ',
        eventId: 10,
        eventSelectionId: 'event-uuid-10',
        eventName: 'Prima Festival',
        eventJob: 'PF001',
        eventCity: 'Plzen',
        dateFrom: '2026-05-16',
        dateTo: '2026-05-18',
        timeFrom: '09:00',
        timeTo: '18:00',
        dayCount: 3,
      }),
    ]);
  });

  it('splits non-contiguous timelog days into separate visible assignment ranges', () => {
    const assignments = buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [timelog({
        days: [
          { d: '2026-05-16', f: '09:00', t: '18:00', type: 'provoz' },
          { d: '2026-05-18', f: '09:00', t: '18:00', type: 'provoz' },
        ],
      })],
      eventCrewAssignments: [],
    });

    expect(assignments.map((assignment) => [assignment.dateFrom, assignment.dateTo])).toEqual([
      ['2026-05-16', '2026-05-16'],
      ['2026-05-18', '2026-05-18'],
    ]);
  });

  it('filters assignments by contractor name, event name, and job number', () => {
    const assignments = buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'vomacka',
    });

    expect(assignments).toHaveLength(1);
    expect(buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'ZM001',
    })).toHaveLength(1);
    expect(buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'neexistuje',
    })).toHaveLength(0);
  });

  it('uses eventCrewAssignments as fallback when a contractor is assigned but has no timelog days yet', () => {
    const fallback: EventCrewAssignment = {
      eventId: 10,
      eventSupabaseId: 'event-uuid-10',
      contractorProfileId: 'profile-1',
      name: 'Petr Jouda',
    };

    expect(buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [],
      eventCrewAssignments: [fallback],
    })).toEqual([
      expect.objectContaining({
        id: 'assignment-10-profile-1',
        contractorName: 'Petr Jouda',
        eventName: 'Prima Festival',
        dateFrom: '2026-05-16',
        dateTo: '2026-05-18',
        timeFrom: null,
        timeTo: null,
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run the service test and confirm it fails**

Run:

```bash
npm test -- src/features/crew/services/crew-calendar.service.test.ts
```

Expected: FAIL because `./crew-calendar.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `src/features/crew/services/crew-calendar.service.ts`:

```ts
import { getLocalAppState, subscribeToLocalAppState } from '../../../lib/app-data';
import type { Contractor, Event, EventCrewAssignment, Timelog, TimelogDay } from '../../../types';
import { getCrew } from './crew.service';
import { getEvents } from '../../events/services/events.service';
import { getTimelogs } from '../../timelogs/services/timelogs.service';

export interface CrewCalendarAssignment {
  id: string;
  source: 'timelog' | 'assignment';
  contractorProfileId: string;
  contractorName: string;
  contractorInitials: string;
  contractorBg: string;
  contractorFg: string;
  eventId: number;
  eventSelectionId: number | string;
  eventName: string;
  eventJob: string;
  eventCity: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string | null;
  timeTo: string | null;
  dayCount: number;
  days: TimelogDay[];
}

interface BuildCrewCalendarAssignmentsInput {
  contractors: Contractor[];
  events: Event[];
  timelogs: Timelog[];
  eventCrewAssignments: EventCrewAssignment[];
  search?: string;
}

const fallbackInitials = (name: string) => (
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
);

const addDays = (date: string, amount: number) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
};

const isNextDate = (previous: string, next: string) => addDays(previous, 1) === next;

const splitTimelogDaysIntoRanges = (days: TimelogDay[]) => {
  const sortedDays = [...days].sort((a, b) => `${a.d}${a.f}${a.t}`.localeCompare(`${b.d}${b.f}${b.t}`));
  const ranges: TimelogDay[][] = [];

  for (const day of sortedDays) {
    const currentRange = ranges[ranges.length - 1];
    const previousDay = currentRange?.[currentRange.length - 1];
    const canJoinPrevious =
      previousDay
      && isNextDate(previousDay.d, day.d)
      && previousDay.f === day.f
      && previousDay.t === day.t;

    if (!canJoinPrevious) {
      ranges.push([day]);
    } else {
      currentRange.push(day);
    }
  }

  return ranges;
};

const matchesSearch = (assignment: CrewCalendarAssignment, search: string) => {
  if (!search) return true;
  const query = search.toLowerCase();
  return (
    assignment.contractorName.toLowerCase().includes(query)
    || assignment.eventName.toLowerCase().includes(query)
    || assignment.eventJob.toLowerCase().includes(query)
  );
};

const mapContractorMeta = (contractor: Contractor | undefined, fallbackName: string) => ({
  contractorName: contractor?.name ?? fallbackName,
  contractorInitials: contractor?.ii || fallbackInitials(fallbackName),
  contractorBg: contractor?.bg || '#E1F5EE',
  contractorFg: contractor?.fg || '#0F6E56',
});

export const buildCrewCalendarAssignments = ({
  contractors,
  events,
  timelogs,
  eventCrewAssignments,
  search = '',
}: BuildCrewCalendarAssignmentsInput): CrewCalendarAssignment[] => {
  const eventById = new Map(events.map((event) => [event.id, event]));
  const contractorByProfileId = new Map(
    contractors
      .filter((contractor): contractor is Contractor & { profileId: string } => Boolean(contractor.profileId))
      .map((contractor) => [contractor.profileId, contractor]),
  );
  const assignmentKeysWithTimelogs = new Set<string>();

  const timelogAssignments = timelogs.flatMap((timelog) => {
    const event = eventById.get(timelog.eid);
    if (!event || !timelog.contractorProfileId || timelog.days.length === 0) return [];

    assignmentKeysWithTimelogs.add(`${event.id}:${timelog.contractorProfileId}`);
    const contractor = contractorByProfileId.get(timelog.contractorProfileId);
    const contractorMeta = mapContractorMeta(contractor, contractor?.name ?? 'Clen crew');

    return splitTimelogDaysIntoRanges(timelog.days).map((range, rangeIndex) => ({
      id: `timelog-${timelog.id}-${rangeIndex}`,
      source: 'timelog' as const,
      contractorProfileId: timelog.contractorProfileId as string,
      ...contractorMeta,
      eventId: event.id,
      eventSelectionId: event.supabaseId ?? event.id,
      eventName: event.name,
      eventJob: event.job,
      eventCity: event.city,
      dateFrom: range[0].d,
      dateTo: range[range.length - 1].d,
      timeFrom: range[0].f,
      timeTo: range[0].t,
      dayCount: range.length,
      days: range,
    }));
  });

  const fallbackAssignments = eventCrewAssignments
    .filter((assignment) => !assignmentKeysWithTimelogs.has(`${assignment.eventId}:${assignment.contractorProfileId}`))
    .map((assignment) => {
      const event = eventById.get(assignment.eventId);
      if (!event) return null;
      const contractor = contractorByProfileId.get(assignment.contractorProfileId);
      const contractorMeta = mapContractorMeta(contractor, assignment.name);

      return {
        id: `assignment-${assignment.eventId}-${assignment.contractorProfileId}`,
        source: 'assignment' as const,
        contractorProfileId: assignment.contractorProfileId,
        ...contractorMeta,
        eventId: event.id,
        eventSelectionId: event.supabaseId ?? event.id,
        eventName: event.name,
        eventJob: event.job,
        eventCity: event.city,
        dateFrom: event.startDate,
        dateTo: event.endDate,
        timeFrom: null,
        timeTo: null,
        dayCount: 0,
        days: [],
      } satisfies CrewCalendarAssignment;
    })
    .filter((assignment): assignment is CrewCalendarAssignment => Boolean(assignment));

  return [...timelogAssignments, ...fallbackAssignments]
    .filter((assignment) => matchesSearch(assignment, search.trim()))
    .sort((a, b) => {
      if (a.dateFrom !== b.dateFrom) return a.dateFrom.localeCompare(b.dateFrom);
      if (a.dateTo !== b.dateTo) return a.dateTo.localeCompare(b.dateTo);
      return a.contractorName.localeCompare(b.contractorName);
    });
};

export const getCrewCalendarAssignments = (search = ''): CrewCalendarAssignment[] => {
  getCrew();
  getEvents();
  getTimelogs();
  const snapshot = getLocalAppState();
  return buildCrewCalendarAssignments({
    contractors: snapshot.contractors ?? [],
    events: snapshot.events ?? [],
    timelogs: snapshot.timelogs ?? [],
    eventCrewAssignments: snapshot.eventCrewAssignments ?? [],
    search,
  });
};

export const subscribeToCrewCalendarChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);
```

- [ ] **Step 4: Run the service test and confirm it passes**

Run:

```bash
npm test -- src/features/crew/services/crew-calendar.service.test.ts
```

Expected: PASS all four tests.

- [ ] **Step 5: Commit the service**

Run:

```bash
git add src/features/crew/services/crew-calendar.service.ts src/features/crew/services/crew-calendar.service.test.ts
git commit -m "feat: derive crew calendar assignments"
```

---

### Task 2: Crew Shift Calendar View

**Files:**
- Create: `src/views/CrewShiftCalendarView.test.tsx`
- Create: `src/views/CrewShiftCalendarView.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/views/CrewShiftCalendarView.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrewCalendarAssignment } from '../features/crew/services/crew-calendar.service';

const setCurrentTab = vi.fn();
const setSelectedEventId = vi.fn();
const setEventTab = vi.fn();
const getCrewCalendarAssignments = vi.fn();
const subscribeToCrewCalendarChanges = vi.fn(() => () => {});

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    searchQuery: 'petr',
    setCurrentTab,
    setSelectedEventId,
    setEventTab,
  }),
}));

vi.mock('../features/crew/services/crew-calendar.service', () => ({
  getCrewCalendarAssignments: (search: string) => getCrewCalendarAssignments(search),
  subscribeToCrewCalendarChanges: (listener: () => void) => subscribeToCrewCalendarChanges(listener),
}));

const assignment = (overrides: Partial<CrewCalendarAssignment> = {}): CrewCalendarAssignment => ({
  id: 'timelog-100-0',
  source: 'timelog',
  contractorProfileId: 'profile-1',
  contractorName: 'Petr Jouda',
  contractorInitials: 'PJ',
  contractorBg: '#E1F5EE',
  contractorFg: '#0F6E56',
  eventId: 10,
  eventSelectionId: 'event-uuid-10',
  eventName: 'Prima Festival',
  eventJob: 'PF001',
  eventCity: 'Plzen',
  dateFrom: '2026-05-16',
  dateTo: '2026-05-18',
  timeFrom: '09:00',
  timeTo: '18:00',
  dayCount: 3,
  days: [
    { d: '2026-05-16', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-17', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-18', f: '09:00', t: '18:00', type: 'provoz' },
  ],
  ...overrides,
});

describe('CrewShiftCalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00+02:00'));
    getCrewCalendarAssignments.mockReturnValue([assignment()]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a monthly crew-shift calendar with active assignment names', async () => {
    const { default: CrewShiftCalendarView } = await import('./CrewShiftCalendarView');
    render(<CrewShiftCalendarView onBack={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Kalendar smen' })).toBeInTheDocument();
    expect(screen.getByText('květen 2026')).toBeInTheDocument();
    expect(screen.getAllByTestId('crew-calendar-day')).toHaveLength(42);
    expect(screen.getAllByRole('button', { name: 'Petr Jouda' }).length).toBeGreaterThan(0);
    expect(getCrewCalendarAssignments).toHaveBeenCalledWith('petr');
  });

  it('opens assignment detail and can navigate to the assigned event', async () => {
    const { default: CrewShiftCalendarView } = await import('./CrewShiftCalendarView');
    render(<CrewShiftCalendarView onBack={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Petr Jouda' })[0]);

    expect(screen.getByRole('dialog', { name: 'Detail smeny' })).toBeInTheDocument();
    expect(screen.getByText('Prima Festival')).toBeInTheDocument();
    expect(screen.getByText('PF001')).toBeInTheDocument();
    expect(screen.getByText('16. 5. - 18. 5. 2026')).toBeInTheDocument();
    expect(screen.getByText('09:00 - 18:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Otevrit akci' }));

    expect(setCurrentTab).toHaveBeenCalledWith('events');
    expect(setSelectedEventId).toHaveBeenCalledWith('event-uuid-10');
    expect(setEventTab).toHaveBeenCalledWith('overview');
  });

  it('allows switching months', async () => {
    const { default: CrewShiftCalendarView } = await import('./CrewShiftCalendarView');
    render(<CrewShiftCalendarView onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dalsi mesic smen' }));
    expect(screen.getByText('červen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Predchozi mesic smen' }));
    expect(screen.getByText('květen 2026')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the component test and confirm it fails**

Run:

```bash
npm test -- src/views/CrewShiftCalendarView.test.tsx
```

Expected: FAIL because `./CrewShiftCalendarView` does not exist.

- [ ] **Step 3: Implement the calendar view**

Create `src/views/CrewShiftCalendarView.tsx` with these concrete behaviors:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { addDays, addMonths, format, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useAppContext } from '../context/useAppContext';
import { Button } from '../components/ui/button';
import {
  CrewCalendarAssignment,
  getCrewCalendarAssignments,
  subscribeToCrewCalendarChanges,
} from '../features/crew/services/crew-calendar.service';

interface CrewShiftCalendarViewProps {
  onBack: () => void;
}

const getStableCalendarDays = (calendarDate: Date) => {
  const start = startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 1 });
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
};

const formatDateRange = (dateFrom: string, dateTo: string) => {
  const from = parseISO(dateFrom);
  const to = parseISO(dateTo);
  if (dateFrom === dateTo) return format(from, 'd. M. yyyy', { locale: cs });
  return `${format(from, 'd. M.', { locale: cs })} - ${format(to, 'd. M. yyyy', { locale: cs })}`;
};

const formatShiftTime = (assignment: CrewCalendarAssignment) => (
  assignment.timeFrom && assignment.timeTo ? `${assignment.timeFrom} - ${assignment.timeTo}` : 'Cas neni zadan'
);

const isAssignmentActiveOnDate = (assignment: CrewCalendarAssignment, date: string) => (
  assignment.dateFrom <= date && assignment.dateTo >= date
);

const getDayClassName = (isCurrentMonth: boolean) => (
  `min-h-24 rounded-xl border p-2 text-left ${
    isCurrentMonth
      ? 'border-[color:var(--nodu-border)] bg-white/80'
      : 'border-transparent bg-[color:rgb(var(--nodu-text-rgb)/0.03)] text-[color:var(--nodu-text-soft)]'
  }`
);

const getTodayStyle = (isToday: boolean): React.CSSProperties | undefined => (
  isToday
    ? {
      backgroundColor: 'rgb(var(--nodu-accent-rgb) / 0.1)',
      borderColor: 'rgb(var(--nodu-accent-rgb) / 0.42)',
    }
    : undefined
);

const CrewShiftCalendarView = ({ onBack }: CrewShiftCalendarViewProps) => {
  const { searchQuery, setCurrentTab, setSelectedEventId, setEventTab } = useAppContext();
  const referenceDate = new Date().toISOString().split('T')[0];
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [assignments, setAssignments] = useState<CrewCalendarAssignment[]>(() => getCrewCalendarAssignments(searchQuery));
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const loadAssignments = useCallback(() => {
    setAssignments(getCrewCalendarAssignments(searchQuery));
  }, [searchQuery]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  useEffect(() => subscribeToCrewCalendarChanges(loadAssignments), [loadAssignments]);

  const calendarDays = useMemo(() => getStableCalendarDays(calendarMonth), [calendarMonth]);
  const selectedAssignment = selectedAssignmentId
    ? assignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null
    : null;

  const openEvent = (assignment: CrewCalendarAssignment) => {
    setCurrentTab('events');
    setSelectedEventId(assignment.eventSelectionId);
    setEventTab('overview');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--nodu-text-soft)] transition hover:text-[color:var(--nodu-accent)]"
          >
            <ChevronLeft size={14} />
            Zpet na seznam crew
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-[color:var(--nodu-accent)]" />
            <h1 className="text-lg font-semibold text-[color:var(--nodu-text)]">Kalendar smen</h1>
          </div>
          <p className="mt-1 text-xs text-[color:var(--nodu-text-soft)]">
            Jmena lidi zapsanych na akcich. Detail akce otevres po kliknuti na jmeno.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Predchozi mesic smen"
            onClick={() => {
              setCalendarMonth((current) => subMonths(current, 1));
              setSelectedAssignmentId(null);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="min-w-28 text-center text-xs font-semibold capitalize text-[color:var(--nodu-text-soft)]">
            {format(calendarMonth, 'LLLL yyyy', { locale: cs })}
          </div>
          <button
            type="button"
            aria-label="Dalsi mesic smen"
            onClick={() => {
              setCalendarMonth((current) => addMonths(current, 1));
              setSelectedAssignmentId(null);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)] transition hover:border-[color:var(--nodu-accent)] hover:text-[color:var(--nodu-accent)]"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 shadow-[0_18px_42px_rgba(47,38,31,0.08)]">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[color:var(--nodu-text-soft)]">
          {['Po', 'Ut', 'St', 'Ct', 'Pa', 'So', 'Ne'].map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const isToday = key === referenceDate;
            const dayAssignments = assignments.filter((assignment) => isAssignmentActiveOnDate(assignment, key));
            const visibleAssignments = dayAssignments.slice(0, 4);
            const hiddenCount = Math.max(0, dayAssignments.length - visibleAssignments.length);

            return (
              <div
                key={key}
                data-testid="crew-calendar-day"
                data-date={key}
                data-today={isToday ? 'true' : undefined}
                className={getDayClassName(isSameMonth(day, calendarMonth))}
                style={getTodayStyle(isToday)}
              >
                <div className="text-[11px] font-semibold">{format(day, 'd')}</div>
                <div className="mt-1 space-y-1">
                  {visibleAssignments.map((assignment) => (
                    <button
                      key={`${key}-${assignment.id}`}
                      type="button"
                      aria-label={assignment.contractorName}
                      title={`${assignment.contractorName} - ${assignment.eventName} - ${formatDateRange(assignment.dateFrom, assignment.dateTo)}`}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className="block w-full truncate rounded-md border px-1.5 py-1 text-left text-[9px] font-semibold transition ring-offset-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nodu-accent)]"
                      style={{
                        backgroundColor: assignment.contractorBg,
                        borderColor: assignment.contractorFg,
                        color: assignment.contractorFg,
                      }}
                    >
                      {assignment.contractorName}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentId(dayAssignments[4].id)}
                      className="block w-full rounded-md bg-[color:rgb(var(--nodu-text-rgb)/0.06)] px-1.5 py-1 text-left text-[9px] font-semibold text-[color:var(--nodu-text-soft)]"
                    >
                      +{hiddenCount} dalsich
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedAssignment && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-white/72 p-4 backdrop-blur-[2px]"
            onClick={() => setSelectedAssignmentId(null)}
          >
            <div
              role="dialog"
              aria-modal="false"
              aria-labelledby="crew-shift-detail-title"
              className="w-full max-w-md rounded-2xl border border-[color:var(--nodu-border)] bg-white p-4 text-left shadow-[0_18px_42px_rgba(47,38,31,0.16)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="crew-shift-detail-title" className="text-sm font-semibold text-[color:var(--nodu-text)]">Detail smeny</h2>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ backgroundColor: selectedAssignment.contractorBg, color: selectedAssignment.contractorFg }}
                    >
                      {selectedAssignment.contractorInitials}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--nodu-text)]">{selectedAssignment.contractorName}</div>
                      <div className="text-xs text-[color:var(--nodu-text-soft)]">{formatDateRange(selectedAssignment.dateFrom, selectedAssignment.dateTo)}</div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Zavrit detail smeny"
                  onClick={() => setSelectedAssignmentId(null)}
                  className="rounded-full p-1.5 text-[color:var(--nodu-text-soft)] transition hover:bg-[color:var(--nodu-accent-soft)] hover:text-[color:var(--nodu-text)]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-text-rgb)/0.03)] p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-[color:var(--nodu-text-soft)]">Akce</span>
                  <span className="text-right font-semibold text-[color:var(--nodu-text)]">{selectedAssignment.eventName}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[color:var(--nodu-text-soft)]">Job</span>
                  <span className="font-semibold text-[color:var(--nodu-text)]">{selectedAssignment.eventJob || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[color:var(--nodu-text-soft)]">Cas</span>
                  <span className="font-semibold text-[color:var(--nodu-text)]">{formatShiftTime(selectedAssignment)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[color:var(--nodu-text-soft)]">Mesto</span>
                  <span className="font-semibold text-[color:var(--nodu-text)]">{selectedAssignment.eventCity || '-'}</span>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button type="button" size="sm" onClick={() => openEvent(selectedAssignment)}>
                  Otevrit akci
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </motion.div>
  );
};

export default CrewShiftCalendarView;
```

- [ ] **Step 4: Run the component test and confirm it passes**

Run:

```bash
npm test -- src/views/CrewShiftCalendarView.test.tsx
```

Expected: PASS all three tests.

- [ ] **Step 5: Commit the calendar view**

Run:

```bash
git add src/views/CrewShiftCalendarView.tsx src/views/CrewShiftCalendarView.test.tsx
git commit -m "feat: add crew shift calendar view"
```

---

### Task 3: Integrate Calendar Into CrewView

**Files:**
- Modify: `src/views/CrewView.tsx`
- Create: `src/views/CrewView.test.tsx`

- [ ] **Step 1: Write failing CrewView integration tests**

Create `src/views/CrewView.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSelectedContractorProfileId = vi.fn();
const setDeleteConfirm = vi.fn();
const getCrew = vi.fn();
const subscribeToCrewChanges = vi.fn(() => () => {});

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    selectedContractorProfileId: null,
    setSelectedContractorProfileId,
    searchQuery: '',
    setDeleteConfirm,
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getCrew: (filters: unknown) => getCrew(filters),
  subscribeToCrewChanges: (listener: () => void) => subscribeToCrewChanges(listener),
}));

vi.mock('./CrewDetailView', () => ({
  default: () => <div>Crew detail</div>,
}));

vi.mock('./CrewShiftCalendarView', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h2>Kalendar smen</h2>
      <button type="button" onClick={onBack}>Zpet na seznam crew</button>
    </div>
  ),
}));

vi.mock('../components/modals/ContractorEditModal', () => ({
  default: () => null,
}));

describe('CrewView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCrew.mockReturnValue([
      {
        id: 1,
        profileId: 'profile-1',
        name: 'Petr Jouda',
        ii: 'PJ',
        bg: '#E1F5EE',
        fg: '#0F6E56',
        tags: [],
        events: 1,
        rate: 200,
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        city: 'Praha',
        reliable: true,
        rating: null,
        note: '',
      },
    ]);
  });

  it('opens the crew shift calendar from the Crew header and can return to the list', async () => {
    const { default: CrewView } = await import('./CrewView');
    render(<CrewView />);

    expect(screen.getByText('Petr Jouda')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kalendar smen' }));

    expect(screen.getByRole('heading', { name: 'Kalendar smen' })).toBeInTheDocument();
    expect(screen.queryByText('Petr Jouda')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zpet na seznam crew' }));

    expect(screen.getByText('Petr Jouda')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the CrewView test and confirm it fails**

Run:

```bash
npm test -- src/views/CrewView.test.tsx
```

Expected: FAIL because `Kalendar smen` does not exist in `CrewView`.

- [ ] **Step 3: Update CrewView imports**

Modify the top of `src/views/CrewView.tsx`:

```tsx
import { CalendarDays, Trash2 } from 'lucide-react';
```

Add:

```tsx
import CrewShiftCalendarView from './CrewShiftCalendarView';
```

- [ ] **Step 4: Add local view state and render calendar view**

Inside `CrewView`, after `editingContractor` state, add:

```tsx
const [crewViewMode, setCrewViewMode] = useState<'list' | 'calendar'>('list');
```

After the `selectedContractorProfileId` detail guard and before `formatRating`, add:

```tsx
if (crewViewMode === 'calendar') {
  return <CrewShiftCalendarView onBack={() => setCrewViewMode('list')} />;
}
```

- [ ] **Step 5: Add the calendar button next to `+ Novy clen`**

Replace the single `Button` in the Crew header with a two-button group:

```tsx
<div className="flex items-center gap-2">
  <Button
    type="button"
    variant="outline"
    onClick={() => setCrewViewMode('calendar')}
    size="sm"
    className="gap-1.5"
  >
    <CalendarDays size={14} />
    Kalendar smen
  </Button>
  <Button
    type="button"
    onClick={() => setEditingContractor(createEmptyContractor(nextContractorId))}
    size="sm"
  >
    + Novy clen
  </Button>
</div>
```

- [ ] **Step 6: Run the CrewView test and confirm it passes**

Run:

```bash
npm test -- src/views/CrewView.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the Crew integration**

Run:

```bash
git add src/views/CrewView.tsx src/views/CrewView.test.tsx
git commit -m "feat: open shift calendar from crew"
```

---

### Task 4: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/features/crew/services/crew-calendar.service.test.ts src/views/CrewShiftCalendarView.test.tsx src/views/CrewView.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run related existing tests**

Run:

```bash
npm test -- src/features/crew/services/crew-shift-display.test.ts src/views/EventsView.test.tsx src/views/FleetView.test.tsx
```

Expected: PASS. These cover nearby crew shift helpers, event navigation, and existing calendar layout patterns.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 4: Manual browser check**

Run the app:

```bash
npm run dev
```

Expected: Vite prints a local URL. Open the app, switch to Crew, click `Kalendar smen`, verify:

- month grid shows 42 day cells,
- active crew names appear on days with shifts,
- clicking a name opens `Detail smeny`,
- `Otevrit akci` navigates to the matching event detail,
- `Zpet na seznam crew` returns to the existing Crew table.

- [ ] **Step 5: Commit verification-only fixes if any**

If verification exposes a defect in files from this plan, fix only those files and commit:

```bash
git add src/features/crew/services/crew-calendar.service.ts src/features/crew/services/crew-calendar.service.test.ts src/views/CrewShiftCalendarView.tsx src/views/CrewShiftCalendarView.test.tsx src/views/CrewView.tsx src/views/CrewView.test.tsx
git commit -m "fix: polish crew shift calendar"
```

If no fix is needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: the plan adds the Crew header entry point, read-only calendar, name-first labels, click-to-detail behavior, `Otevrit akci`, search filtering, overflow handling, and existing-data-only derivation.
- Type consistency: `CrewCalendarAssignment` is introduced once in the service and imported by the view/tests.
- Scope control: no Supabase schema change, no Akce redesign, no availability/free-person workflow.

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CrewShiftCalendarView from './CrewShiftCalendarView';
import type { CrewCalendarAssignment } from '../features/crew/services/crew-calendar.service';

const mocks = vi.hoisted(() => ({
  getCrewCalendarAssignments: vi.fn(),
  subscribeToCrewCalendarChanges: vi.fn(),
  setCurrentTab: vi.fn(),
  setSelectedEventId: vi.fn(),
  setEventTab: vi.fn(),
  onBack: vi.fn(),
  searchQuery: '',
  crewCalendarListener: undefined as undefined | (() => void),
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

vi.mock('../features/crew/services/crew-calendar.service', () => ({
  getCrewCalendarAssignments: mocks.getCrewCalendarAssignments,
  subscribeToCrewCalendarChanges: mocks.subscribeToCrewCalendarChanges,
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    searchQuery: mocks.searchQuery,
    setCurrentTab: mocks.setCurrentTab,
    setSelectedEventId: mocks.setSelectedEventId,
    setEventTab: mocks.setEventTab,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

describe('CrewShiftCalendarView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00+02:00'));
    mocks.searchQuery = '';
    mocks.getCrewCalendarAssignments.mockReturnValue([
      assignment(),
      assignment({
        id: 'timelog-200-0',
        contractorProfileId: 'profile-2',
        contractorName: 'Karel Vomacka',
        contractorInitials: 'KV',
        eventId: 11,
        eventSelectionId: 11,
        eventName: 'Letni roadshow',
        eventJob: 'LR002',
        eventCity: 'Brno',
        dateFrom: '2026-05-16',
        dateTo: '2026-05-22',
        dayCount: 7,
      }),
    ]);
    mocks.subscribeToCrewCalendarChanges.mockImplementation((listener: () => void) => {
      mocks.crewCalendarListener = listener;
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders crew names inside a stable month calendar', () => {
    render(<CrewShiftCalendarView onBack={mocks.onBack} />);

    expect(screen.getByRole('heading', { name: 'Kalendář směn' })).toBeInTheDocument();
    expect(screen.getByText('květen 2026')).toBeInTheDocument();
    expect(screen.getAllByTestId('crew-shift-calendar-day')).toHaveLength(42);
    expect(screen.getAllByRole('button', { name: /Petr Jouda/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Karel Vomacka/i }).length).toBeGreaterThan(0);
  });

  it('opens assignment detail and navigates to the selected event', () => {
    render(<CrewShiftCalendarView onBack={mocks.onBack} />);

    fireEvent.click(screen.getAllByRole('button', { name: /Petr Jouda/i })[0]);

    expect(screen.getByRole('dialog', { name: 'Detail směny' })).toBeInTheDocument();
    expect(screen.getByTestId('crew-shift-assignment-detail')).toHaveTextContent('Petr Jouda');
    expect(screen.getByTestId('crew-shift-assignment-detail')).toHaveTextContent('Prima Festival');
    expect(screen.getByTestId('crew-shift-assignment-detail')).toHaveTextContent('PF001');
    expect(screen.getByTestId('crew-shift-assignment-detail')).toHaveTextContent('09:00 - 18:00');

    fireEvent.click(screen.getByRole('button', { name: 'Otevřít akci' }));

    expect(mocks.setCurrentTab).toHaveBeenCalledWith('events');
    expect(mocks.setSelectedEventId).toHaveBeenCalledWith('event-uuid-10');
    expect(mocks.setEventTab).toHaveBeenCalledWith('overview');
  });

  it('allows switching between months', () => {
    render(<CrewShiftCalendarView onBack={mocks.onBack} />);

    expect(screen.getByText('květen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Další měsíc směn' }));
    expect(screen.getByText('červen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc směn' }));
    expect(screen.getByText('květen 2026')).toBeInTheDocument();
  });

  it('passes the global crew search query into the assignment service', () => {
    mocks.searchQuery = 'karel';

    render(<CrewShiftCalendarView onBack={mocks.onBack} />);

    expect(mocks.getCrewCalendarAssignments).toHaveBeenCalledWith('karel');
  });

  it('reloads assignments when crew calendar data changes', () => {
    mocks.getCrewCalendarAssignments
      .mockReturnValueOnce([assignment()])
      .mockReturnValueOnce([
        assignment({
          id: 'timelog-300-0',
          contractorProfileId: 'profile-3',
          contractorName: 'Lenka Novakova',
          contractorInitials: 'LN',
        }),
      ]);

    render(<CrewShiftCalendarView onBack={mocks.onBack} />);

    expect(screen.getAllByRole('button', { name: /Petr Jouda/i }).length).toBeGreaterThan(0);

    act(() => {
      mocks.crewCalendarListener?.();
    });

    expect(screen.getAllByRole('button', { name: /Lenka Novakova/i }).length).toBeGreaterThan(0);
  });
});

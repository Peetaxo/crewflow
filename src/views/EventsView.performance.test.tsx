import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Event } from '../types';
import * as appData from '../lib/app-data';
import EventsView from './EventsView';

const events: Event[] = Array.from({ length: 3 }, (_, index) => ({
  id: index + 1, name: `Akce ${index + 1}`, job: 'JOB', city: 'Praha', client: '',
  startDate: '2026-05-11', endDate: '2026-05-14', needed: 2, filled: 0, status: 'upcoming', scheduleVersion: 2,
}));

vi.mock('../lib/app-config', () => ({ appDataSource: 'local', isLocalDataEnabled: true }));
vi.mock('../context/useAppContext', () => ({ useAppContext: () => ({
  role: 'crewhead', selectedEventId: null, searchQuery: '', eventsViewMode: 'list',
  eventsCalendarMode: 'month', eventsFilter: 'all', eventsCalendarDate: '2026-05-11', setEventsCalendarDate: vi.fn(),
}) }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ currentProfileId: 'manager' }) }));
vi.mock('../features/events/queries/useEventsQuery', () => ({ useEventsQuery: () => ({ data: events }) }));
vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({ useTimelogsQuery: () => ({ data: [] }) }));
vi.mock('../features/shift-workflows/MobileEventShiftWorkflowSelection', () => ({
  MobileEventShiftWorkflowSelection: ({ children }: { children: (selection: null) => React.ReactNode }) => children(null),
}));
vi.mock('../components/modals/EventEditModal', () => ({ default: () => null }));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('shares event detail reads across occurrences and date changes and refreshes assignments on a new snapshot', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-11T12:00:00'));
  appData.updateLocalAppState((snapshot) => ({ ...snapshot, events }));
  const read = vi.spyOn(appData, 'getLocalAppState');
  render(<EventsView />);
  expect(screen.getAllByRole('heading', { name: 'Akce 1' })).toHaveLength(4);
  expect(read.mock.calls.length).toBeLessThanOrEqual(1);

  read.mockClear();
  fireEvent.click(screen.getByLabelText('Vybrat datum akci'));
  fireEvent.click(screen.getByLabelText('Zobrazit akce od 13. května 2026'));
  expect(screen.getAllByRole('heading', { name: 'Akce 1' })).toHaveLength(2);
  expect(read).not.toHaveBeenCalled();

  act(() => {
    appData.updateLocalAppState((snapshot) => ({
      ...snapshot,
      eventCrewAssignments: [{ eventId: 1, contractorProfileId: 'petr', name: 'Petr Nový' }],
    }));
  });
  expect(screen.getAllByText('Petr Nový')).toHaveLength(2);
});

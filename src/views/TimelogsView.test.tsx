import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = {
  setEditingTimelog: vi.fn(),
  role: 'crewhead',
  searchQuery: '',
  timelogFilter: 'all',
  setTimelogFilter: vi.fn(),
};

const events = [
  {
    id: 1,
    name: 'Ploom Chodov',
    job: 'JTI001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'upcoming' as const,
    client: 'JTI',
  },
  {
    id: 2,
    name: 'Ploom Zlicin',
    job: 'JTI001',
    startDate: '2026-04-21',
    endDate: '2026-04-21',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'upcoming' as const,
    client: 'JTI',
  },
];

const timelogs = [
  {
    id: 1,
    eid: 1,
    contractorProfileId: 'profile-1',
    days: [{ d: '2026-04-20', f: '09:00', t: '14:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'draft' as const,
  },
  {
    id: 2,
    eid: 2,
    contractorProfileId: 'profile-2',
    days: [{ d: '2026-04-21', f: '09:00', t: '14:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'draft' as const,
  },
];

const pendingCrewheadTimelogs = [
  {
    ...timelogs[0],
    status: 'pending_ch' as const,
  },
];

const contractors = [
  {
    id: 1,
    profileId: 'profile-1',
    name: 'Crew One',
    ii: 'CO',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
  {
    id: 2,
    profileId: 'profile-2',
    name: 'Crew Two',
    ii: 'CT',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 1,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
];

describe('TimelogsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('groups all timelogs by event instead of job number', async () => {
    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => mockContext,
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: timelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus: vi.fn(),
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    expect(screen.getByRole('button', { name: 'Po akci' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Po Job Number' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Ploom Chodov').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ploom Zlicin').length).toBeGreaterThan(0);
  });

  it('lets COO approve a CrewHead step without final COO approval', async () => {
    const updateTimelogStatus = vi.fn().mockResolvedValue({ ...pendingCrewheadTimelogs[0], status: 'pending_coo' });

    vi.doMock('../context/useAppContext', () => ({
      useAppContext: () => ({
        ...mockContext,
        role: 'coo',
        timelogFilter: 'pending_ch',
      }),
    }));

    vi.doMock('../app/providers/useAuth', () => ({
      useAuth: () => ({ currentProfileId: null }),
    }));

    vi.doMock('../features/timelogs/queries/useTimelogsQuery', () => ({
      useTimelogsQuery: () => ({ data: pendingCrewheadTimelogs }),
    }));

    vi.doMock('../features/timelogs/services/timelogs.service', () => ({
      getTimelogDependencies: () => ({ contractors, events }),
      updateTimelogStatus,
    }));

    const { default: TimelogsView } = await import('./TimelogsView');

    render(<TimelogsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Schválit za CH' }));

    expect(updateTimelogStatus).toHaveBeenCalledWith(1, 'ch');
    expect(updateTimelogStatus).not.toHaveBeenCalledWith(1, 'coo');
  });
});

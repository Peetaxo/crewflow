import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateTimelogStatuses = vi.hoisted(() => vi.fn());

const event = {
  id: 1,
  name: 'Expo Praha',
  job: 'EXP001',
  startDate: '2026-09-20',
  endDate: '2026-09-20',
  city: 'Praha',
  client: 'Expo',
  needed: 2,
  filled: 2,
  status: 'upcoming' as const,
};

const contractors = [
  { id: 1, profileId: 'crew-1', name: 'Crew One', ii: 'CO', bg: '#000', fg: '#fff', rate: 250 },
  { id: 2, profileId: 'crew-2', name: 'Crew Two', ii: 'CT', bg: '#000', fg: '#fff', rate: 250 },
  { id: 3, profileId: 'profile-me', name: 'Current COO', ii: 'CC', bg: '#000', fg: '#fff', rate: 250 },
  { id: 4, profileId: 'profile-other', name: 'Other COO', ii: 'OC', bg: '#000', fg: '#fff', rate: 250 },
];

const approval = (approverProfileId: string) => ({
  id: `approval-${approverProfileId}`,
  approvalRoundId: `round-${approverProfileId}`,
  timelogId: `timelog-${approverProfileId}`,
  approverProfileId,
  status: 'pending' as const,
  supersededAt: null,
});

const timelogs = [
  {
    id: 1,
    eid: 1,
    contractorProfileId: 'crew-1',
    days: [{ d: '2026-09-20', f: '08:00', t: '16:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'pending_coo' as const,
    approvals: [approval('profile-me')],
  },
  {
    id: 2,
    eid: 1,
    contractorProfileId: 'crew-2',
    days: [{ d: '2026-09-20', f: '09:00', t: '17:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'pending_coo' as const,
    approvals: [approval('profile-other')],
  },
  {
    id: 3,
    eid: 1,
    contractorProfileId: 'crew-2',
    days: [{ d: '2026-09-20', f: '10:00', t: '18:00', type: 'provoz' as const }],
    km: 0,
    note: '',
    status: 'pending_coo' as const,
    approvals: [],
  },
];
let queriedTimelogs = timelogs;

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role: 'coo',
    filteredEvents: [event],
    searchQuery: '',
    setEditingTimelog: vi.fn(),
  }),
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({ currentProfileId: 'profile-me' }),
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: queriedTimelogs }),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({ contractors, events: [event] }),
  updateTimelogStatuses,
}));

describe('ApprovalsView targeted approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queriedTimelogs = timelogs;
    updateTimelogStatuses.mockResolvedValue([]);
  });

  it('counts and approves only current-assignee plus legacy reports while showing the other COO readonly', async () => {
    const { default: ApprovalsView } = await import('./ApprovalsView');
    render(<ApprovalsView />);

    expect(screen.getByText('2 ceka')).toBeInTheDocument();
    expect(screen.getByText('Schvaluje: Current COO')).toBeInTheDocument();
    expect(screen.getByText('Schvaluje: Other COO')).toBeInTheDocument();
    expect(screen.queryByText(/financni prehled/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vrátit výkaz Crew One #1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vrátit výkaz Crew Two #2' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vrátit výkaz Crew Two #3' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkaz Crew One #1' }));
    expect(screen.getByRole('dialog', { name: 'Vrátit výkaz k opravě' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Důvod vrácení'), { target: { value: '  Doplň pauzu.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkaz' }));

    await waitFor(() => {
      expect(updateTimelogStatuses).toHaveBeenCalledWith([1], 'rej', {
        currentProfileId: 'profile-me',
        note: 'Doplň pauzu.',
      });
    });
    expect(screen.queryByRole('dialog', { name: 'Vrátit výkaz k opravě' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vrátit výkaz Crew Two #3' }));
    expect(screen.getByRole('dialog', { name: 'Vrátit výkaz k opravě' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zrušit' }));

    fireEvent.click(screen.getByRole('button', { name: /Schvalit moje vykazy.*\(2\)/i }));

    await waitFor(() => {
      expect(updateTimelogStatuses).toHaveBeenCalledWith([1, 3], 'coo', {
        currentProfileId: 'profile-me',
      });
    });
  });

  it('keeps another targeted COO report visible without exposing an approval action', async () => {
    queriedTimelogs = [timelogs[1]];
    const { default: ApprovalsView } = await import('./ApprovalsView');
    render(<ApprovalsView />);

    expect(screen.getByText('0 ceka')).toBeInTheDocument();
    expect(screen.getByText('Schvaluje: Other COO')).toBeInTheDocument();
    expect(screen.queryByText('Vse schvaleno')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Schvalit moje vykazy/i })).not.toBeInTheDocument();
  });
});

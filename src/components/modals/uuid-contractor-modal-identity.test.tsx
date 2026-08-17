import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, ReceiptItem, Timelog } from '../../types';

type ModalContractor = {
  id: number;
  profileId?: string;
  name: string;
  rate?: number;
  ii?: string;
  bg?: string;
  fg?: string;
  tags?: string[];
  reliable?: boolean;
  city?: string;
};

type ModalEvent = Pick<Event, 'id' | 'name' | 'startDate' | 'endDate'> & Partial<Event>;

type MockAppContext = {
  role: 'crewhead';
  editingTimelog: Timelog | null;
  setEditingTimelog: (value: Timelog | null) => void;
  setCurrentTab: (value: string) => void;
  setSelectedContractorProfileId: (value: string | null) => void;
  editingReceipt: ReceiptItem | null;
  setEditingReceipt: (value: ReceiptItem | null) => void;
};

const setEditingTimelog = vi.fn();
const setEditingReceipt = vi.fn();
const setCurrentTab = vi.fn();
const setSelectedContractorProfileId = vi.fn();

let mockAppContext: MockAppContext = {
  role: 'crewhead' as const,
  editingTimelog: null,
  setEditingTimelog,
  setCurrentTab,
  setSelectedContractorProfileId,
  editingReceipt: null,
  setEditingReceipt,
};

let mockTimelogDependencies = {
  contractors: [] as ModalContractor[],
  events: [] as ModalEvent[],
};

let mockReceiptDependencies = {
  contractors: [] as ModalContractor[],
  events: [] as ModalEvent[],
};

let mockCrew = [] as ModalContractor[];
const assignCrewToEvent = vi.fn();
const getContractorConflictsForEvent = vi.fn(() => new Map());
const getEventDetailData = vi.fn(() => ({ timelogs: [] }));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => mockTimelogDependencies,
  saveTimelog: vi.fn(),
}));

vi.mock('../../features/receipts/services/receipts.service', () => ({
  getReceiptDependencies: () => mockReceiptDependencies,
  saveReceipt: vi.fn(),
}));

vi.mock('../../features/crew/services/crew.service', () => ({
  getCrew: () => mockCrew,
}));

vi.mock('../../features/events/services/events.service', () => ({
  assignCrewToEvent: (...args: unknown[]) => assignCrewToEvent(...args),
  getContractorConflictsForEvent: (...args: unknown[]) => getContractorConflictsForEvent(...args),
  getEventDetailData: (...args: unknown[]) => getEventDetailData(...args),
}));

import TimelogEditModal from './TimelogEditModal';
import ReceiptEditModal from './ReceiptEditModal';
import AssignCrewModal from './AssignCrewModal';

describe('modal contractor identity handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignCrewToEvent.mockReset();
    assignCrewToEvent.mockResolvedValue(undefined);
    mockAppContext = {
      role: 'crewhead',
      editingTimelog: null,
      setEditingTimelog,
      setCurrentTab,
      setSelectedContractorProfileId,
      editingReceipt: null,
      setEditingReceipt,
    };
    mockTimelogDependencies = { contractors: [], events: [] };
    mockReceiptDependencies = { contractors: [], events: [] };
    mockCrew = [];
    getContractorConflictsForEvent.mockReturnValue(new Map());
    getEventDetailData.mockReturnValue({ timelogs: [] });
  });

  it('resolves timelog contractor details by contractorProfileId', () => {
    mockAppContext.editingTimelog = {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-24', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    };
    mockTimelogDependencies = {
      contractors: [{
        id: 1,
        profileId: 'profile-uuid-1',
        name: 'UUID Contractor',
        rate: 250,
      }],
      events: [{
        id: 1,
        name: 'Test Event',
        startDate: '2026-04-24',
        endDate: '2026-04-24',
      }],
    };

    render(<TimelogEditModal />);

    expect(screen.getByText(/UUID Contractor · Test Event/)).toBeInTheDocument();
  });

  it('opens contractor detail from the timelog modal avatar', () => {
    mockAppContext.editingTimelog = {
      id: 1,
      eid: 1,
      contractorProfileId: 'profile-uuid-1',
      days: [{ d: '2026-04-24', f: '08:00', t: '16:00', type: 'instal' }],
      km: 0,
      note: '',
      status: 'draft',
    };
    mockTimelogDependencies = {
      contractors: [{
        id: 1,
        profileId: 'profile-uuid-1',
        name: 'UUID Contractor',
        rate: 250,
        ii: 'UC',
        bg: '#dbeafe',
        fg: '#1d4ed8',
      }],
      events: [{
        id: 1,
        name: 'Test Event',
        startDate: '2026-04-24',
        endDate: '2026-04-24',
      }],
    };

    render(<TimelogEditModal />);

    fireEvent.click(screen.getByRole('button', { name: /Otevrit detail clena crew UUID Contractor/i }));

    expect(setEditingTimelog).toHaveBeenCalledWith(null);
    expect(setSelectedContractorProfileId).toHaveBeenCalledWith('profile-uuid-1');
    expect(setCurrentTab).toHaveBeenCalledWith('crew');
  });

  it('updates receipt contractor using contractorProfileId from the selected crew member', () => {
    mockAppContext.editingReceipt = {
      id: 1,
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      job: 'JOB-1',
      title: 'Receipt',
      vendor: 'Vendor',
      amount: 100,
      paidAt: '2026-04-24',
      note: '',
      status: 'draft',
    };
    mockReceiptDependencies = {
      contractors: [
        { id: 1, profileId: 'profile-uuid-1', name: 'Contractor One' },
        { id: 2, profileId: 'profile-uuid-2', name: 'Contractor Two' },
      ],
      events: [{ id: 1, job: 'JOB-1', name: 'Test Event', client: 'Client' }],
    };

    render(<ReceiptEditModal />);

    fireEvent.change(screen.getByLabelText('Crew'), { target: { value: 'profile-uuid-2' } });

    expect(setEditingReceipt).toHaveBeenCalledWith(expect.objectContaining({
      contractorProfileId: 'profile-uuid-2',
    }));
  });

  it('treats assigned crew as assigned based on contractorProfileId', () => {
    mockCrew = [
      {
        id: 1,
        profileId: 'profile-uuid-1',
        name: 'Assigned Contractor',
        ii: 'AC',
        bg: '#000',
        fg: '#fff',
        tags: [],
        reliable: true,
        city: 'Praha',
      },
      {
        id: 2,
        profileId: 'profile-uuid-2',
        name: 'Free Contractor',
        ii: 'FC',
        bg: '#111',
        fg: '#fff',
        tags: [],
        reliable: true,
        city: 'Brno',
      },
    ];
    getEventDetailData.mockReturnValue({
      timelogs: [{ contractorProfileId: 'profile-uuid-1' }],
    });

    render(
      <AssignCrewModal
        event={{
          id: 1,
          name: 'Test Event',
          job: 'JOB-1',
          startDate: '2026-04-24',
          endDate: '2026-04-24',
          city: 'Praha',
          needed: 1,
          filled: 1,
          status: 'upcoming',
          client: 'Client',
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Prirazen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assigned Contractor/i })).toBeDisabled();
  });

  it('assigns crew through contractorProfileId only once while the request is pending', async () => {
    let resolveAssignment!: () => void;
    assignCrewToEvent.mockReturnValue(new Promise<void>((resolve) => { resolveAssignment = resolve; }));
    mockCrew = [
      {
        id: 2,
        profileId: 'profile-uuid-2',
        name: 'Free Contractor',
        ii: 'FC',
        bg: '#111',
        fg: '#fff',
        tags: [],
        reliable: true,
        city: 'Brno',
      },
      {
        id: 3,
        profileId: 'profile-uuid-3',
        name: 'Other Contractor',
        ii: 'OC',
        bg: '#222',
        fg: '#fff',
        tags: [],
        reliable: true,
        city: 'Praha',
      },
    ];

    render(
      <AssignCrewModal
        event={{
          id: 1,
          name: 'Test Event',
          job: 'JOB-1',
          startDate: '2026-04-24',
          endDate: '2026-04-24',
          city: 'Praha',
          needed: 1,
          filled: 0,
          status: 'upcoming',
          client: 'Client',
        }}
        onClose={vi.fn()}
      />,
    );

    const contractorRow = screen.getByRole('button', { name: /Free Contractor/i });

    fireEvent.click(contractorRow);
    fireEvent.click(contractorRow);

    expect(assignCrewToEvent).toHaveBeenCalledWith(1, 'profile-uuid-2', undefined);
    expect(assignCrewToEvent).toHaveBeenCalledTimes(1);
    expect(contractorRow).toBeDisabled();
    expect(contractorRow).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /Other Contractor/i })).toBeDisabled();

    resolveAssignment();

    await waitFor(() => expect(contractorRow).toBeEnabled());
  });

  it('clears the assignment lock after an error and permits retry', async () => {
    assignCrewToEvent.mockRejectedValueOnce(new Error('Assignment failed')).mockResolvedValueOnce(undefined);
    mockCrew = [{
      id: 2,
      profileId: 'profile-uuid-2',
      name: 'Free Contractor',
      ii: 'FC',
      bg: '#111',
      fg: '#fff',
      tags: [],
      reliable: true,
      city: 'Brno',
    }];

    render(
      <AssignCrewModal
        event={{
          id: 1,
          name: 'Test Event',
          job: 'JOB-1',
          startDate: '2026-04-24',
          endDate: '2026-04-24',
          city: 'Praha',
          needed: 1,
          filled: 0,
          status: 'upcoming',
          client: 'Client',
        }}
        onClose={vi.fn()}
      />,
    );

    const contractorRow = screen.getByRole('button', { name: /Free Contractor/i });
    fireEvent.click(contractorRow);

    await waitFor(() => expect(contractorRow).toBeEnabled());

    fireEvent.click(contractorRow);
    await waitFor(() => expect(assignCrewToEvent).toHaveBeenCalledTimes(2));
  });

  it('submits a multi-phase assignment only once while confirmation is pending', async () => {
    let resolveAssignment!: () => void;
    assignCrewToEvent.mockReturnValue(new Promise<void>((resolve) => { resolveAssignment = resolve; }));
    mockCrew = [{
      id: 2,
      profileId: 'profile-uuid-2',
      name: 'Free Contractor',
      ii: 'FC',
      bg: '#111',
      fg: '#fff',
      tags: [],
      reliable: true,
      city: 'Brno',
    }];

    render(
      <AssignCrewModal
        event={{
          id: 1,
          name: 'Test Event',
          job: 'JOB-1',
          startDate: '2026-04-24',
          endDate: '2026-04-25',
          city: 'Praha',
          needed: 1,
          filled: 0,
          status: 'upcoming',
          client: 'Client',
          showDayTypes: true,
          dayTypes: {
            '2026-04-24': 'instal',
            '2026-04-25': 'provoz',
          },
        }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Free Contractor/i }));
    fireEvent.click(screen.getByRole('button', { name: /^I Instal$/i }));
    const confirm = screen.getByRole('button', { name: 'Potvrdit prirazeni' });

    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(assignCrewToEvent).toHaveBeenCalledWith(1, 'profile-uuid-2', ['instal']);
    expect(assignCrewToEvent).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: /Free Contractor/i })).toBeDisabled();

    resolveAssignment();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Potvrdit prirazeni' })).not.toBeInTheDocument());
  });

  it('assigns the only available day type immediately on typed single-phase events', async () => {
    mockCrew = [
      {
        id: 2,
        profileId: 'profile-uuid-2',
        name: 'David Hora',
        ii: 'DH',
        bg: '#111',
        fg: '#fff',
        tags: [],
        reliable: true,
        city: '',
      },
    ];

    render(
      <AssignCrewModal
        event={{
          id: 1,
          name: 'Nadace',
          job: 'ORL064',
          startDate: '2026-05-28',
          endDate: '2026-05-28',
          city: 'Praha',
          needed: 2,
          filled: 1,
          status: 'upcoming',
          client: 'NEXT LEVEL',
          showDayTypes: true,
          dayTypes: {
            '2026-05-28': 'provoz',
          },
        }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /David Hora/i }));

    await waitFor(() => {
      expect(assignCrewToEvent).toHaveBeenCalledWith(1, 'profile-uuid-2', ['provoz']);
    });
  });
});

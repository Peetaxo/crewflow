import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
  editingReceipt: ReceiptItem | null;
  setEditingReceipt: (value: ReceiptItem | null) => void;
};

const setEditingTimelog = vi.fn();
const setEditingReceipt = vi.fn();

let mockAppContext: MockAppContext = {
  role: 'crewhead' as const,
  editingTimelog: null,
  setEditingTimelog,
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

vi.mock('../../context/AppContext', () => ({
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
    mockAppContext = {
      role: 'crewhead',
      editingTimelog: null,
      setEditingTimelog,
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
      cid: 999,
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

  it('updates receipt contractor using contractorProfileId from the selected crew member', () => {
    mockAppContext.editingReceipt = {
      id: 1,
      cid: 1,
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
      cid: 2,
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
      timelogs: [{ cid: 999, contractorProfileId: 'profile-uuid-1' }],
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

  it('assigns crew through contractorProfileId', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Free Contractor/i }));

    expect(assignCrewToEvent).toHaveBeenCalledWith(1, 'profile-uuid-2', undefined);
  });
});

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAppContext = {
  role: 'crewhead',
  searchQuery: '',
  setCurrentTab: vi.fn(),
  setTimelogFilter: vi.fn(),
  setSelectedEventId: vi.fn(),
  setEventTab: vi.fn(),
};

const mockEvents = [
  {
    id: 101,
    name: 'Nodu pilot Prague',
    job: 'JOB-101',
    startDate: '2026-04-28',
    endDate: '2026-04-29',
    city: 'Praha',
    needed: 8,
    filled: 6,
  },
];

const mockTimelogs = [
  {
    id: 'tl-1',
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    status: 'pending_ch',
    days: [{ f: '08:00', t: '16:00' }],
  },
];

const mockReceipts = [
  {
    id: 'receipt-1',
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    title: 'Taxi',
    vendor: 'Liftago',
    job: 'JOB-101',
    status: 'submitted',
  },
];

const mockInvoices = [
  {
    id: 'inv-1',
    eid: 101,
    cid: 1,
    contractorProfileId: 'profile-1',
    job: 'JOB-101',
    status: 'sent',
  },
];

const mockDependencies = {
  contractors: [
    {
      id: 1,
      profileId: 'profile-1',
      name: 'Alex Novak',
      ii: 'AN',
      bg: '#F1E1D2',
      fg: '#7A4A20',
      rate: 350,
    },
  ],
};

vi.mock('../context/AppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../features/events/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: mockEvents, isLoading: false, error: null }),
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({ data: mockTimelogs, isLoading: false, error: null }),
}));

vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({
  useReceiptsQuery: () => ({ data: mockReceipts, isLoading: false, error: null }),
}));

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: mockInvoices, isLoading: false, error: null }),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => mockDependencies,
}));

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dashboard header, stat chip, nodu job badge, and no decorative stat accent dots', async () => {
    const { default: DashboardView } = await import('./DashboardView');
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(container.querySelector('.nodu-stat-chip')).not.toBeNull();
    expect(container.querySelector('.nodu-job-badge')).not.toBeNull();
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();
  });
});

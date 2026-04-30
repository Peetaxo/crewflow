import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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
    startDate: '2026-12-28',
    endDate: '2026-12-29',
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

vi.mock('../context/useAppContext', () => ({
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

  it('renders the dashboard with semantic nodu helpers instead of light-only surface utilities', async () => {
    const { default: DashboardView } = await import('./DashboardView');
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveClass('nodu-dashboard-heading');
    expect(container.querySelector('.nodu-stat-chip')).not.toBeNull();
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();

    const timelogsHeading = screen.getByRole('heading', { name: 'Ke schválení' });
    const timelogPanel = timelogsHeading.closest('.nodu-dashboard-panel');
    const eventsHeading = screen.getByRole('heading', { name: 'Nadchazejici akce' });
    const eventsPanel = eventsHeading.closest('.nodu-dashboard-panel');
    const timelogRow = within(timelogPanel as HTMLElement).getByRole('button', { name: /Alex Novak/i });
    const upcomingEventRow = within(eventsPanel as HTMLElement).getByRole('button', { name: /Nodu pilot Prague/i });

    expect(timelogPanel).not.toBeNull();
    expect(within(timelogPanel as HTMLElement).getByText('JOB-101')).toHaveClass('nodu-job-badge');
    expect(timelogRow).toHaveClass('nodu-dashboard-row', 'border-b');
    expect(upcomingEventRow).toHaveClass('nodu-dashboard-row', 'border');
    expect(within(timelogRow).getByText('Alex Novak')).toHaveClass('nodu-dashboard-row-title');
    expect(within(timelogRow).getByText('Nodu pilot Prague').closest('.nodu-dashboard-row-meta')).not.toBeNull();
    expect(within(timelogRow).getByText('8.0h')).toHaveClass('nodu-dashboard-row-value');
    expect(timelogRow.querySelector('.nodu-dashboard-action')).not.toBeNull();
    expect(timelogRow.querySelector('.nodu-dashboard-action')?.className).not.toContain('bg-white');
    expect(within(upcomingEventRow).getByText('Nodu pilot Prague')).toHaveClass('nodu-dashboard-row-title');
    expect(upcomingEventRow.querySelector('.nodu-dashboard-progress-track')).not.toBeNull();
    expect(timelogRow.className).not.toContain('border-[#f1e4d6]');
    expect(upcomingEventRow.className).not.toContain('border-[#f1e4d6]');
  });

  it('keeps dashboard helper styles wired to nodu tokens and preserves row borders for dark mode', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const headingRule = css.match(/\.nodu-dashboard-heading\s*\{[\s\S]*?\}/)?.[0];
    const panelRule = css.match(/\.nodu-dashboard-panel\s*\{[\s\S]*?\}/)?.[0];
    const rowRule = css.match(/\.nodu-dashboard-row\s*\{[\s\S]*?\}/)?.[0];
    const rowHoverRule = css.match(/\.nodu-dashboard-row:hover\s*\{[\s\S]*?\}/)?.[0];
    const actionRule = css.match(/\.nodu-dashboard-action\s*\{[\s\S]*?\}/)?.[0];
    const badgeRule = css.match(/\.nodu-event-meta-badge\s*\{[\s\S]*?\}/)?.[0];
    const progressRule = css.match(/\.nodu-dashboard-progress-track\s*\{[\s\S]*?\}/)?.[0];

    expect(headingRule).toContain('color: var(--nodu-text);');
    expect(panelRule).toContain('var(--nodu-surface-rgb)');
    expect(panelRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(rowRule).toContain('border-color: var(--nodu-border);');
    expect(rowRule).toContain('box-shadow: inset 0 0 0 1px transparent;');
    expect(rowRule).not.toContain('border: 1px solid transparent;');
    expect(rowHoverRule).toContain('var(--nodu-accent-rgb)');
    expect(actionRule).toContain('var(--nodu-surface-rgb)');
    expect(actionRule).toContain('var(--nodu-accent)');
    expect(badgeRule).toContain('var(--nodu-surface-muted-rgb)');
    expect(badgeRule).toContain('var(--nodu-text-soft)');
    expect(progressRule).toContain('var(--nodu-surface-muted-rgb)');
  });
});

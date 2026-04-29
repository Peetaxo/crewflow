import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectStatsView from './ProjectStatsView';

const mocks = vi.hoisted(() => ({
  deleteBudgetItem: vi.fn(),
  saveBudgetItem: vi.fn(),
  saveBudgetPackage: vi.fn(),
  setSelectedProjectIdForStats: vi.fn(),
  toastError: vi.fn(),
  timelogs: [] as Array<{
    id: number;
    eid: number;
    contractorProfileId: string;
    days: Array<{ d: string; f: string; t: string; type: 'provoz' }>;
    km: number;
    note: string;
    status: 'draft';
  }>,
  contractors: [] as Array<{
    id: number;
    profileId: string;
    name: string;
    ii: string;
    bg: string;
    fg: string;
    tags: string[];
    events: number;
    rate: number;
    phone: string;
    email: string;
    ico: string;
    dic: string;
    bank: string;
    city: string;
    reliable: boolean;
    note: string;
  }>,
  invoices: [] as Array<{
    id: string;
    eid: number;
    hours: number;
    hAmt: number;
    km: number;
    kAmt: number;
    total: number;
    job: string;
    status: 'sent';
    sentAt: null;
  }>,
}));

const project = {
  id: 'JTI001',
  name: 'JTI 2026',
  client: 'JTI',
  note: '',
  createdAt: '2026-04-28',
};

const events = [
  { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
  { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
];

const budgetOverview = {
  projectId: 'JTI001',
  plannedTotal: 7000,
  actualTotal: 3500,
  variance: 3500,
  packages: [
    {
      id: 1,
      projectId: 'JTI001',
      name: 'Majales',
      note: '',
      eventIds: [1, 2],
      createdAt: '2026-04-28',
      linkedEvents: events,
      plannedTotal: 7000,
      actualTotal: 3500,
      variance: 3500,
      items: [
        { id: 1, projectId: 'JTI001', budgetPackageId: 1, eventId: 1, section: 'TRANSPORTATION', name: 'Van', units: 'km/action/czk', amount: 10, quantity: 2, unitPrice: 100, note: '', createdAt: '2026-04-28' },
        { id: 2, projectId: 'JTI001', budgetPackageId: 1, eventId: null, section: 'LOCATION', name: 'Fee', units: 'pcs/action/czk', amount: 1, quantity: 1, unitPrice: 5000, note: '', createdAt: '2026-04-28' },
      ],
    },
  ],
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('recharts', () => ({
  Cell: () => null,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    selectedProjectIdForStats: 'JTI001',
    setSelectedProjectIdForStats: mocks.setSelectedProjectIdForStats,
  }),
}));

vi.mock('../features/projects/services/projects.service', () => ({
  getProjectById: () => project,
  getProjectDependencies: () => ({
    projects: [project],
    events,
    invoices: mocks.invoices,
    clients: [],
  }),
  subscribeToProjectChanges: () => vi.fn(),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({ contractors: mocks.contractors }),
  getTimelogs: () => mocks.timelogs,
  subscribeToTimelogChanges: () => vi.fn(),
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  getReceipts: () => [
    { id: 1, eid: 2, job: 'JTI001', title: 'Parking', vendor: 'Garage', amount: 500, paidAt: '2026-05-02', note: '', status: 'approved' },
  ],
  subscribeToReceiptChanges: () => vi.fn(),
}));

vi.mock('../features/budgets/services/budgets.service', () => ({
  getBudgetDependencies: () => ({
    projects: [project],
    events,
    budgetPackages: budgetOverview.packages,
    budgetItems: budgetOverview.packages.flatMap((budgetPackage) => budgetPackage.items),
  }),
  getProjectBudgetOverview: () => budgetOverview,
  deleteBudgetItem: mocks.deleteBudgetItem,
  saveBudgetItem: mocks.saveBudgetItem,
  saveBudgetPackage: mocks.saveBudgetPackage,
  subscribeToBudgetChanges: () => vi.fn(),
}));

describe('ProjectStatsView budget section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteBudgetItem.mockResolvedValue({});
    mocks.saveBudgetItem.mockResolvedValue({});
    mocks.saveBudgetPackage.mockResolvedValue({});
    mocks.timelogs = [];
    mocks.contractors = [];
    mocks.invoices = [
      { id: 'inv-1', eid: 1, hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 3000, job: 'JTI001', status: 'sent', sentAt: null },
    ];
  });

  it('renders project budget summary, packages, events, sections, and items', () => {
    render(<ProjectStatsView />);

    expect(screen.getByRole('heading', { name: 'Rozpocet' })).toBeInTheDocument();
    expect(screen.getByText('Planovany rozpocet')).toBeInTheDocument();
    expect(screen.getByText('Skutecne naklady')).toBeInTheDocument();
    expect(screen.getAllByText('7 000 Kč').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3 500 Kč').length).toBeGreaterThan(0);

    const packagePanel = screen.getByTestId('budget-package-1');
    expect(within(packagePanel).getByRole('heading', { name: 'Majales' })).toBeInTheDocument();
    expect(within(packagePanel).getAllByText('Majales priprava').length).toBeGreaterThan(0);
    expect(within(packagePanel).getAllByText('Majales rozvozy').length).toBeGreaterThan(0);
    expect(within(packagePanel).getByText('TRANSPORTATION')).toBeInTheDocument();
    expect(within(packagePanel).getByText('LOCATION')).toBeInTheDocument();
    expect(within(packagePanel).getByText('Van')).toBeInTheDocument();
    expect(within(packagePanel).getByText('Fee')).toBeInTheDocument();
  });

  it('saves a new budget package linked to selected project events', async () => {
    render(<ProjectStatsView />);

    fireEvent.change(screen.getByLabelText('Nazev baliku'), { target: { value: 'Bitva o Prahu' } });
    fireEvent.click(screen.getByLabelText('Majales priprava'));
    fireEvent.click(screen.getByRole('button', { name: 'Pridat balik' }));

    await waitFor(() => {
      expect(mocks.saveBudgetPackage).toHaveBeenCalledWith({
        projectId: 'JTI001',
        name: 'Bitva o Prahu',
        note: '',
        eventIds: [1],
      });
    });
  });

  it('keeps the new package draft and shows a toast when saving fails', async () => {
    mocks.saveBudgetPackage.mockRejectedValueOnce(new Error('Rozpoctovy balik nepatri do vybraneho projektu.'));
    render(<ProjectStatsView />);

    const packageNameInput = screen.getByLabelText('Nazev baliku');
    const eventCheckbox = screen.getByLabelText('Majales priprava');

    fireEvent.change(packageNameInput, { target: { value: 'Bitva o Prahu' } });
    fireEvent.click(eventCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Pridat balik' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Rozpoctovy balik nepatri do vybraneho projektu.');
    });
    expect(packageNameInput).toHaveValue('Bitva o Prahu');
    expect(eventCheckbox).toBeChecked();
  });

  it('saves a new budget item in a package', async () => {
    render(<ProjectStatsView />);

    const packagePanel = screen.getByTestId('budget-package-1');
    fireEvent.change(within(packagePanel).getByLabelText('Sekce'), { target: { value: 'CATERING' } });
    fireEvent.change(within(packagePanel).getByLabelText('Polozka'), { target: { value: 'Voda' } });
    fireEvent.change(within(packagePanel).getByLabelText('Jednotky'), { target: { value: 'ks/action/czk' } });
    fireEvent.change(within(packagePanel).getByLabelText('Pocet'), { target: { value: '20' } });
    fireEvent.change(within(packagePanel).getByLabelText('Mnozstvi'), { target: { value: '1' } });
    fireEvent.change(within(packagePanel).getByLabelText('Cena za jednotku'), { target: { value: '30' } });
    fireEvent.click(within(packagePanel).getByRole('button', { name: 'Pridat polozku' }));

    await waitFor(() => {
      expect(mocks.saveBudgetItem).toHaveBeenCalledWith({
        projectId: 'JTI001',
        budgetPackageId: 1,
        eventId: null,
        section: 'CATERING',
        name: 'Voda',
        units: 'ks/action/czk',
        amount: 20,
        quantity: 1,
        unitPrice: 30,
        note: '',
      });
    });
  });

  it('saves a new budget item linked to a selected package event', async () => {
    render(<ProjectStatsView />);

    const packagePanel = screen.getByTestId('budget-package-1');
    fireEvent.change(within(packagePanel).getByLabelText('Sekce'), { target: { value: 'CATERING' } });
    fireEvent.change(within(packagePanel).getByLabelText('Polozka'), { target: { value: 'Voda' } });
    fireEvent.change(within(packagePanel).getByLabelText('Akce polozky'), { target: { value: '1' } });
    fireEvent.click(within(packagePanel).getByRole('button', { name: 'Pridat polozku' }));

    await waitFor(() => {
      expect(mocks.saveBudgetItem).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'JTI001',
        budgetPackageId: 1,
        eventId: 1,
        section: 'CATERING',
        name: 'Voda',
      }));
    });
  });

  it('loads an existing budget item into the form and saves it with its id', async () => {
    render(<ProjectStatsView />);

    const packagePanel = screen.getByTestId('budget-package-1');
    fireEvent.click(within(packagePanel).getAllByRole('button', { name: 'Upravit' })[0]);

    expect(within(packagePanel).getByLabelText('Sekce')).toHaveValue('TRANSPORTATION');
    expect(within(packagePanel).getByLabelText('Polozka')).toHaveValue('Van');
    expect(within(packagePanel).getByLabelText('Akce polozky')).toHaveValue('1');

    fireEvent.change(within(packagePanel).getByLabelText('Polozka'), { target: { value: 'Van upraveny' } });
    fireEvent.click(within(packagePanel).getByRole('button', { name: 'Ulozit polozku' }));

    await waitFor(() => {
      expect(mocks.saveBudgetItem).toHaveBeenCalledWith(expect.objectContaining({
        id: 1,
        projectId: 'JTI001',
        budgetPackageId: 1,
        eventId: 1,
        section: 'TRANSPORTATION',
        name: 'Van upraveny',
      }));
    });
  });

  it('deletes an existing budget item', async () => {
    render(<ProjectStatsView />);

    const packagePanel = screen.getByTestId('budget-package-1');
    fireEvent.click(within(packagePanel).getAllByRole('button', { name: 'Smazat' })[0]);

    await waitFor(() => {
      expect(mocks.deleteBudgetItem).toHaveBeenCalledWith(1);
    });
  });

  it('calculates project hours and crew costs across midnight', () => {
    mocks.invoices = [];
    mocks.contractors = [
      {
        id: 1,
        profileId: 'profile-1',
        name: 'Marek Rebros',
        ii: 'MR',
        bg: '#fff',
        fg: '#111',
        tags: [],
        events: 1,
        rate: 250,
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        city: '',
        reliable: true,
        note: '',
      },
    ];
    mocks.timelogs = [
      {
        id: 1,
        eid: 1,
        contractorProfileId: 'profile-1',
        days: [{ d: '2026-05-01', f: '20:00', t: '01:00', type: 'provoz' }],
        km: 0,
        note: '',
        status: 'draft',
      },
    ];

    render(<ProjectStatsView />);

    expect(screen.getAllByText('5.0h').length).toBeGreaterThan(0);
    expect(screen.getByText('5h')).toBeInTheDocument();
    expect(screen.getByText('1 250 Kc')).toBeInTheDocument();
    expect(screen.queryByText('-19h')).not.toBeInTheDocument();
  });
});

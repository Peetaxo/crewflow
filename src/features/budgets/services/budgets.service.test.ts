import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLocalRuntime = () => {
  vi.doMock('../../../lib/app-config', () => ({
    appDataSource: 'local',
  }));
  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: false,
    supabase: null,
  }));
};

describe('budgets service data shape', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock('../../../lib/app-config');
    vi.doUnmock('../../../lib/supabase');
    vi.doUnmock('../../../lib/app-data');
  });

  it('exposes empty budget arrays in the local app snapshot', async () => {
    const { getLocalAppState } = await import('../../../lib/app-data');

    const snapshot = getLocalAppState();

    expect(snapshot.budgetPackages).toEqual([]);
    expect(snapshot.budgetItems).toEqual([]);
  });

  it('calculates planned totals and actuals for project budget packages', async () => {
    mockLocalRuntime();

    const snapshot = {
      events: [
        { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
        { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [
        { id: 'inv-1', eid: 1, hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 3000, job: 'JTI001', status: 'sent', sentAt: null },
        { id: 'inv-2', eid: 999, hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 1000, job: 'JTI001', status: 'draft', sentAt: null },
      ],
      receipts: [
        { id: 1, eid: 2, job: 'JTI001', title: 'Parking', vendor: 'Garage', amount: 500, paidAt: '2026-05-02', note: '', status: 'approved' },
      ],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [
        { id: 1, projectId: 'JTI001', name: 'Majales', note: '', eventIds: [1, 2], createdAt: '2026-04-28' },
      ],
      budgetItems: [
        { id: 1, projectId: 'JTI001', budgetPackageId: 1, eventId: 1, section: 'TRANSPORTATION', name: 'Van', units: 'km/action/czk', amount: 10, quantity: 2, unitPrice: 100, note: '', createdAt: '2026-04-28' },
        { id: 2, projectId: 'JTI001', budgetPackageId: 1, eventId: null, section: 'LOCATION', name: 'Fee', units: 'pcs/action/czk', amount: 1, quantity: 1, unitPrice: 5000, note: '', createdAt: '2026-04-28' },
      ],
    };

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(),
    }));

    const { getProjectBudgetOverview } = await import('./budgets.service');

    const overview = getProjectBudgetOverview('JTI001');

    expect(overview.plannedTotal).toBe(7000);
    expect(overview.actualTotal).toBe(3500);
    expect(overview.variance).toBe(3500);
    expect(overview.packages).toEqual([
      expect.objectContaining({
        id: 1,
        plannedTotal: 7000,
        actualTotal: 3500,
        variance: 3500,
        linkedEvents: expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'Majales priprava' }),
          expect.objectContaining({ id: 2, name: 'Majales rozvozy' }),
        ]),
      }),
    ]);
  });

  it('counts batch invoices linked by jobNumbers and eventIds in project and package actuals', async () => {
    mockLocalRuntime();

    const snapshot = {
      events: [
        { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
        { id: 2, name: 'Other stage', job: 'OTHER001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'Other' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [
        { id: 'inv-batch', eid: 999, eventIds: [1, 2], hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 4500, job: 'OTHER001', jobNumbers: ['OTHER001', 'JTI001'], status: 'sent', sentAt: null },
        { id: 'inv-draft', eid: 1, eventIds: [1], hours: 0, hAmt: 0, km: 0, kAmt: 0, total: 9000, job: 'JTI001', jobNumbers: ['JTI001'], status: 'draft', sentAt: null },
      ],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [
        { id: 1, projectId: 'JTI001', name: 'Majales', note: '', eventIds: [1], createdAt: '2026-04-28' },
      ],
      budgetItems: [
        { id: 1, projectId: 'JTI001', budgetPackageId: 1, eventId: 1, section: 'TRANSPORTATION', name: 'Van', units: 'km/action/czk', amount: 1, quantity: 1, unitPrice: 10000, note: '', createdAt: '2026-04-28' },
      ],
    };

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(),
    }));

    const { getProjectBudgetOverview } = await import('./budgets.service');

    const overview = getProjectBudgetOverview('JTI001');

    expect(overview.actualTotal).toBe(4500);
    expect(overview.packages[0].actualTotal).toBe(4500);
    expect(overview.packages[0].variance).toBe(5500);
  });

  it('creates a normalized package and item in local state', async () => {
    mockLocalRuntime();

    let snapshot = {
      events: [
        { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
        { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [],
      budgetItems: [],
    };

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetItem, saveBudgetPackage } = await import('./budgets.service');

    const savedPackage = await saveBudgetPackage({
      projectId: ' jti001 ',
      name: ' Majales ',
      note: ' hlavni balik ',
      eventIds: [2, 1, 1],
    });
    const savedItem = await saveBudgetItem({
      projectId: 'jti001',
      budgetPackageId: savedPackage.id,
      eventId: null,
      section: ' transportation ',
      name: ' Van ',
      units: ' km/action/czk ',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
      note: ' client van ',
    });

    expect(savedPackage).toEqual(expect.objectContaining({
      id: 1,
      projectId: 'JTI001',
      name: 'Majales',
      note: 'hlavni balik',
      eventIds: [1, 2],
    }));
    expect(savedItem).toEqual(expect.objectContaining({
      id: 1,
      projectId: 'JTI001',
      section: 'TRANSPORTATION',
      name: 'Van',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
    }));
    expect(snapshot.budgetPackages).toEqual([
      expect.objectContaining({
        id: savedPackage.id,
        projectId: 'JTI001',
        name: 'Majales',
        note: 'hlavni balik',
        eventIds: [1, 2],
      }),
    ]);
    expect(snapshot.budgetItems).toEqual([
      expect.objectContaining({
        id: savedItem.id,
        projectId: 'JTI001',
        budgetPackageId: savedPackage.id,
        section: 'TRANSPORTATION',
        name: 'Van',
        units: 'km/action/czk',
        amount: 10,
        quantity: 2,
        unitPrice: 100,
        note: 'client van',
      }),
    ]);
  });

  it('rejects a local package event from another project before mutating local state', async () => {
    mockLocalRuntime();

    let snapshot = {
      events: [
        { id: 1, name: 'Other event', job: 'OTHER001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'Other' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [],
      budgetItems: [],
    };
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetPackage } = await import('./budgets.service');

    await expect(saveBudgetPackage({
      projectId: 'JTI001',
      name: 'Majales',
      note: '',
      eventIds: [1],
    })).rejects.toThrow('Akce nepatri do vybraneho projektu.');
    expect(snapshot).toEqual(originalSnapshot);
  });

  it('rejects a local budget item event from another project before mutating local state', async () => {
    mockLocalRuntime();

    let snapshot = {
      events: [
        { id: 1, name: 'Other event', job: 'OTHER001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'Other' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [{
        id: 1,
        projectId: 'JTI001',
        name: 'Majales',
        note: '',
        eventIds: [1],
        createdAt: '2026-04-28',
      }],
      budgetItems: [],
    };
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetItem } = await import('./budgets.service');

    await expect(saveBudgetItem({
      projectId: 'JTI001',
      budgetPackageId: 1,
      eventId: 1,
      section: 'TRANSPORTATION',
      name: 'Van',
      units: 'km/action/czk',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
      note: '',
    })).rejects.toThrow('Akce nepatri do vybraneho projektu.');
    expect(snapshot).toEqual(originalSnapshot);
  });

  it('rejects a local budget item package from another project before mutating local state', async () => {
    mockLocalRuntime();

    let snapshot = {
      events: [],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [{
        id: 1,
        projectId: 'OTHER001',
        name: 'Other package',
        note: '',
        eventIds: [],
        createdAt: '2026-04-28',
      }],
      budgetItems: [],
    };
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetItem } = await import('./budgets.service');

    await expect(saveBudgetItem({
      projectId: 'JTI001',
      budgetPackageId: 1,
      eventId: null,
      section: 'TRANSPORTATION',
      name: 'Van',
      units: 'km/action/czk',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
      note: '',
    })).rejects.toThrow('Rozpoctovy balik nepatri do vybraneho projektu.');
    expect(snapshot).toEqual(originalSnapshot);
  });

  it('maps Supabase budget rows into local packages and items', async () => {
    const rowsByTable = {
      projects: [{
        id: 'project-uuid-1',
        job_number: 'JTI001',
      }],
      events: [
        { id: 'event-uuid-1' },
        { id: 'event-uuid-2' },
      ],
      budget_packages: [{
        id: 'package-uuid-1',
        project_id: 'project-uuid-1',
        name: 'Majales',
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
      budget_package_events: [{
        budget_package_id: 'package-uuid-1',
        event_id: 'event-uuid-2',
        created_at: '2026-04-28T00:00:00Z',
      }],
      budget_items: [{
        id: 'item-uuid-1',
        project_id: 'project-uuid-1',
        budget_package_id: 'package-uuid-1',
        event_id: 'event-uuid-2',
        section: 'TRANSPORTATION',
        name: 'Van',
        units: 'km/action/czk',
        amount: 10,
        quantity: 2,
        unit_price: 100,
        note: null,
        created_at: '2026-04-28T00:00:00Z',
        updated_at: '2026-04-28T00:00:00Z',
      }],
    };

    const from = vi.fn((table: keyof typeof rowsByTable) => ({
      select: vi.fn(() => {
        const result = { data: rowsByTable[table], error: null };
        const order = vi.fn(() => ({ ...result, order }));
        return { order };
      }),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));

    const { fetchBudgetsSnapshot } = await import('./budgets.service');

    const snapshot = await fetchBudgetsSnapshot();

    expect(snapshot.budgetPackages).toEqual([{
      id: 1,
      supabaseId: 'package-uuid-1',
      projectId: 'JTI001',
      name: 'Majales',
      note: '',
      eventIds: [2],
      createdAt: '2026-04-28T00:00:00Z',
    }]);
    expect(snapshot.budgetItems).toEqual([{
      id: 1,
      supabaseId: 'item-uuid-1',
      projectId: 'JTI001',
      budgetPackageId: 1,
      eventId: 2,
      section: 'TRANSPORTATION',
      name: 'Van',
      units: 'km/action/czk',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
      note: '',
      createdAt: '2026-04-28T00:00:00Z',
    }]);
  });

  it('rejects a Supabase package event from another project before writing', async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: 'package-uuid-1' }, error: null });
    const from = vi.fn(() => ({
      insert,
      select: vi.fn(() => ({ order: vi.fn(() => ({ data: [], error: null })) })),
    }));
    const snapshot = {
      events: [
        { id: 1, supabaseId: 'event-uuid-1', job: 'OTHER001', name: 'Other event', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'Other' },
      ],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', supabaseId: 'project-uuid-1', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [],
      budgetItems: [],
    };

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetPackage } = await import('./budgets.service');

    await expect(saveBudgetPackage({
      projectId: 'JTI001',
      name: 'Majales',
      note: '',
      eventIds: [1],
    })).rejects.toThrow('Akce nepatri do vybraneho projektu.');
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a Supabase budget item package from another project before writing', async () => {
    const insert = vi.fn().mockResolvedValue({ data: { id: 'item-uuid-1' }, error: null });
    const from = vi.fn(() => ({
      insert,
      select: vi.fn(() => ({ order: vi.fn(() => ({ data: [], error: null })) })),
    }));
    const snapshot = {
      events: [],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [{ id: 'JTI001', supabaseId: 'project-uuid-1', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }],
      clients: [],
      budgetPackages: [{
        id: 1,
        supabaseId: 'package-uuid-1',
        projectId: 'OTHER001',
        name: 'Other package',
        note: '',
        eventIds: [],
        createdAt: '2026-04-28',
      }],
      budgetItems: [],
    };

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetItem } = await import('./budgets.service');

    await expect(saveBudgetItem({
      projectId: 'JTI001',
      budgetPackageId: 1,
      eventId: null,
      section: 'TRANSPORTATION',
      name: 'Van',
      units: 'km/action/czk',
      amount: 10,
      quantity: 2,
      unitPrice: 100,
      note: '',
    })).rejects.toThrow('Rozpoctovy balik nepatri do vybraneho projektu.');
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects changing an existing budget package project without mutating local state', async () => {
    mockLocalRuntime();

    let snapshot = {
      events: [],
      contractors: [],
      timelogs: [],
      invoices: [],
      receipts: [],
      fleetVehicles: [],
      fleetReservations: [],
      candidates: [],
      projects: [
        { id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' },
        { id: 'OTHER001', name: 'Other 2026', client: 'Other', note: '', createdAt: '2026-04-28' },
      ],
      clients: [],
      budgetPackages: [{
        id: 1,
        projectId: 'JTI001',
        name: 'Majales',
        note: '',
        eventIds: [],
        createdAt: '2026-04-28',
      }],
      budgetItems: [],
    };
    const originalSnapshot = JSON.parse(JSON.stringify(snapshot));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(),
    }));

    const { saveBudgetPackage } = await import('./budgets.service');

    await expect(saveBudgetPackage({
      id: 1,
      projectId: 'OTHER001',
      name: 'Majales',
      note: '',
      eventIds: [],
    })).rejects.toThrow('Rozpoctovy balik nepatri do vybraneho projektu.');
    expect(snapshot).toEqual(originalSnapshot);
  });
});

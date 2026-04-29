# Project Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level budget packages and budget line items so a project can group events into budget packages and compare planned costs against existing invoice/receipt actuals.

**Architecture:** Keep `Project` as the job-number container and add a focused `features/budgets` service for budget packages, budget items, rollups, and local/Supabase persistence. Extend `ProjectStatsView` with a budget section that consumes the service, without changing the existing event hierarchy.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Supabase JS, existing local app-data store.

---

## File Structure

- Modify `src/types.ts`
  - Add `BudgetPackage`, `BudgetItem`, and draft types.
- Modify `src/data.ts`
  - Add empty `INITIAL_BUDGET_PACKAGES` and `INITIAL_BUDGET_ITEMS` arrays.
- Modify `src/lib/app-data.ts`
  - Add budget arrays to `AppDataSnapshot`, local initial state, Supabase loading, and returned snapshot.
- Modify `src/lib/database.types.ts`
  - Add `budget_packages`, `budget_package_events`, and `budget_items` table typings.
- Modify `src/lib/supabase-mappers.ts`
  - Add mappers for budget packages and items.
- Create `supabase/project-budgets-migration.sql`
  - Add budget tables, indexes, constraints, RLS, and comments.
- Create `src/features/budgets/services/budgets.service.ts`
  - Own budget calculations, package/item CRUD, event linking, hydration, and subscriptions.
- Create `src/features/budgets/services/budgets.service.test.ts`
  - Cover totals, rollups, variance, local CRUD, and event package grouping.
- Modify `src/app/providers/AppDataBootstrap.tsx`
  - Reset budget hydration when auth/local data resets.
- Modify `src/app/providers/AppDataBootstrap.test.tsx`
  - Assert budget hydration reset is called.
- Modify `src/views/ProjectStatsView.tsx`
  - Render budget KPIs, package list, package detail, and minimal create/edit controls.
- Create or modify `src/views/ProjectStatsView.test.tsx`
  - Cover empty and populated budget states.

## Task 1: Types And Local Snapshot Shape

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data.ts`
- Modify: `src/lib/app-data.ts`

- [ ] **Step 1: Write the failing app-data test**

Create `src/features/budgets/services/budgets.service.test.ts` with the first shape test:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('budgets service data shape', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exposes empty budget arrays in the local app snapshot', async () => {
    const { getLocalAppState } = await import('../../../lib/app-data');

    const snapshot = getLocalAppState();

    expect(snapshot.budgetPackages).toEqual([]);
    expect(snapshot.budgetItems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/features/budgets/services/budgets.service.test.ts`

Expected: FAIL because `budgetPackages` and `budgetItems` do not exist on `AppDataSnapshot`.

- [ ] **Step 3: Add budget types**

In `src/types.ts`, after `FleetReservationDraft`, add:

```ts
export interface BudgetPackage {
  id: number;
  supabaseId?: string;
  projectId: string;
  name: string;
  note: string;
  eventIds: number[];
  createdAt: string;
}

export type BudgetPackageDraft = Omit<BudgetPackage, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};

export interface BudgetItem {
  id: number;
  supabaseId?: string;
  projectId: string;
  budgetPackageId: number | null;
  eventId: number | null;
  section: string;
  name: string;
  units: string;
  amount: number;
  quantity: number;
  unitPrice: number;
  note: string;
  createdAt: string;
}

export type BudgetItemDraft = Omit<BudgetItem, 'id' | 'createdAt'> & {
  id?: number;
  createdAt?: string;
};
```

- [ ] **Step 4: Add initial budget arrays**

In `src/data.ts`, add `BudgetPackage` and `BudgetItem` to the import from `./types`, then add near the other initial exports:

```ts
export const INITIAL_BUDGET_PACKAGES: BudgetPackage[] = [];
export const INITIAL_BUDGET_ITEMS: BudgetItem[] = [];
```

- [ ] **Step 5: Extend local app-data**

In `src/lib/app-data.ts`, import the two new constants and types:

```ts
  INITIAL_BUDGET_ITEMS,
  INITIAL_BUDGET_PACKAGES,
```

```ts
  BudgetItem,
  BudgetPackage,
```

Extend `AppDataSnapshot`:

```ts
  budgetPackages: BudgetPackage[];
  budgetItems: BudgetItem[];
```

Add both arrays to `localAppState`, `getLocalAppData()`, and the object returned from `getSupabaseAppData()`:

```ts
  budgetPackages: INITIAL_BUDGET_PACKAGES,
  budgetItems: INITIAL_BUDGET_ITEMS,
```

For the Supabase return in this task, temporarily return empty arrays:

```ts
    budgetPackages: [],
    budgetItems: [],
```

- [ ] **Step 6: Verify the shape test passes**

Run: `npm test -- src/features/budgets/services/budgets.service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/data.ts src/lib/app-data.ts src/features/budgets/services/budgets.service.test.ts
git commit -m "feat: add project budget data shape"
```

## Task 2: Budget Calculations And Local CRUD

**Files:**
- Modify: `src/features/budgets/services/budgets.service.test.ts`
- Create: `src/features/budgets/services/budgets.service.ts`

- [ ] **Step 1: Add failing calculation and CRUD tests**

Append these tests to `src/features/budgets/services/budgets.service.test.ts`:

```ts
it('calculates planned totals and actuals for project budget packages', async () => {
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

it('creates a normalized package and item in local state', async () => {
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
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/features/budgets/services/budgets.service.test.ts`

Expected: FAIL because `budgets.service.ts` does not exist.

- [ ] **Step 3: Implement the budget service**

Create `src/features/budgets/services/budgets.service.ts`:

```ts
import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { BudgetItem, BudgetItemDraft, BudgetPackage, BudgetPackageDraft, Event } from '../../../types';

export interface BudgetPackageOverview extends BudgetPackage {
  linkedEvents: Event[];
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  items: BudgetItem[];
}

export interface ProjectBudgetOverview {
  projectId: string;
  plannedTotal: number;
  actualTotal: number;
  variance: number;
  packageCount: number;
  linkedEventCount: number;
  packages: BudgetPackageOverview[];
  unassignedItems: BudgetItem[];
}

const normalizeProjectId = (projectId: string) => projectId.trim().toUpperCase();

const normalizePackage = (budgetPackage: BudgetPackageDraft): BudgetPackage => ({
  id: budgetPackage.id ?? Math.max(0, ...getLocalAppState().budgetPackages.map((item) => item.id)) + 1,
  supabaseId: budgetPackage.supabaseId,
  projectId: normalizeProjectId(budgetPackage.projectId),
  name: budgetPackage.name.trim(),
  note: budgetPackage.note.trim(),
  eventIds: Array.from(new Set(budgetPackage.eventIds)).sort((a, b) => a - b),
  createdAt: budgetPackage.createdAt ?? new Date().toISOString(),
});

const normalizeItem = (item: BudgetItemDraft): BudgetItem => ({
  id: item.id ?? Math.max(0, ...getLocalAppState().budgetItems.map((budgetItem) => budgetItem.id)) + 1,
  supabaseId: item.supabaseId,
  projectId: normalizeProjectId(item.projectId),
  budgetPackageId: item.budgetPackageId ?? null,
  eventId: item.eventId ?? null,
  section: item.section.trim().toUpperCase(),
  name: item.name.trim(),
  units: item.units.trim(),
  amount: Number(item.amount) || 0,
  quantity: Number(item.quantity) || 0,
  unitPrice: Number(item.unitPrice) || 0,
  note: item.note.trim(),
  createdAt: item.createdAt ?? new Date().toISOString(),
});

export const getBudgetItemTotal = (item: Pick<BudgetItem, 'amount' | 'quantity' | 'unitPrice'>): number => (
  Math.round(item.amount * item.quantity * item.unitPrice * 100) / 100
);

export const getProjectBudgetOverview = (projectId: string | null): ProjectBudgetOverview => {
  const normalizedProjectId = projectId ? normalizeProjectId(projectId) : '';
  const snapshot = getLocalAppState();
  const projectPackages = snapshot.budgetPackages.filter((item) => item.projectId === normalizedProjectId);
  const projectItems = snapshot.budgetItems.filter((item) => item.projectId === normalizedProjectId);
  const projectInvoices = snapshot.invoices.filter((invoice) => invoice.job === normalizedProjectId && invoice.status !== 'draft');
  const projectReceipts = snapshot.receipts.filter((receipt) => receipt.job === normalizedProjectId && receipt.status !== 'draft' && receipt.status !== 'rejected');

  const packages = projectPackages.map((budgetPackage) => {
    const packageItems = projectItems.filter((item) => item.budgetPackageId === budgetPackage.id);
    const linkedEvents = snapshot.events.filter((event) => budgetPackage.eventIds.includes(event.id));
    const linkedEventIds = new Set(linkedEvents.map((event) => event.id));
    const plannedTotal = packageItems.reduce((sum, item) => sum + getBudgetItemTotal(item), 0);
    const invoiceTotal = projectInvoices
      .filter((invoice) => linkedEventIds.has(invoice.eid))
      .reduce((sum, invoice) => sum + invoice.total, 0);
    const receiptTotal = projectReceipts
      .filter((receipt) => linkedEventIds.has(receipt.eid))
      .reduce((sum, receipt) => sum + receipt.amount, 0);
    const actualTotal = invoiceTotal + receiptTotal;

    return {
      ...budgetPackage,
      linkedEvents,
      plannedTotal,
      actualTotal,
      variance: plannedTotal - actualTotal,
      items: packageItems,
    };
  });

  const unassignedItems = projectItems.filter((item) => item.budgetPackageId == null);
  const plannedTotal = projectItems.reduce((sum, item) => sum + getBudgetItemTotal(item), 0);
  const actualTotal =
    projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
    + projectReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);

  return {
    projectId: normalizedProjectId,
    plannedTotal,
    actualTotal,
    variance: plannedTotal - actualTotal,
    packageCount: projectPackages.length,
    linkedEventCount: new Set(projectPackages.flatMap((item) => item.eventIds)).size,
    packages,
    unassignedItems,
  };
};

export const createEmptyBudgetPackage = (projectId: string): BudgetPackageDraft => ({
  projectId,
  name: '',
  note: '',
  eventIds: [],
});

export const createEmptyBudgetItem = (projectId: string, budgetPackageId: number | null = null): BudgetItemDraft => ({
  projectId,
  budgetPackageId,
  eventId: null,
  section: '',
  name: '',
  units: '',
  amount: 1,
  quantity: 1,
  unitPrice: 0,
  note: '',
});

export const saveBudgetPackage = async (draft: BudgetPackageDraft): Promise<BudgetPackage> => {
  const normalized = normalizePackage(draft);
  if (!normalized.projectId || !normalized.name) {
    throw new Error('Vyplnte projekt a nazev rozpoctoveho baliku.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    // Supabase persistence is added in Task 3.
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.budgetPackages.some((item) => item.id === normalized.id);
    return {
      ...snapshot,
      budgetPackages: exists
        ? snapshot.budgetPackages.map((item) => item.id === normalized.id ? normalized : item)
        : [...snapshot.budgetPackages, normalized],
    };
  });

  return normalized;
};

export const saveBudgetItem = async (draft: BudgetItemDraft): Promise<BudgetItem> => {
  const normalized = normalizeItem(draft);
  if (!normalized.projectId || !normalized.section || !normalized.name) {
    throw new Error('Vyplnte projekt, sekci a nazev polozky.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    // Supabase persistence is added in Task 3.
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.budgetItems.some((item) => item.id === normalized.id);
    return {
      ...snapshot,
      budgetItems: exists
        ? snapshot.budgetItems.map((item) => item.id === normalized.id ? normalized : item)
        : [...snapshot.budgetItems, normalized],
    };
  });

  return normalized;
};

export const deleteBudgetPackage = async (id: number): Promise<{ id: number }> => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    budgetPackages: snapshot.budgetPackages.filter((item) => item.id !== id),
    budgetItems: snapshot.budgetItems.map((item) => item.budgetPackageId === id ? { ...item, budgetPackageId: null } : item),
  }));

  return { id };
};

export const deleteBudgetItem = async (id: number): Promise<{ id: number }> => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    budgetItems: snapshot.budgetItems.filter((item) => item.id !== id),
  }));

  return { id };
};

export const getBudgetDependencies = () => {
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events,
    projects: snapshot.projects,
  };
};

export const subscribeToBudgetChanges = subscribeToLocalAppState;

export const resetSupabaseBudgetsHydration = () => undefined;
```

- [ ] **Step 4: Verify budget service tests pass**

Run: `npm test -- src/features/budgets/services/budgets.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/budgets/services/budgets.service.ts src/features/budgets/services/budgets.service.test.ts
git commit -m "feat: add project budget service"
```

## Task 3: Supabase Tables, Mappers, And Hydration

**Files:**
- Create: `supabase/project-budgets-migration.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Modify: `src/lib/app-data.ts`
- Modify: `src/features/budgets/services/budgets.service.ts`
- Modify: `src/features/budgets/services/budgets.service.test.ts`
- Modify: `src/lib/app-data.test.ts`

- [ ] **Step 1: Add failing Supabase mapping tests**

Append to `src/features/budgets/services/budgets.service.test.ts`:

```ts
it('maps Supabase budget rows into local packages and items', async () => {
  const rowsByTable = {
    projects: [{ id: 'project-uuid-1', job_number: 'JTI001' }],
    events: [{ id: 'event-uuid-1' }, { id: 'event-uuid-2' }],
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

  vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
  vi.doMock('../../../lib/supabase', () => ({
    isSupabaseConfigured: true,
    supabase: { from },
  }));

  const { fetchBudgetsSnapshot } = await import('./budgets.service');

  const snapshot = await fetchBudgetsSnapshot();

  expect(snapshot.budgetPackages).toEqual([
    expect.objectContaining({
      id: 1,
      supabaseId: 'package-uuid-1',
      projectId: 'JTI001',
      eventIds: [2],
    }),
  ]);
  expect(snapshot.budgetItems).toEqual([
    expect.objectContaining({
      id: 1,
      supabaseId: 'item-uuid-1',
      projectId: 'JTI001',
      budgetPackageId: 1,
      eventId: 2,
      unitPrice: 100,
    }),
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/features/budgets/services/budgets.service.test.ts`

Expected: FAIL because `fetchBudgetsSnapshot` is not implemented.

- [ ] **Step 3: Add Supabase migration**

Create `supabase/project-budgets-migration.sql`:

```sql
create table if not exists public.budget_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_package_events (
  budget_package_id uuid not null references public.budget_packages(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (budget_package_id, event_id)
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_package_id uuid references public.budget_packages(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  section text not null,
  name text not null,
  units text not null default '',
  amount numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_budget_packages_project_id
  on public.budget_packages(project_id);

create index if not exists idx_budget_package_events_event_id
  on public.budget_package_events(event_id);

create index if not exists idx_budget_items_project_id
  on public.budget_items(project_id);

create index if not exists idx_budget_items_budget_package_id
  on public.budget_items(budget_package_id);

create index if not exists idx_budget_items_event_id
  on public.budget_items(event_id);

alter table public.budget_packages enable row level security;
alter table public.budget_package_events enable row level security;
alter table public.budget_items enable row level security;

create policy "authenticated users can read budget packages"
  on public.budget_packages for select
  to authenticated
  using (true);

create policy "authenticated users can write budget packages"
  on public.budget_packages for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read budget package events"
  on public.budget_package_events for select
  to authenticated
  using (true);

create policy "authenticated users can write budget package events"
  on public.budget_package_events for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read budget items"
  on public.budget_items for select
  to authenticated
  using (true);

create policy "authenticated users can write budget items"
  on public.budget_items for all
  to authenticated
  using (true)
  with check (true);

comment on table public.budget_packages is
  'Project-level budget groupings such as Majales inside one job-number project.';

comment on table public.budget_package_events is
  'Join table linking existing events into project budget packages.';

comment on table public.budget_items is
  'Planned budget line items mirroring sectioned event budget workbooks.';
```

- [ ] **Step 4: Add database type entries**

In `src/lib/database.types.ts`, add table entries for `budget_packages`, `budget_package_events`, and `budget_items` matching the SQL columns. Use the existing generated-style shape:

```ts
      budget_packages: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
```

Repeat the same pattern for:

```ts
      budget_package_events: {
        Row: {
          budget_package_id: string;
          event_id: string;
          created_at: string;
        };
        Insert: {
          budget_package_id: string;
          event_id: string;
          created_at?: string;
        };
        Update: {
          budget_package_id?: string;
          event_id?: string;
          created_at?: string;
        };
      };
```

```ts
      budget_items: {
        Row: {
          id: string;
          project_id: string;
          budget_package_id: string | null;
          event_id: string | null;
          section: string;
          name: string;
          units: string;
          amount: number;
          quantity: number;
          unit_price: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          budget_package_id?: string | null;
          event_id?: string | null;
          section: string;
          name: string;
          units?: string;
          amount?: number;
          quantity?: number;
          unit_price?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          budget_package_id?: string | null;
          event_id?: string | null;
          section?: string;
          name?: string;
          units?: string;
          amount?: number;
          quantity?: number;
          unit_price?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
```

- [ ] **Step 5: Add mappers**

In `src/lib/supabase-mappers.ts`, add row aliases:

```ts
type BudgetPackageRow = Database['public']['Tables']['budget_packages']['Row'];
type BudgetItemRow = Database['public']['Tables']['budget_items']['Row'];
```

Add mapper functions:

```ts
export function mapBudgetPackage(
  row: BudgetPackageRow,
  links: { localId: number; projectJobNumber: string; eventIds: number[] },
): BudgetPackage {
  return {
    id: links.localId,
    supabaseId: row.id,
    projectId: links.projectJobNumber,
    name: row.name,
    note: row.note ?? '',
    eventIds: links.eventIds,
    createdAt: row.created_at,
  };
}

export function mapBudgetItem(
  row: BudgetItemRow,
  links: { localId: number; projectJobNumber: string; budgetPackageId: number | null; eventId: number | null },
): BudgetItem {
  return {
    id: links.localId,
    supabaseId: row.id,
    projectId: links.projectJobNumber,
    budgetPackageId: links.budgetPackageId,
    eventId: links.eventId,
    section: row.section,
    name: row.name,
    units: row.units,
    amount: Number(row.amount),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}
```

Also update the type import at the top to include `BudgetItem` and `BudgetPackage`.

- [ ] **Step 6: Implement Supabase budget snapshot loading**

In `src/features/budgets/services/budgets.service.ts`, import the mappers:

```ts
import { mapBudgetItem, mapBudgetPackage } from '../../../lib/supabase-mappers';
```

Add:

```ts
export const fetchBudgetsSnapshot = async (): Promise<Pick<ReturnType<typeof getLocalAppState>, 'budgetPackages' | 'budgetItems'>> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    const snapshot = getLocalAppState();
    return {
      budgetPackages: snapshot.budgetPackages,
      budgetItems: snapshot.budgetItems,
    };
  }

  const [packagesResult, packageEventsResult, itemsResult, projectsResult, eventsResult] = await Promise.all([
    supabase.from('budget_packages').select('*').order('created_at'),
    supabase.from('budget_package_events').select('*').order('created_at'),
    supabase.from('budget_items').select('*').order('created_at'),
    supabase.from('projects').select('id, job_number').order('job_number'),
    supabase.from('events').select('id').order('date_from').order('name'),
  ]);

  const firstError = packagesResult.error
    ?? packageEventsResult.error
    ?? itemsResult.error
    ?? projectsResult.error
    ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const packageRows = packagesResult.data ?? [];
  const packageEventRows = packageEventsResult.data ?? [];
  const itemRows = itemsResult.data ?? [];
  const projectJobNumberByUuid = new Map((projectsResult.data ?? []).map((row) => [row.id, row.job_number]));
  const eventIdByUuid = new Map((eventsResult.data ?? []).map((row, index) => [row.id, index + 1]));
  const packageIdByUuid = new Map(packageRows.map((row, index) => [row.id, index + 1]));

  return {
    budgetPackages: packageRows.map((row, index) => mapBudgetPackage(row, {
      localId: index + 1,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      eventIds: packageEventRows
        .filter((link) => link.budget_package_id === row.id)
        .map((link) => eventIdByUuid.get(link.event_id))
        .filter((id): id is number => id != null),
    })),
    budgetItems: itemRows.map((row, index) => mapBudgetItem(row, {
      localId: index + 1,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      budgetPackageId: row.budget_package_id ? (packageIdByUuid.get(row.budget_package_id) ?? null) : null,
      eventId: row.event_id ? (eventIdByUuid.get(row.event_id) ?? null) : null,
    })),
  };
};
```

- [ ] **Step 7: Wire app-data Supabase loading**

In `src/lib/app-data.ts`, import `mapBudgetPackage` and `mapBudgetItem`. Add `budgetPackagesResult`, `budgetPackageEventsResult`, and `budgetItemsResult` to the Promise.all next to other business tables:

```ts
    budgetPackagesResult,
    budgetPackageEventsResult,
    budgetItemsResult,
```

Use the same mapping logic from the service to produce `budgetPackages` and `budgetItems`, then return them in `getSupabaseAppData()`.

- [ ] **Step 8: Add service hydration reset and Supabase persistence**

In `src/features/budgets/services/budgets.service.ts`, replace the temporary no-op reset with:

```ts
let budgetsHydrationPromise: Promise<void> | null = null;
let budgetsLoaded = false;

const hydrateBudgetsFromSupabase = async (): Promise<void> => {
  const budgetsSnapshot = await fetchBudgetsSnapshot();
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    ...budgetsSnapshot,
  }));
};

const ensureSupabaseBudgetsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) return;
  if (budgetsLoaded || budgetsHydrationPromise) return;

  budgetsHydrationPromise = hydrateBudgetsFromSupabase()
    .then(() => {
      budgetsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist rozpocty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      budgetsHydrationPromise = null;
    });
};

export const resetSupabaseBudgetsHydration = () => {
  budgetsHydrationPromise = null;
  budgetsLoaded = false;
};
```

Call `ensureSupabaseBudgetsLoaded()` at the start of `getProjectBudgetOverview()` and `getBudgetDependencies()`.

For v1 Supabase writes, add helper functions that resolve local project/event/package IDs to UUIDs and use `upsert` for packages/items. After saving a package, replace its package-event links:

```ts
await supabase.from('budget_package_events').delete().eq('budget_package_id', packageRowId);
await supabase.from('budget_package_events').insert(eventRowIds.map((eventRowId) => ({
  budget_package_id: packageRowId,
  event_id: eventRowId,
})));
```

If any required row UUID is missing, throw the same Czech user-facing errors used by fleet persistence:

```ts
throw new Error('Projekt neni propojeny se Supabase.');
throw new Error('Akce neni propojena se Supabase.');
throw new Error('Rozpoctovy balik neni propojeny se Supabase.');
```

- [ ] **Step 9: Verify budget and app-data tests**

Run:

```bash
npm test -- src/features/budgets/services/budgets.service.test.ts src/lib/app-data.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add supabase/project-budgets-migration.sql src/lib/database.types.ts src/lib/supabase-mappers.ts src/lib/app-data.ts src/lib/app-data.test.ts src/features/budgets/services/budgets.service.ts src/features/budgets/services/budgets.service.test.ts
git commit -m "feat: persist project budgets"
```

## Task 4: App Bootstrap Reset

**Files:**
- Modify: `src/app/providers/AppDataBootstrap.tsx`
- Modify: `src/app/providers/AppDataBootstrap.test.tsx`

- [ ] **Step 1: Add failing bootstrap test expectation**

In `src/app/providers/AppDataBootstrap.test.tsx`, add to the `mocks` object:

```ts
  resetSupabaseBudgetsHydration: vi.fn(),
```

Add the mock module:

```ts
vi.mock('../../features/budgets/services/budgets.service', () => ({ resetSupabaseBudgetsHydration: mocks.resetSupabaseBudgetsHydration }));
```

In the existing reset test, add:

```ts
expect(mocks.resetSupabaseBudgetsHydration).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- src/app/providers/AppDataBootstrap.test.tsx`

Expected: FAIL because `AppDataBootstrap` does not call the budget reset function.

- [ ] **Step 3: Wire budget reset**

In `src/app/providers/AppDataBootstrap.tsx`, import:

```ts
import { resetSupabaseBudgetsHydration } from '../../features/budgets/services/budgets.service';
```

Add it to the same reset block that already calls `resetSupabaseFleetHydration()`:

```ts
resetSupabaseBudgetsHydration();
```

- [ ] **Step 4: Verify bootstrap test passes**

Run: `npm test -- src/app/providers/AppDataBootstrap.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx
git commit -m "feat: reset budget hydration with app data"
```

## Task 5: Project Detail Budget UI

**Files:**
- Modify: `src/views/ProjectStatsView.tsx`
- Create: `src/views/ProjectStatsView.test.tsx`

- [ ] **Step 1: Write failing project budget UI tests**

Create `src/views/ProjectStatsView.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetSelectedProjectIdForStats = vi.fn();

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    selectedProjectIdForStats: 'JTI001',
    setSelectedProjectIdForStats: mockSetSelectedProjectIdForStats,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../features/projects/services/projects.service', () => ({
  getProjectById: () => ({ id: 'JTI001', name: 'JTI 2026', client: 'JTI', note: '', createdAt: '2026-04-28' }),
  getProjectDependencies: () => ({
    events: [
      { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
      { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
    ],
    invoices: [],
    projects: [],
    clients: [],
  }),
  subscribeToProjectChanges: () => () => undefined,
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({ contractors: [] }),
  getTimelogs: () => [],
  subscribeToTimelogChanges: () => () => undefined,
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  getReceipts: () => [],
  subscribeToReceiptChanges: () => () => undefined,
}));

const mockSaveBudgetPackage = vi.fn(async (draft) => ({
  id: 2,
  projectId: 'JTI001',
  name: draft.name,
  note: draft.note,
  eventIds: draft.eventIds,
  createdAt: '2026-04-28T00:00:00Z',
}));

const mockSaveBudgetItem = vi.fn(async (draft) => ({
  id: 3,
  projectId: 'JTI001',
  budgetPackageId: draft.budgetPackageId,
  eventId: draft.eventId,
  section: draft.section,
  name: draft.name,
  units: draft.units,
  amount: draft.amount,
  quantity: draft.quantity,
  unitPrice: draft.unitPrice,
  note: draft.note,
  createdAt: '2026-04-28T00:00:00Z',
}));

vi.mock('../features/budgets/services/budgets.service', () => ({
  getProjectBudgetOverview: () => ({
    projectId: 'JTI001',
    plannedTotal: 7000,
    actualTotal: 3500,
    variance: 3500,
    packageCount: 1,
    linkedEventCount: 2,
    unassignedItems: [],
    packages: [{
      id: 1,
      projectId: 'JTI001',
      name: 'Majales',
      note: '',
      eventIds: [1, 2],
      createdAt: '2026-04-28T00:00:00Z',
      linkedEvents: [
        { id: 1, name: 'Majales priprava', job: 'JTI001', startDate: '2026-05-01', endDate: '2026-05-01', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
        { id: 2, name: 'Majales rozvozy', job: 'JTI001', startDate: '2026-05-02', endDate: '2026-05-02', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JTI' },
      ],
      plannedTotal: 7000,
      actualTotal: 3500,
      variance: 3500,
      items: [
        { id: 1, projectId: 'JTI001', budgetPackageId: 1, eventId: 1, section: 'TRANSPORTATION', name: 'Van', units: 'km/action/czk', amount: 10, quantity: 2, unitPrice: 100, note: '', createdAt: '2026-04-28T00:00:00Z' },
        { id: 2, projectId: 'JTI001', budgetPackageId: 1, eventId: null, section: 'LOCATION', name: 'Fee', units: 'pcs/action/czk', amount: 1, quantity: 1, unitPrice: 5000, note: '', createdAt: '2026-04-28T00:00:00Z' },
      ],
    }],
  }),
  getBudgetDependencies: () => ({
    events: [
      { id: 1, name: 'Majales priprava', job: 'JTI001' },
      { id: 2, name: 'Majales rozvozy', job: 'JTI001' },
    ],
  }),
  subscribeToBudgetChanges: () => () => undefined,
  saveBudgetPackage: mockSaveBudgetPackage,
  saveBudgetItem: mockSaveBudgetItem,
}));

describe('ProjectStatsView budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders budget summary, package rollup, linked events, and line items', async () => {
    const { default: ProjectStatsView } = await import('./ProjectStatsView');

    render(<ProjectStatsView />);

    expect(screen.getByRole('heading', { name: 'Rozpocet' })).toBeInTheDocument();
    expect(screen.getByText('Planovany rozpocet')).toBeInTheDocument();
    expect(screen.getByText('7 000 Kč')).toBeInTheDocument();
    expect(screen.getByText('Skutecne naklady')).toBeInTheDocument();
    expect(screen.getByText('3 500 Kč')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Majales' })).toBeInTheDocument();
    expect(screen.getByText('Majales priprava')).toBeInTheDocument();
    expect(screen.getByText('Majales rozvozy')).toBeInTheDocument();
    expect(screen.getByText('TRANSPORTATION')).toBeInTheDocument();
    expect(screen.getByText('Van')).toBeInTheDocument();
    expect(screen.getByText('LOCATION')).toBeInTheDocument();
    expect(screen.getByText('Fee')).toBeInTheDocument();
  });

  it('can submit a new budget package from the project detail', async () => {
    const { default: ProjectStatsView } = await import('./ProjectStatsView');

    render(<ProjectStatsView />);

    fireEvent.change(screen.getByLabelText('Nazev baliku'), { target: { value: 'Bitva o Prahu' } });
    fireEvent.click(screen.getByLabelText('Majales priprava'));
    fireEvent.click(screen.getByRole('button', { name: 'Pridat balik' }));

    expect(mockSaveBudgetPackage).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'JTI001',
      name: 'Bitva o Prahu',
      eventIds: [1],
    }));
  });

  it('can submit a new budget item for a package', async () => {
    const { default: ProjectStatsView } = await import('./ProjectStatsView');

    render(<ProjectStatsView />);

    const packagePanel = screen.getByTestId('budget-package-1');
    fireEvent.change(within(packagePanel).getByLabelText('Sekce'), { target: { value: 'CATERING' } });
    fireEvent.change(within(packagePanel).getByLabelText('Polozka'), { target: { value: 'Voda' } });
    fireEvent.change(within(packagePanel).getByLabelText('Jednotky'), { target: { value: 'ks/action/czk' } });
    fireEvent.change(within(packagePanel).getByLabelText('Pocet'), { target: { value: '20' } });
    fireEvent.change(within(packagePanel).getByLabelText('Mnozstvi'), { target: { value: '1' } });
    fireEvent.change(within(packagePanel).getByLabelText('Cena za jednotku'), { target: { value: '30' } });
    fireEvent.click(within(packagePanel).getByRole('button', { name: 'Pridat polozku' }));

    expect(mockSaveBudgetItem).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'JTI001',
      budgetPackageId: 1,
      section: 'CATERING',
      name: 'Voda',
      units: 'ks/action/czk',
      amount: 20,
      quantity: 1,
      unitPrice: 30,
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/views/ProjectStatsView.test.tsx`

Expected: FAIL because the budget UI is not rendered.

- [ ] **Step 3: Add budget imports and state**

In `src/views/ProjectStatsView.tsx`, add icons:

```ts
import { ArrowLeft, Calculator, ChevronDown, ChevronRight, Clock, MapPin, PackagePlus, Receipt, Users } from 'lucide-react';
```

Add budget service imports:

```ts
import {
  getBudgetDependencies,
  getProjectBudgetOverview,
  saveBudgetItem,
  saveBudgetPackage,
  subscribeToBudgetChanges,
} from '../features/budgets/services/budgets.service';
```

Add state near other local state:

```ts
  const [budgetOverview, setBudgetOverview] = useState(() => getProjectBudgetOverview(selectedProjectIdForStats));
  const [budgetEvents, setBudgetEvents] = useState<ReturnType<typeof getBudgetDependencies>['events']>([]);
  const [newPackageName, setNewPackageName] = useState('');
  const [newPackageEventIds, setNewPackageEventIds] = useState<number[]>([]);
  const [newItemsByPackage, setNewItemsByPackage] = useState<Record<number, {
    section: string;
    name: string;
    units: string;
    amount: string;
    quantity: string;
    unitPrice: string;
    note: string;
  }>>({});
```

In `loadData`, set budget data:

```ts
    setBudgetOverview(getProjectBudgetOverview(selectedProjectIdForStats));
    setBudgetEvents(getBudgetDependencies().events);
```

Add subscription:

```ts
  useEffect(() => subscribeToBudgetChanges(loadData), [loadData]);
```

- [ ] **Step 4: Add budget helper handlers**

Inside the component before `return`, add:

```ts
  const projectBudgetEvents = budgetEvents.filter((event) => event.job === project.id);

  const toggleNewPackageEvent = (eventId: number) => {
    setNewPackageEventIds((current) => (
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId].sort((a, b) => a - b)
    ));
  };

  const handleAddBudgetPackage = async () => {
    await saveBudgetPackage({
      projectId: project.id,
      name: newPackageName,
      note: '',
      eventIds: newPackageEventIds,
    });
    setNewPackageName('');
    setNewPackageEventIds([]);
    loadData();
  };

  const getDraftItem = (budgetPackageId: number) => (
    newItemsByPackage[budgetPackageId] ?? {
      section: '',
      name: '',
      units: '',
      amount: '1',
      quantity: '1',
      unitPrice: '0',
      note: '',
    }
  );

  const updateDraftItem = (budgetPackageId: number, field: keyof ReturnType<typeof getDraftItem>, value: string) => {
    setNewItemsByPackage((current) => ({
      ...current,
      [budgetPackageId]: {
        ...getDraftItem(budgetPackageId),
        ...current[budgetPackageId],
        [field]: value,
      },
    }));
  };

  const handleAddBudgetItem = async (budgetPackageId: number) => {
    const draft = getDraftItem(budgetPackageId);
    await saveBudgetItem({
      projectId: project.id,
      budgetPackageId,
      eventId: null,
      section: draft.section,
      name: draft.name,
      units: draft.units,
      amount: Number(draft.amount),
      quantity: Number(draft.quantity),
      unitPrice: Number(draft.unitPrice),
      note: draft.note,
    });
    setNewItemsByPackage((current) => {
      const next = { ...current };
      delete next[budgetPackageId];
      return next;
    });
    loadData();
  };
```

- [ ] **Step 5: Render budget section**

Insert this JSX after the existing stat cards grid and before the existing chart grid:

```tsx
        <div className="mb-8 rounded-[24px] border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--nodu-text)]">
                <Calculator size={16} />
                Rozpocet
              </h2>
              <p className="mt-1 text-xs text-[var(--nodu-text-soft)]">Planovane naklady podle baliku a akci projektu.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded-[16px] border border-[var(--nodu-border)] bg-white px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Planovany rozpocet</div>
                <div className="mt-1 font-bold text-[var(--nodu-text)]">{formatCurrency(budgetOverview.plannedTotal)}</div>
              </div>
              <div className="rounded-[16px] border border-[var(--nodu-border)] bg-white px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Skutecne naklady</div>
                <div className="mt-1 font-bold text-[var(--nodu-text)]">{formatCurrency(budgetOverview.actualTotal)}</div>
              </div>
              <div className="rounded-[16px] border border-[var(--nodu-border)] bg-white px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Rozdil</div>
                <div className="mt-1 font-bold text-[var(--nodu-text)]">{formatCurrency(budgetOverview.variance)}</div>
              </div>
              <div className="rounded-[16px] border border-[var(--nodu-border)] bg-white px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Baliky / akce</div>
                <div className="mt-1 font-bold text-[var(--nodu-text)]">{budgetOverview.packageCount} / {budgetOverview.linkedEventCount}</div>
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-[18px] border border-[var(--nodu-border)] bg-white p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">
              <PackagePlus size={14} />
              Novy balik
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_1fr_auto] lg:items-start">
              <label className="text-xs font-medium text-[var(--nodu-text)]">
                Nazev baliku
                <input
                  aria-label="Nazev baliku"
                  value={newPackageName}
                  onChange={(event) => setNewPackageName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--nodu-border)] bg-white px-3 py-2 text-xs"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {projectBudgetEvents.map((event) => (
                  <label key={event.id} className="inline-flex items-center gap-2 rounded-lg border border-[var(--nodu-border)] bg-[var(--nodu-paper-strong)] px-3 py-2 text-xs text-[var(--nodu-text)]">
                    <input
                      aria-label={event.name}
                      type="checkbox"
                      checked={newPackageEventIds.includes(event.id)}
                      onChange={() => toggleNewPackageEvent(event.id)}
                    />
                    {event.name}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddBudgetPackage}
                className="rounded-lg bg-[var(--nodu-accent)] px-4 py-2 text-xs font-bold text-white"
              >
                Pridat balik
              </button>
            </div>
          </div>

          {budgetOverview.packages.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-[var(--nodu-border)] bg-white px-4 py-8 text-center text-xs text-[var(--nodu-text-soft)]">
              Tento projekt zatim nema zadny rozpoctovy balik.
            </div>
          ) : (
            <div className="space-y-4">
              {budgetOverview.packages.map((budgetPackage) => {
                const draftItem = getDraftItem(budgetPackage.id);
                return (
                  <div key={budgetPackage.id} data-testid={`budget-package-${budgetPackage.id}`} className="rounded-[20px] border border-[var(--nodu-border)] bg-white p-4">
                    <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--nodu-text)]">{budgetPackage.name}</h3>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {budgetPackage.linkedEvents.map((event) => (
                            <span key={event.id} className="nodu-event-meta-badge">{event.name}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-right text-xs">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Plan</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatCurrency(budgetPackage.plannedTotal)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Skutecne</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatCurrency(budgetPackage.actualTotal)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--nodu-text-soft)]">Rozdil</div>
                          <div className="font-bold text-[var(--nodu-text)]">{formatCurrency(budgetPackage.variance)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--nodu-border)] text-[10px] uppercase tracking-wider text-[var(--nodu-text-soft)]">
                            <th className="px-3 py-2">Sekce</th>
                            <th className="px-3 py-2">Polozka</th>
                            <th className="px-3 py-2">Jednotky</th>
                            <th className="px-3 py-2 text-right">Pocet</th>
                            <th className="px-3 py-2 text-right">Mnozstvi</th>
                            <th className="px-3 py-2 text-right">Cena</th>
                            <th className="px-3 py-2 text-right">Celkem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {budgetPackage.items.map((item) => (
                            <tr key={item.id} className="border-b border-[rgba(var(--nodu-text-rgb),0.06)]">
                              <td className="px-3 py-2 font-bold text-[var(--nodu-text-soft)]">{item.section}</td>
                              <td className="px-3 py-2 font-medium text-[var(--nodu-text)]">{item.name}</td>
                              <td className="px-3 py-2 text-[var(--nodu-text-soft)]">{item.units}</td>
                              <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{item.amount}</td>
                              <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{item.quantity}</td>
                              <td className="px-3 py-2 text-right text-[var(--nodu-text)]">{formatCurrency(item.unitPrice)}</td>
                              <td className="px-3 py-2 text-right font-bold text-[var(--nodu-text)]">{formatCurrency(item.amount * item.quantity * item.unitPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid gap-2 md:grid-cols-6">
                      <input aria-label="Sekce" value={draftItem.section} onChange={(event) => updateDraftItem(budgetPackage.id, 'section', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                      <input aria-label="Polozka" value={draftItem.name} onChange={(event) => updateDraftItem(budgetPackage.id, 'name', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                      <input aria-label="Jednotky" value={draftItem.units} onChange={(event) => updateDraftItem(budgetPackage.id, 'units', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                      <input aria-label="Pocet" type="number" value={draftItem.amount} onChange={(event) => updateDraftItem(budgetPackage.id, 'amount', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                      <input aria-label="Mnozstvi" type="number" value={draftItem.quantity} onChange={(event) => updateDraftItem(budgetPackage.id, 'quantity', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                      <input aria-label="Cena za jednotku" type="number" value={draftItem.unitPrice} onChange={(event) => updateDraftItem(budgetPackage.id, 'unitPrice', event.target.value)} className="rounded-lg border border-[var(--nodu-border)] px-2 py-2 text-xs" />
                    </div>
                    <button type="button" onClick={() => handleAddBudgetItem(budgetPackage.id)} className="mt-2 rounded-lg border border-[var(--nodu-border)] px-3 py-2 text-xs font-bold text-[var(--nodu-text)]">
                      Pridat polozku
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
```

- [ ] **Step 6: Verify project budget UI tests pass**

Run: `npm test -- src/views/ProjectStatsView.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run focused project tests**

Run:

```bash
npm test -- src/views/ProjectStatsView.test.tsx src/features/budgets/services/budgets.service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/ProjectStatsView.tsx src/views/ProjectStatsView.test.tsx
git commit -m "feat: show project budget packages"
```

## Task 6: Final Verification

**Files:**
- No planned edits unless verification finds a defect.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test -- src/features/budgets/services/budgets.service.test.ts src/views/ProjectStatsView.test.tsx src/app/providers/AppDataBootstrap.test.tsx src/lib/app-data.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS with Vite build output and no TypeScript errors.

- [ ] **Step 3: Start dev server for manual check**

Run:

```bash
npm run dev
```

Expected: Vite prints a local URL. Open the app, go to `Projekty`, open a project, confirm the `Rozpocet` section renders, creating a package updates the package list, and adding a line item updates planned total.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional project budget files are modified, or the working tree is clean after commits.

## Self-Review

- Spec coverage: The plan covers project-level budget packages, linked events, budget line items matching workbook columns, rollups, project KPIs, Supabase direction, and tests. Excel import remains out of scope as specified.
- Red-flag scan: The plan has no open-ended markers or vague "add tests" instructions.
- Type consistency: The same names are used throughout: `BudgetPackage`, `BudgetItem`, `budgetPackageId`, `eventIds`, `unitPrice`, `getProjectBudgetOverview`, `saveBudgetPackage`, and `saveBudgetItem`.

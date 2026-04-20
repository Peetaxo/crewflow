# TanStack Query + Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Převést aplikaci ze současného modelu `Supabase hydration + localAppState shadow store` na `Supabase jako source of truth`, `TanStack Query` pro fetch/cache/invalidation a postupně přidat `Supabase Realtime` tam, kde dává smysl.

**Architecture:** Migrace proběhne po doménách a odděleně pro read a write flow. Nejprve se zavede Query infrastruktura a převedou se read modely nejdražších domén (`timelogs`, `receipts`, `invoices`), potom se po jedné doméně přesunou write operace z `updateLocalAppState` na přímé Supabase mutace s invalidací query cache. `AppContext` zůstane čistě UI-only a `localAppState` se bude po dokončení jednotlivých fází zmenšovat, až půjde odstranit úplně.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase Auth, Supabase Postgres, Supabase Realtime, Vitest, Vite

---

## Scope Check

Požadavek „už nejet na lokálním stavu, pokud to není nutné“ zasahuje dvě odlišné oblasti:

1. **UI state**
   - `AppContext`
   - filtry, taby, otevřené modaly, rozepsané formuláře
   - tohle je správně lokální stav a migrace se toho nemá dotknout

2. **Domain data state**
   - `clients`, `projects`, `events`, `crew`, `timelogs`, `receipts`, `invoices`, `candidates`
   - dnes jsou drženy v `localAppState` a jen se hydratují ze Supabase
   - tohle je migrační scope tohoto plánu

Tenhle plán se týká jen druhé oblasti.

## File Map

### Current infrastructure

- Modify: `src/main.tsx`
  - Zabalit aplikaci do `QueryClientProvider`.

- Create: `src/app/providers/QueryProvider.tsx`
  - Centralizované vytvoření `QueryClient`, výchozí query konfigurace a Devtools gate, pokud budou potřeba.

- Create: `src/lib/query-keys.ts`
  - Jednotné query keys pro domény, aby se daly bezpečně invalidovat mutace.

### Existing domain store to shrink over time

- Modify later: `src/lib/app-data.ts`
  - Dnes drží `localAppState`, `subscribeToLocalAppState` a fallback `INITIAL_*`.
  - Bude postupně zmenšován a na konci odstraněn z runtime data flow.

### First-wave domains

- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/features/invoices/services/invoices.service.ts`

- Create as needed:
  - `src/features/timelogs/queries/*.ts`
  - `src/features/receipts/queries/*.ts`
  - `src/features/invoices/queries/*.ts`

### Likely first-wave consumers

- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/ReceiptsView.tsx`
- Modify: `src/views/InvoicesView.tsx`
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/MyShiftsView.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/views/ApprovalsView.tsx`

### Later-wave domains

- `src/features/events/services/events.service.ts`
- `src/features/projects/services/projects.service.ts`
- `src/features/crew/services/crew.service.ts`
- `src/features/recruitment/services/candidates.service.ts`

### Tests to expand during migration

- `src/features/timelogs/services/timelogs.service.test.ts`
- `src/features/invoices/services/invoices.service.test.ts`
- `src/features/clients/services/clients.service.test.ts`
- Create focused query hook tests where useful
- Add small smoke coverage for views that switch from store subscriptions to query reads

---

## Phase 0: Query Infrastructure

### Task 1: Add global Query provider

**Files:**
- Create: `src/app/providers/QueryProvider.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create a dedicated provider wrapper**

Create `src/app/providers/QueryProvider.tsx`:

```tsx
import { PropsWithChildren, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function QueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Mount the provider at app root**

Update `src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import QueryProvider from './app/providers/QueryProvider';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <QueryProvider>
    <App />
  </QueryProvider>,
);
```

- [ ] **Step 3: Verify baseline app boot**

Run:

```bash
npm run build
npm test
```

Expected:
- build passes
- existing tests pass without behavior change

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx src/app/providers/QueryProvider.tsx
git commit -m "Add TanStack Query provider"
```

### Task 2: Add query key registry

**Files:**
- Create: `src/lib/query-keys.ts`

- [ ] **Step 1: Create one central query key helper**

```ts
export const queryKeys = {
  timelogs: {
    all: ['timelogs'] as const,
    list: (search: string) => ['timelogs', 'list', search] as const,
  },
  receipts: {
    all: ['receipts'] as const,
    list: (search: string) => ['receipts', 'list', search] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: (search: string) => ['invoices', 'list', search] as const,
  },
};
```

- [ ] **Step 2: Verify lint**

Run:

```bash
npm run lint
```

Expected:
- lint passes

- [ ] **Step 3: Commit**

```bash
git add src/lib/query-keys.ts
git commit -m "Add shared query key registry"
```

---

## Phase 1: Timelogs Read Migration

### Task 3: Move timelog reads to query hooks

**Files:**
- Create: `src/features/timelogs/queries/useTimelogsQuery.ts`
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/ApprovalsView.tsx`
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/MyShiftsView.tsx`

- [ ] **Step 1: Add a dedicated timelog fetch function that reads from Supabase directly**

Extract a pure fetcher from service code instead of calling `ensureSupabaseTimelogsLoaded()`:

```ts
export async function fetchTimelogsSnapshot(): Promise<Timelog[]> {
  // reuse existing hydration mapping logic
  // return mapped rows, do not write into localAppState
}
```

- [ ] **Step 2: Create the query hook**

Create `src/features/timelogs/queries/useTimelogsQuery.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchTimelogsSnapshot } from '../services/timelogs.service';

export const useTimelogsQuery = () => (
  useQuery({
    queryKey: queryKeys.timelogs.all,
    queryFn: fetchTimelogsSnapshot,
  })
);
```

- [ ] **Step 3: Convert one screen at a time from subscriptions to query reads**

For each first-wave consumer:
- remove `subscribeToTimelogChanges(...)`
- remove `getTimelogs(...)` as the source for initial screen state
- derive filtered screen data from `query.data`

Use this pattern:

```tsx
const timelogsQuery = useTimelogsQuery();
const timelogs = useMemo(
  () => filterTimelogs(timelogsQuery.data ?? [], searchQuery),
  [timelogsQuery.data, searchQuery],
);
```

- [ ] **Step 4: Keep write paths unchanged for now**

Do not migrate:
- `saveTimelog`
- `deleteTimelog`
- `markTimelogsAsInvoiced`
- `markTimelogsAsPaid`

Those belong to later phases.

- [ ] **Step 5: Add/adjust focused tests**

Run:

```bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts
npm run build
```

Expected:
- timelog tests still pass
- converted screens compile

- [ ] **Step 6: Commit**

```bash
git add src/features/timelogs/services/timelogs.service.ts src/features/timelogs/queries/useTimelogsQuery.ts src/views/TimelogsView.tsx src/views/ApprovalsView.tsx src/views/DashboardView.tsx src/views/MyShiftsView.tsx
git commit -m "Move timelog reads to TanStack Query"
```

---

## Phase 2: Receipts Read Migration

### Task 4: Move receipt reads to query hooks

**Files:**
- Create: `src/features/receipts/queries/useReceiptsQuery.ts`
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/views/ReceiptsView.tsx`
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/MyShiftsView.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add a pure receipt fetcher**

```ts
export async function fetchReceiptsSnapshot(): Promise<ReceiptItem[]> {
  // reuse current mapping logic
  // no updateLocalAppState side effect
}
```

- [ ] **Step 2: Create `useReceiptsQuery()`**

```ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import { fetchReceiptsSnapshot } from '../services/receipts.service';

export const useReceiptsQuery = () => (
  useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: fetchReceiptsSnapshot,
  })
);
```

- [ ] **Step 3: Replace store subscriptions in receipt consumers**

Use the same pattern as timelogs:

```tsx
const receiptsQuery = useReceiptsQuery();
const receipts = useMemo(
  () => filterReceipts(receiptsQuery.data ?? [], searchQuery),
  [receiptsQuery.data, searchQuery],
);
```

- [ ] **Step 4: Keep receipt writes unchanged**

Do not migrate yet:
- `saveReceipt`
- `deleteReceipt`
- `markReceiptsAsAttached`
- `markReceiptsAsReimbursed`

- [ ] **Step 5: Verify**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected:
- all existing checks pass
- receipts screen still works manually

- [ ] **Step 6: Commit**

```bash
git add src/features/receipts/services/receipts.service.ts src/features/receipts/queries/useReceiptsQuery.ts src/views/ReceiptsView.tsx src/views/DashboardView.tsx src/views/MyShiftsView.tsx src/components/layout/Sidebar.tsx
git commit -m "Move receipt reads to TanStack Query"
```

---

## Phase 3: Invoices Read Migration

### Task 5: Move invoice reads to query hooks

**Files:**
- Create: `src/features/invoices/queries/useInvoicesQuery.ts`
- Modify: `src/features/invoices/services/invoices.service.ts`
- Modify: `src/views/InvoicesView.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/views/DashboardView.tsx`

- [ ] **Step 1: Add pure invoice read functions**

Create service-level fetchers for:
- invoice list
- create candidates
- create preview

They must read from Supabase and derive the same view models without mutating `localAppState`.

- [ ] **Step 2: Add query hooks**

```ts
export const useInvoicesQuery = () => useQuery({ queryKey: queryKeys.invoices.all, queryFn: fetchInvoicesSnapshot });
```

Use additional hooks if preview/candidates become separate queries.

- [ ] **Step 3: Convert invoice consumers**

Screens should stop reading invoice lists from:
- `getInvoices()`
- `subscribeToInvoiceChanges()`

and instead use query results.

- [ ] **Step 4: Keep invoice mutations unchanged**

Do not change:
- `createInvoiceFromSelection`
- `approveInvoice`
- `sendInvoice`
- `deleteInvoice`

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
npm run build
```

Expected:
- invoice service tests still pass
- invoice screen compiles and reads from query

- [ ] **Step 6: Commit**

```bash
git add src/features/invoices/services/invoices.service.ts src/features/invoices/queries/useInvoicesQuery.ts src/views/InvoicesView.tsx src/components/layout/Sidebar.tsx src/views/DashboardView.tsx
git commit -m "Move invoice reads to TanStack Query"
```

---

## Phase 4: Timelogs + Receipts Write Migration

### Task 6: Replace local-only timelog and receipt writes with Supabase mutations

**Files:**
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/components/modals/TimelogEditModal.tsx`
- Modify: `src/components/modals/ReceiptEditModal.tsx`

- [ ] **Step 1: Convert timelog save/delete into async Supabase mutations**

Pattern:

```ts
export async function saveTimelog(updated: Timelog): Promise<Timelog> {
  // map UI model -> Supabase row update
  // await supabase write
  // return normalized server-backed model
}
```

- [ ] **Step 2: Convert receipt save/delete into async Supabase mutations**

Pattern:

```ts
export async function saveReceipt(updated: ReceiptItem): Promise<ReceiptItem> {
  // await supabase insert/update
  // return normalized server-backed model
}
```

- [ ] **Step 3: Replace local status helpers with explicit server mutations**

Migrate:
- `markTimelogsAsInvoiced`
- `markTimelogsAsPaid`
- `markReceiptsAsAttached`
- `markReceiptsAsReimbursed`

so they update Supabase first and stop being pure local snapshot transforms.

- [ ] **Step 4: Invalidate query cache instead of manual snapshot sync**

After each successful mutation:

```ts
await queryClient.invalidateQueries({ queryKey: queryKeys.timelogs.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test
npm run build
```

Expected:
- forms still save
- status transitions still work
- no screen relies on localAppState to reflect writes

- [ ] **Step 6: Commit**

```bash
git add src/features/timelogs/services/timelogs.service.ts src/features/receipts/services/receipts.service.ts src/components/modals/TimelogEditModal.tsx src/components/modals/ReceiptEditModal.tsx
git commit -m "Move timelog and receipt writes to Supabase"
```

---

## Phase 5: Events, Projects, Crew, Candidates

### Task 7: Migrate remaining domains one domain at a time

**Files:**
- Modify in sequence:
  - `src/features/events/services/events.service.ts`
  - `src/features/projects/services/projects.service.ts`
  - `src/features/crew/services/crew.service.ts`
  - `src/features/recruitment/services/candidates.service.ts`

- [ ] **Step 1: Events**
- move reads to query hooks
- move save/delete/assignment flows to Supabase writes
- invalidate related queries

- [ ] **Step 2: Projects**
- move reads to query hooks
- move save/delete to Supabase

- [ ] **Step 3: Crew**
- move reads to query hooks
- move create/update/delete to Supabase
- keep `AuthProvider` identity bridge working through query reads

- [ ] **Step 4: Candidates**
- move reads to query hooks
- move stage transitions to Supabase writes

- [ ] **Step 5: Verify each domain separately before moving on**

Run after each domain:

```bash
npm run lint
npm test
npm run build
```

- [ ] **Step 6: Commit after each domain**

Example:

```bash
git commit -m "Move event domain to TanStack Query"
git commit -m "Move project domain to TanStack Query"
git commit -m "Move crew domain to TanStack Query"
git commit -m "Move candidate domain to TanStack Query"
```

---

## Phase 6: Realtime and Store Removal

### Task 8: Add Supabase Realtime only for high-value domains

**Files:**
- Create/Modify as needed in first-wave query modules

- [ ] **Step 1: Start with invalidation-only realtime**

For:
- `timelogs`
- `receipts`
- `invoices`

subscribe to changes and invalidate matching query keys instead of rebuilding a central local store.

- [ ] **Step 2: Verify no event storms**

Manual smoke check:
- open app
- edit one invoice/timelog/receipt
- confirm one visible refresh, not repeated loops

- [ ] **Step 3: Commit**

```bash
git add src/features/timelogs src/features/receipts src/features/invoices
git commit -m "Add Supabase realtime query invalidation"
```

### Task 9: Remove obsolete local app store usage

**Files:**
- Modify: `src/lib/app-data.ts`
- Modify: all remaining `getLocalAppState` / `updateLocalAppState` consumers

- [ ] **Step 1: Search for remaining local store runtime usage**

Run:

```bash
rg -n "getLocalAppState|updateLocalAppState|subscribeToLocalAppState" src
```

Expected:
- only test code or temporary migration leftovers remain

- [ ] **Step 2: Remove runtime dependencies**

Delete or isolate:
- `localAppState`
- `subscribeToLocalAppState`
- hydration guard machinery used only for the old model

- [ ] **Step 3: Keep only safe local state**

Allowed to remain:
- `AppContext` UI state
- draft form state in components
- dev session storage in `AuthProvider`

- [ ] **Step 4: Final verification**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected:
- no runtime domain flow depends on legacy app-data store

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-data.ts src
git commit -m "Remove legacy local app data store"
```

---

## Recommended First Milestone

Implement these phases first and stop for review:

1. Phase 0: Query Infrastructure
2. Phase 1: Timelogs Read Migration
3. Phase 2: Receipts Read Migration

This milestone gives the best risk/reward ratio:
- biggest reduction in future data-layer coupling
- immediate foundation for replacing local shadow reads
- no forced big-bang write refactor

## Self-Review

- Spec coverage: plan covers infrastructure, domain order, read/write split, realtime adoption and final removal of `localAppState`.
- Placeholder scan: no TBDs or undefined migration direction; each phase has explicit scope and verification.
- Type consistency: `Query`, `Supabase`, `localAppState`, `read migration`, `write migration`, and `query invalidation` are used consistently across phases.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-tanstack-query-supabase-migration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

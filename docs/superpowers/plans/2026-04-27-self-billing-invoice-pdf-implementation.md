# Self-Billing Invoice PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-billing invoice PDF support where invoices store accounting snapshots, can generate a PDF through Supabase, and expose download/generate actions in the app.

**Architecture:** Keep browser code responsible for creating invoice records and invoking a Supabase Edge Function. Store immutable invoice metadata/snapshots in `invoices`, generate PDFs server-side into Supabase Storage, and keep UI actions small and explicit. First version supports non-VAT suppliers only and one supplier + one customer per invoice.

**Tech Stack:** React, TypeScript, Vitest, Supabase Postgres, Supabase Storage, Supabase Edge Functions, Deno PDF generation.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-04-27-self-billing-invoice-pdf-design.md`

Confirmed product rules:

- `profiles` is supplier.
- `clients` is customer.
- `timelog/receipt -> event -> project -> client` resolves the customer.
- Every invoice contains one supplier and one customer.
- Supplier is not a VAT payer in v1.
- Invoice number format is `SF-YYYY-PRIJMENI-J-0001`.
- Due date is `issue_date + 14 days`.
- PDF generation is manual in v1 through `Vygenerovat PDF`.

## File Map

- `supabase/self-billing-invoice-pdf-migration.sql`: SQL migration draft for invoice metadata, numbering RPC, storage bucket/policies.
- `src/lib/database.types.ts`: local generated-ish Supabase type updates for new invoice columns/RPC.
- `src/types.ts`: app-level `Invoice` and snapshot types.
- `src/lib/supabase-mappers.ts`: map new invoice columns into app `Invoice`.
- `src/lib/supabase-mappers.test.ts`: verify `project_id`/`client_id` are preserved in app models.
- `src/features/invoices/services/invoice-numbering.ts`: pure helpers for invoice number slug/prefix/date/due date.
- `src/features/invoices/services/invoice-numbering.test.ts`: unit tests for numbering helpers.
- `src/features/invoices/services/invoice-customer-resolution.ts`: pure customer resolution and snapshot validation helpers.
- `src/features/invoices/services/invoice-customer-resolution.test.ts`: tests for customer resolution/validation.
- `src/features/invoices/services/invoices.service.ts`: persist invoice metadata/snapshots and expose PDF generation/download service functions.
- `src/features/invoices/services/invoices.service.test.ts`: extend existing invoice tests.
- `src/features/invoices/services/invoice-pdf.service.ts`: browser wrapper around Supabase Edge Function and signed URL download.
- `src/features/invoices/services/invoice-pdf.service.test.ts`: tests for Edge Function/download wrapper.
- `src/views/InvoicesView.tsx`: add PDF buttons and loading state.
- `src/views/InvoicesView.test.tsx`: UI tests for PDF generate/download buttons.
- `supabase/functions/generate-invoice-pdf/index.ts`: Edge Function for server-side PDF generation.
- `supabase/functions/generate-invoice-pdf/README.md`: deployment notes and manual test steps.

## Task 1: Preserve Event Project and Project Client Links

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Create: `src/lib/supabase-mappers.test.ts`

- [ ] **Step 1: Write mapper test**

Create `src/lib/supabase-mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapEvent, mapProject } from './supabase-mappers';
import type { Database } from './database.types';

type EventRow = Database['public']['Tables']['events']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];

describe('supabase mappers', () => {
  it('preserves project_id on mapped events', () => {
    const row: EventRow = {
      id: 'event-uuid-1',
      name: 'Akce',
      project_id: 'project-uuid-1',
      job_number: 'JOB-1',
      client_name: null,
      date_from: '2026-04-27',
      date_to: '2026-04-27',
      time_from: null,
      time_to: null,
      city: 'Praha',
      crew_needed: 1,
      crew_filled: 0,
      status: 'upcoming',
      description: null,
      contact_person: null,
      contact_phone: null,
      contact_email: null,
      dresscode: null,
      meeting_point: null,
      show_day_types: null,
      day_types: null,
      phase_times: null,
      phase_schedules: null,
      created_at: '2026-04-27T00:00:00Z',
      updated_at: '2026-04-27T00:00:00Z',
    };

    expect(mapEvent(row).projectId).toBe('project-uuid-1');
  });

  it('preserves client_id and supabase id on mapped projects', () => {
    const row: ProjectRow = {
      id: 'project-uuid-1',
      job_number: 'JOB-1',
      name: 'Projekt',
      client_id: 'client-uuid-1',
      note: null,
      created_at: '2026-04-27T00:00:00Z',
      updated_at: '2026-04-27T00:00:00Z',
    };

    expect(mapProject(row, 'Next Level')).toMatchObject({
      id: 'JOB-1',
      supabaseId: 'project-uuid-1',
      clientId: 'client-uuid-1',
      client: 'Next Level',
    });
  });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/lib/supabase-mappers.test.ts
```

Expected: fail because `projectId`, `supabaseId`, and `clientId` are not mapped yet.

- [ ] **Step 3: Extend app types**

Modify `src/types.ts`:

```ts
export interface Event {
  id: number;
  projectId?: string | null;
  // keep existing fields
}
```

```ts
export interface Project {
  id: string;
  supabaseId?: string;
  name: string;
  client: string;
  clientId?: string | null;
  note?: string;
  createdAt: string;
}
```

- [ ] **Step 4: Map IDs from Supabase**

Modify `src/lib/supabase-mappers.ts`:

```ts
export function mapProject(row: ProjectRow, clientName?: string): Project {
  return {
    id: row.job_number,
    supabaseId: row.id,
    name: row.name,
    client: clientName ?? '',
    clientId: row.client_id,
    note: row.note ?? '',
    createdAt: row.created_at,
  };
}
```

```ts
export function mapEvent(row: EventRow): Event {
  return {
    id: Number.NaN,
    projectId: row.project_id,
    name: row.name,
    // keep the rest of the existing mapped fields unchanged
  };
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm test -- src/lib/supabase-mappers.test.ts
npm run lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/supabase-mappers.ts src/lib/supabase-mappers.test.ts
git commit -m "Preserve project client links in app models"
```

## Task 2: Add Database Metadata Draft and Types

**Files:**
- Create: `supabase/self-billing-invoice-pdf-migration.sql`
- Modify: `src/lib/database.types.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add SQL migration draft**

Create `supabase/self-billing-invoice-pdf-migration.sql`:

```sql
begin;

alter table public.invoices
  add column if not exists invoice_number text,
  add column if not exists issue_date date,
  add column if not exists taxable_supply_date date,
  add column if not exists due_date date,
  add column if not exists currency text not null default 'CZK',
  add column if not exists supplier_snapshot jsonb,
  add column if not exists customer_snapshot jsonb,
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz;

create unique index if not exists invoices_invoice_number_key
  on public.invoices(invoice_number)
  where invoice_number is not null;

create index if not exists idx_invoices_pdf_path
  on public.invoices(pdf_path)
  where pdf_path is not null;

create table if not exists public.invoice_number_sequences (
  id uuid primary key default gen_random_uuid(),
  invoice_year integer not null,
  supplier_profile_id uuid not null references public.profiles(id) on delete cascade,
  last_number integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_number_sequences_year_supplier_key unique (invoice_year, supplier_profile_id)
);

create or replace function public.next_self_billing_invoice_sequence(
  p_invoice_year integer,
  p_supplier_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.invoice_number_sequences (invoice_year, supplier_profile_id, last_number)
  values (p_invoice_year, p_supplier_profile_id, 1)
  on conflict (invoice_year, supplier_profile_id)
  do update set
    last_number = public.invoice_number_sequences.last_number + 1,
    updated_at = now()
  returning last_number into v_next;

  return v_next;
end;
$$;

insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

comment on column public.invoices.invoice_number is
  'Self-billing invoice number, e.g. SF-2026-NOVAK-T-0001.';
comment on column public.invoices.supplier_snapshot is
  'Immutable supplier billing snapshot copied from profiles when the invoice is issued.';
comment on column public.invoices.customer_snapshot is
  'Immutable customer billing snapshot copied from clients when the invoice is issued.';
comment on column public.invoices.pdf_path is
  'Private Supabase Storage path in bucket invoice-pdfs.';

commit;
```

- [ ] **Step 2: Update app invoice types**

Modify `src/types.ts` `Invoice` section to add:

```ts
export interface InvoiceSupplierSnapshot {
  profileId: string;
  name: string;
  ico: string;
  dic: string | null;
  bankAccount: string;
  billingStreet: string;
  billingZip: string;
  billingCity: string;
  billingCountry: string;
  vatPayer: false;
}

export interface InvoiceCustomerSnapshot {
  clientId: string;
  name: string;
  ico: string;
  dic: string | null;
  street: string;
  zip: string;
  city: string;
  country: string;
}
```

Extend `Invoice`:

```ts
  invoiceNumber?: string;
  issueDate?: string;
  taxableSupplyDate?: string;
  dueDate?: string;
  currency?: 'CZK';
  supplierSnapshot?: InvoiceSupplierSnapshot;
  customerSnapshot?: InvoiceCustomerSnapshot;
  pdfPath?: string | null;
  pdfGeneratedAt?: string | null;
```

- [ ] **Step 3: Update local database types**

In `src/lib/database.types.ts`, extend `invoices.Row` with:

```ts
          invoice_number: string | null;
          issue_date: string | null;
          taxable_supply_date: string | null;
          due_date: string | null;
          currency: string;
          supplier_snapshot: Json | null;
          customer_snapshot: Json | null;
          pdf_path: string | null;
          pdf_generated_at: string | null;
```

Add an RPC section under `public` if absent:

```ts
    Functions: {
      next_self_billing_invoice_sequence: {
        Args: {
          p_invoice_year: number;
          p_supplier_profile_id: string;
        };
        Returns: number;
      };
    };
```

- [ ] **Step 4: Verify types**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all pass. Existing Vite chunk warnings are acceptable.

- [ ] **Step 5: Commit**

```bash
git add supabase/self-billing-invoice-pdf-migration.sql src/lib/database.types.ts src/types.ts
git commit -m "Add self-billing invoice PDF metadata schema"
```

## Task 3: Add Invoice Numbering Helpers

**Files:**
- Create: `src/features/invoices/services/invoice-numbering.ts`
- Create: `src/features/invoices/services/invoice-numbering.test.ts`

- [ ] **Step 1: Write tests**

Create `src/features/invoices/services/invoice-numbering.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSelfBillingInvoiceNumber,
  getInvoiceDueDate,
  getInvoiceIssueDate,
  normalizeInvoiceNamePart,
} from './invoice-numbering';

describe('invoice numbering helpers', () => {
  it('normalizes Czech names for invoice numbers', () => {
    expect(normalizeInvoiceNamePart('Štěrbová')).toBe('STERBOVA');
    expect(normalizeInvoiceNamePart(' Novák ')).toBe('NOVAK');
  });

  it('builds self-billing invoice number with year surname initial and sequence', () => {
    expect(buildSelfBillingInvoiceNumber({
      year: 2026,
      firstName: 'Tomáš',
      lastName: 'Novák',
      sequence: 1,
    })).toBe('SF-2026-NOVAK-T-0001');
  });

  it('uses X placeholders for missing name parts', () => {
    expect(buildSelfBillingInvoiceNumber({
      year: 2026,
      firstName: '',
      lastName: '',
      sequence: 12,
    })).toBe('SF-2026-X-X-0012');
  });

  it('derives issue and due dates in YYYY-MM-DD', () => {
    expect(getInvoiceIssueDate(new Date('2026-04-27T10:00:00Z'))).toBe('2026-04-27');
    expect(getInvoiceDueDate('2026-04-27')).toBe('2026-05-11');
  });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/features/invoices/services/invoice-numbering.test.ts
```

Expected: fail because `invoice-numbering.ts` does not exist.

- [ ] **Step 3: Implement helpers**

Create `src/features/invoices/services/invoice-numbering.ts`:

```ts
const INVOICE_SEQUENCE_LENGTH = 4;

export const normalizeInvoiceNamePart = (value: string): string => {
  const normalized = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

  return normalized || 'X';
};

export const buildSelfBillingInvoiceNumber = ({
  year,
  firstName,
  lastName,
  sequence,
}: {
  year: number;
  firstName: string;
  lastName: string;
  sequence: number;
}): string => {
  const surname = normalizeInvoiceNamePart(lastName);
  const firstInitial = normalizeInvoiceNamePart(firstName).slice(0, 1) || 'X';
  const paddedSequence = String(sequence).padStart(INVOICE_SEQUENCE_LENGTH, '0');

  return `SF-${year}-${surname}-${firstInitial}-${paddedSequence}`;
};

export const getInvoiceIssueDate = (now = new Date()): string => (
  now.toISOString().slice(0, 10)
);

export const getInvoiceDueDate = (issueDate: string): string => {
  const date = new Date(`${issueDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
};
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/features/invoices/services/invoice-numbering.test.ts
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/invoices/services/invoice-numbering.ts src/features/invoices/services/invoice-numbering.test.ts
git commit -m "Add self-billing invoice numbering helpers"
```

## Task 4: Add Customer Resolution and Snapshot Validation

**Files:**
- Create: `src/features/invoices/services/invoice-customer-resolution.ts`
- Create: `src/features/invoices/services/invoice-customer-resolution.test.ts`

- [ ] **Step 1: Write tests**

Create `src/features/invoices/services/invoice-customer-resolution.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Client, Contractor, Event, Project, ReceiptItem, Timelog } from '../../../types';
import {
  buildCustomerSnapshot,
  buildSupplierSnapshot,
  resolveSingleInvoiceClient,
  validateInvoiceSnapshots,
} from './invoice-customer-resolution';

const clients: Client[] = [
  { id: 1, supabaseId: 'client-uuid-1', name: 'Next Level s.r.o.', ico: '12345678', dic: 'CZ12345678', street: 'Ulice 1', zip: '110 00', city: 'Praha', country: 'Ceska republika' },
  { id: 2, supabaseId: 'client-uuid-2', name: 'JCHP', ico: '87654321', dic: '', street: 'Ulice 2', zip: '120 00', city: 'Praha', country: 'Ceska republika' },
];

const projects: Project[] = [
  { id: 'JOB-1', supabaseId: 'project-uuid-1', name: 'Projekt 1', client: 'Next Level s.r.o.', clientId: 'client-uuid-1', createdAt: '2026-04-01' },
  { id: 'JOB-2', supabaseId: 'project-uuid-2', name: 'Projekt 2', client: 'JCHP', clientId: 'client-uuid-2', createdAt: '2026-04-01' },
];

const events: Event[] = [
  { id: 1, projectId: 'project-uuid-1', name: 'Akce 1', job: 'JOB-1', startDate: '2026-04-20', endDate: '2026-04-20', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'Next Level s.r.o.' },
  { id: 2, projectId: 'project-uuid-2', name: 'Akce 2', job: 'JOB-2', startDate: '2026-04-21', endDate: '2026-04-21', city: 'Praha', needed: 1, filled: 0, status: 'upcoming', client: 'JCHP' },
];

const timelogs: Timelog[] = [
  { id: 1, eid: 1, contractorProfileId: 'profile-1', days: [], km: 0, note: '', status: 'approved' },
];

const receipts: ReceiptItem[] = [
  { id: 1, eid: 1, contractorProfileId: 'profile-1', job: 'JOB-1', title: 'Taxi', vendor: 'Bolt', amount: 100, paidAt: '2026-04-20', note: '', status: 'approved' },
];

const contractor: Contractor = {
  id: 1,
  profileId: 'profile-1',
  userId: 'user-1',
  name: 'Tomas Novak',
  ii: 'TN',
  bg: '#000',
  fg: '#fff',
  tags: [],
  events: 0,
  rate: 200,
  phone: '',
  email: 'tomas@example.com',
  ico: '12345678',
  dic: '',
  bank: '123456789/0100',
  city: 'Praha',
  billingName: 'Tomas Novak',
  billingStreet: 'Dodavatelska 1',
  billingZip: '110 00',
  billingCity: 'Praha',
  billingCountry: 'Ceska republika',
  reliable: true,
  note: '',
};

describe('invoice customer resolution', () => {
  it('resolves one client from timelogs and receipts through event project client', () => {
    const client = resolveSingleInvoiceClient({
      timelogs,
      receipts,
      selectedTimelogIds: [1],
      selectedReceiptIds: [1],
      events,
      projects,
      clients,
    });

    expect(client.supabaseId).toBe('client-uuid-1');
  });

  it('throws when selected items point to multiple clients', () => {
    expect(() => resolveSingleInvoiceClient({
      timelogs: [...timelogs, { ...timelogs[0], id: 2, eid: 2 }],
      receipts: [],
      selectedTimelogIds: [1, 2],
      selectedReceiptIds: [],
      events,
      projects,
      clients,
    })).toThrow('Faktura muze obsahovat polozky pouze pro jednoho odberatele.');
  });

  it('builds supplier and customer snapshots and validates required fields', () => {
    const supplierSnapshot = buildSupplierSnapshot(contractor);
    const customerSnapshot = buildCustomerSnapshot(clients[0]);

    expect(validateInvoiceSnapshots(supplierSnapshot, customerSnapshot)).toEqual([]);
    expect(supplierSnapshot.vatPayer).toBe(false);
    expect(customerSnapshot.name).toBe('Next Level s.r.o.');
  });

  it('reports missing supplier bank account', () => {
    const supplierSnapshot = buildSupplierSnapshot({ ...contractor, bank: '' });
    const customerSnapshot = buildCustomerSnapshot(clients[0]);

    expect(validateInvoiceSnapshots(supplierSnapshot, customerSnapshot)).toContain('Dodavateli chybi bankovni ucet.');
  });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/features/invoices/services/invoice-customer-resolution.test.ts
```

Expected: fail because helper file does not exist.

- [ ] **Step 3: Implement helper**

Create `src/features/invoices/services/invoice-customer-resolution.ts` with pure functions that:

```ts
import type {
  Client,
  Contractor,
  Event,
  InvoiceCustomerSnapshot,
  InvoiceSupplierSnapshot,
  Project,
  ReceiptItem,
  Timelog,
} from '../../../types';

const requireText = (value: string | null | undefined): string => (value ?? '').trim();

const findClientForEvent = (
  eventId: number,
  events: Event[],
  projects: Project[],
  clients: Client[],
): Client => {
  const event = events.find((item) => item.id === eventId);
  if (!event?.projectId) {
    throw new Error('Akce nema prirazeny projekt.');
  }

  const project = projects.find((item) => item.supabaseId === event.projectId);
  if (!project?.clientId) {
    throw new Error('Projekt nema prirazeneho odberatele.');
  }

  const client = clients.find((item) => item.supabaseId === project.clientId);
  if (!client) {
    throw new Error('Odberatel projektu nebyl nalezen.');
  }

  return client;
};

export const resolveSingleInvoiceClient = ({
  timelogs,
  receipts,
  selectedTimelogIds,
  selectedReceiptIds,
  events,
  projects,
  clients,
}: {
  timelogs: Timelog[];
  receipts: ReceiptItem[];
  selectedTimelogIds: number[];
  selectedReceiptIds: number[];
  events: Event[];
  projects: Project[];
  clients: Client[];
}): Client => {
  const selectedTimelogs = timelogs.filter((item) => selectedTimelogIds.includes(item.id));
  const selectedReceipts = receipts.filter((item) => selectedReceiptIds.includes(item.id));
  const clientById = new Map<string, Client>();

  selectedTimelogs.forEach((timelog) => {
    const client = findClientForEvent(timelog.eid, events, projects, clients);
    clientById.set(client.supabaseId ?? String(client.id), client);
  });

  selectedReceipts.forEach((receipt) => {
    const client = findClientForEvent(receipt.eid, events, projects, clients);
    clientById.set(client.supabaseId ?? String(client.id), client);
  });

  if (clientById.size === 0) {
    throw new Error('Faktura nema zadne polozky s odberatelem.');
  }

  if (clientById.size > 1) {
    throw new Error('Faktura muze obsahovat polozky pouze pro jednoho odberatele.');
  }

  return Array.from(clientById.values())[0];
};

export const buildSupplierSnapshot = (contractor: Contractor): InvoiceSupplierSnapshot => ({
  profileId: contractor.profileId ?? '',
  name: requireText(contractor.billingName) || contractor.name,
  ico: requireText(contractor.ico),
  dic: requireText(contractor.dic) || null,
  bankAccount: requireText(contractor.bank),
  billingStreet: requireText(contractor.billingStreet),
  billingZip: requireText(contractor.billingZip),
  billingCity: requireText(contractor.billingCity) || requireText(contractor.city),
  billingCountry: requireText(contractor.billingCountry) || 'Ceska republika',
  vatPayer: false,
});

export const buildCustomerSnapshot = (client: Client): InvoiceCustomerSnapshot => ({
  clientId: client.supabaseId ?? String(client.id),
  name: requireText(client.name),
  ico: requireText(client.ico),
  dic: requireText(client.dic) || null,
  street: requireText(client.street),
  zip: requireText(client.zip),
  city: requireText(client.city),
  country: requireText(client.country) || 'Ceska republika',
});

export const validateInvoiceSnapshots = (
  supplier: InvoiceSupplierSnapshot,
  customer: InvoiceCustomerSnapshot,
): string[] => {
  const errors: string[] = [];

  if (!supplier.name) errors.push('Dodavateli chybi jmeno nebo firma.');
  if (!supplier.ico) errors.push('Dodavateli chybi ICO.');
  if (!supplier.billingStreet || !supplier.billingZip || !supplier.billingCity) {
    errors.push('Dodavateli chybi fakturacni adresa.');
  }
  if (!supplier.bankAccount) errors.push('Dodavateli chybi bankovni ucet.');
  if (!customer.name) errors.push('Odberateli chybi nazev.');
  if (!customer.ico) errors.push('Odberateli chybi ICO.');
  if (!customer.street || !customer.zip || !customer.city) {
    errors.push('Odberateli chybi adresa.');
  }

  return errors;
};
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/features/invoices/services/invoice-customer-resolution.test.ts
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/invoices/services/invoice-customer-resolution.ts src/features/invoices/services/invoice-customer-resolution.test.ts
git commit -m "Add invoice customer and snapshot helpers"
```

## Task 5: Persist Invoice Metadata and Snapshots

**Files:**
- Modify: `src/features/invoices/services/invoices.service.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Modify: `src/features/invoices/services/invoices.service.test.ts`

- [ ] **Step 1: Extend tests**

In `src/features/invoices/services/invoices.service.test.ts`, add a test near `createInvoiceFromSelection` tests:

```ts
it('persists invoice number dates and billing snapshots when creating an invoice', async () => {
  let snapshot = createSnapshot({
    timelogs: [
      {
        id: 2,
        eid: 2,
        contractorProfileId: 'profile-uuid-1',
        days: [{ d: '2026-04-11', f: '09:00', t: '16:00', type: 'provoz' as const }],
        km: 0,
        note: '',
        status: 'approved' as const,
      },
    ],
    receipts: [
      {
        id: 11,
        contractorProfileId: 'profile-uuid-1',
        eid: 2,
        job: 'AK002',
        title: 'Parkovne',
        vendor: 'Parking',
        amount: 300,
        paidAt: '2026-04-11',
        note: '',
        status: 'approved' as const,
      },
    ],
  });
  snapshot = {
    ...snapshot,
    contractors: [{
      ...snapshot.contractors[0],
      name: 'Tomas Novak',
      ico: '12345678',
      bank: '123456789/0100',
      billingName: 'Tomas Novak',
      billingStreet: 'Dodavatelska 1',
      billingZip: '110 00',
      billingCity: 'Praha',
      billingCountry: 'Ceska republika',
    }],
    events: snapshot.events.map((event) => event.id === 2 ? { ...event, projectId: 'project-uuid-2' } : event),
    projects: [{ id: 'AK002', supabaseId: 'project-uuid-2', name: 'Projekt 2', client: 'Klient B', clientId: 'client-uuid-2', createdAt: '2026-04-01' }],
    clients: [{ id: 2, supabaseId: 'client-uuid-2', name: 'Klient B', ico: '87654321', dic: '', street: 'Odberatelska 1', zip: '120 00', city: 'Praha', country: 'Ceska republika' }],
  };

  vi.setSystemTime(new Date('2026-04-27T10:00:00Z'));

  const invoiceInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'invoice-uuid-1' }, error: null });
  const invoiceInsert = vi.fn(() => ({ select: vi.fn(() => ({ single: invoiceInsertSingle })) }));
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  const fromMock = vi.fn((table: string) => {
    if (table === 'invoices') return { insert: invoiceInsert };
    if (table === 'invoice_items') return { insert: vi.fn().mockResolvedValue({ error: null }) };
    if (table === 'invoice_timelogs') return { insert: vi.fn().mockResolvedValue({ error: null }) };
    if (table === 'invoice_receipts') return { insert: vi.fn().mockResolvedValue({ error: null }) };
    if (table === 'timelogs') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'timelog-uuid-2' }], error: null }) })), update: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })) };
    if (table === 'receipts') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'receipt-uuid-11' }], error: null }) })), update: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })) };
    if (table === 'events') return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [{ id: 'event-uuid-2', date_from: '2026-04-11', name: 'Akce 2' }], error: null }) })) };
    throw new Error(`Unexpected table ${table}`);
  });

  vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
  vi.doMock('../../../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: { from: fromMock, rpc } }));
  vi.doMock('../../../lib/supabase-mappers', () => ({ mapInvoice: vi.fn() }));
  vi.doMock('../../../lib/app-data', () => ({
    getLocalAppState: () => structuredClone(snapshot),
    updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
      snapshot = structuredClone(updater(structuredClone(snapshot)));
      return structuredClone(snapshot);
    },
    subscribeToLocalAppState: vi.fn(() => () => undefined),
  }));
  vi.doMock('../../timelogs/services/timelogs.service', () => ({
    getTimelogs: () => structuredClone(snapshot.timelogs),
    markTimelogsAsInvoiced: vi.fn(),
    markTimelogsAsPaid: vi.fn(),
    markTimelogsAsPaidForInvoice: vi.fn(),
  }));
  vi.doMock('../../receipts/services/receipts.service', () => ({
    getReceipts: () => structuredClone(snapshot.receipts),
    markReceiptsAsAttached: vi.fn(),
    markReceiptsAsReimbursed: vi.fn(),
    markReceiptsAsReimbursedForInvoice: vi.fn(),
  }));
  vi.doMock('../../../data', () => ({ KM_RATE: 5 }));
  vi.doMock('../../../utils', () => ({ calculateTotalHours: () => 7 }));
  vi.doMock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

  const { createInvoiceFromSelection } = await import('./invoices.service');
  await createInvoiceFromSelection('profile-uuid-1', [2], [11]);

  expect(rpc).toHaveBeenCalledWith('next_self_billing_invoice_sequence', {
    p_invoice_year: 2026,
    p_supplier_profile_id: 'profile-uuid-1',
  });
  expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
    invoice_number: 'SF-2026-NOVAK-T-0001',
    issue_date: '2026-04-27',
    taxable_supply_date: '2026-04-27',
    due_date: '2026-05-11',
    currency: 'CZK',
    supplier_snapshot: expect.objectContaining({ vatPayer: false, ico: '12345678' }),
    customer_snapshot: expect.objectContaining({ clientId: 'client-uuid-2', name: 'Klient B' }),
  }));
});
```

Also update this test file's `beforeEach` to call `vi.useRealTimers()` and this test to call `vi.useFakeTimers()` before `vi.setSystemTime(...)`.

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected: fail because invoice metadata is not inserted yet.

- [ ] **Step 3: Import helpers in invoice service**

Modify `src/features/invoices/services/invoices.service.ts` imports:

```ts
import {
  buildSelfBillingInvoiceNumber,
  getInvoiceDueDate,
  getInvoiceIssueDate,
} from './invoice-numbering';
import {
  buildCustomerSnapshot,
  buildSupplierSnapshot,
  resolveSingleInvoiceClient,
  validateInvoiceSnapshots,
} from './invoice-customer-resolution';
```

- [ ] **Step 4: Generate metadata in `createInvoiceFromSelection`**

In `createInvoiceFromSelection`, before `persistSupabaseGeneratedInvoice(draftInvoice)`, derive:

```ts
  const snapshot = getLocalAppState();
  const contractor = findContractorByIdentity(snapshot.contractors ?? [], contractorProfileId);
  if (!contractor) {
    throw new Error('Dodavatel pro fakturu nebyl nalezen.');
  }

  const client = resolveSingleInvoiceClient({
    timelogs: snapshot.timelogs ?? [],
    receipts: snapshot.receipts ?? [],
    selectedTimelogIds,
    selectedReceiptIds,
    events: snapshot.events ?? [],
    projects: snapshot.projects ?? [],
    clients: snapshot.clients ?? [],
  });

  const supplierSnapshot = buildSupplierSnapshot(contractor);
  const customerSnapshot = buildCustomerSnapshot(client);
  const snapshotErrors = validateInvoiceSnapshots(supplierSnapshot, customerSnapshot);
  if (snapshotErrors.length > 0) {
    throw new Error(`PDF fakturacni udaje nejsou kompletni. ${snapshotErrors[0]}`);
  }

  const issueDate = getInvoiceIssueDate();
  const invoiceYear = Number(issueDate.slice(0, 4));
  const sequence = await getNextInvoiceSequence(invoiceYear, contractorProfileId);
  const invoiceNumber = buildSelfBillingInvoiceNumber({
    year: invoiceYear,
    firstName: contractor.name.split(' ')[0] ?? '',
    lastName: contractor.name.split(' ').slice(1).join(' ') || contractor.name,
    sequence,
  });
```

Add `getNextInvoiceSequence` helper in the same service:

```ts
const getNextInvoiceSequence = async (invoiceYear: number, contractorProfileId: string): Promise<number> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    const existingCount = (getLocalAppState().invoices ?? []).filter((invoice) => (
      invoice.contractorProfileId === contractorProfileId
      && invoice.invoiceNumber?.startsWith(`SF-${invoiceYear}-`)
    )).length;
    return existingCount + 1;
  }

  const result = await supabase.rpc('next_self_billing_invoice_sequence', {
    p_invoice_year: invoiceYear,
    p_supplier_profile_id: contractorProfileId,
  });

  if (result.error || typeof result.data !== 'number') {
    throw new Error(result.error?.message ?? 'Nepodarilo se vygenerovat cislo faktury.');
  }

  return result.data;
};
```

Build invoice with metadata:

```ts
  const draftInvoice = {
    ...buildInvoiceFromBatch(batch, 0),
    invoiceNumber,
    issueDate,
    taxableSupplyDate: issueDate,
    dueDate: getInvoiceDueDate(issueDate),
    currency: 'CZK' as const,
    supplierSnapshot,
    customerSnapshot,
    pdfPath: null,
    pdfGeneratedAt: null,
  };
```

- [ ] **Step 5: Persist metadata**

Modify `persistSupabaseGeneratedInvoice` invoice insert payload to include:

```ts
      invoice_number: invoice.invoiceNumber ?? null,
      issue_date: invoice.issueDate ?? null,
      taxable_supply_date: invoice.taxableSupplyDate ?? null,
      due_date: invoice.dueDate ?? null,
      currency: invoice.currency ?? 'CZK',
      supplier_snapshot: invoice.supplierSnapshot ?? null,
      customer_snapshot: invoice.customerSnapshot ?? null,
      pdf_path: invoice.pdfPath ?? null,
      pdf_generated_at: invoice.pdfGeneratedAt ?? null,
```

- [ ] **Step 6: Map metadata from Supabase**

Modify `src/lib/supabase-mappers.ts` `mapInvoice` to include:

```ts
    invoiceNumber: row.invoice_number ?? undefined,
    issueDate: row.issue_date ?? undefined,
    taxableSupplyDate: row.taxable_supply_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    currency: (row.currency ?? 'CZK') as 'CZK',
    supplierSnapshot: row.supplier_snapshot as Invoice['supplierSnapshot'],
    customerSnapshot: row.customer_snapshot as Invoice['customerSnapshot'],
    pdfPath: row.pdf_path ?? null,
    pdfGeneratedAt: row.pdf_generated_at ?? null,
```

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/invoices/services/invoices.service.ts src/lib/supabase-mappers.ts src/features/invoices/services/invoices.service.test.ts
git commit -m "Persist self-billing invoice snapshots"
```

## Task 6: Add Browser PDF Service

**Files:**
- Create: `src/features/invoices/services/invoice-pdf.service.ts`
- Create: `src/features/invoices/services/invoice-pdf.service.test.ts`

- [ ] **Step 1: Write tests**

Create `src/features/invoices/services/invoice-pdf.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const createSignedUrl = vi.fn();

vi.mock('../../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: { invoke },
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

describe('invoice PDF service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('invokes generate-invoice-pdf edge function', async () => {
    invoke.mockResolvedValue({ data: { pdfPath: 'invoices/1/test.pdf' }, error: null });

    const { generateInvoicePdf } = await import('./invoice-pdf.service');
    await expect(generateInvoicePdf('invoice-1')).resolves.toEqual({ pdfPath: 'invoices/1/test.pdf' });

    expect(invoke).toHaveBeenCalledWith('generate-invoice-pdf', {
      body: { invoiceId: 'invoice-1' },
    });
  });

  it('creates signed download URL for private invoice PDF', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/pdf' }, error: null });

    const { getInvoicePdfDownloadUrl } = await import('./invoice-pdf.service');
    await expect(getInvoicePdfDownloadUrl('invoices/1/test.pdf')).resolves.toBe('https://signed.example/pdf');
  });
});
```

- [ ] **Step 2: Verify failing test**

Run:

```bash
npm test -- src/features/invoices/services/invoice-pdf.service.test.ts
```

Expected: fail because service file does not exist.

- [ ] **Step 3: Implement service**

Create `src/features/invoices/services/invoice-pdf.service.ts`:

```ts
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';

const INVOICE_PDF_BUCKET = 'invoice-pdfs';
const SIGNED_URL_TTL_SECONDS = 60 * 5;

export type GenerateInvoicePdfResult = {
  pdfPath: string;
};

export const generateInvoicePdf = async (invoiceId: string): Promise<GenerateInvoicePdfResult> => {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const result = await supabase.functions.invoke<GenerateInvoicePdfResult>('generate-invoice-pdf', {
    body: { invoiceId },
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data?.pdfPath) {
    throw new Error('PDF se nepodarilo vygenerovat.');
  }

  return result.data;
};

export const getInvoicePdfDownloadUrl = async (pdfPath: string): Promise<string> => {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const result = await supabase
    .storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS);

  if (result.error || !result.data?.signedUrl) {
    throw new Error(result.error?.message ?? 'PDF se nepodarilo pripravit ke stazeni.');
  }

  return result.data.signedUrl;
};
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/features/invoices/services/invoice-pdf.service.test.ts
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/invoices/services/invoice-pdf.service.ts src/features/invoices/services/invoice-pdf.service.test.ts
git commit -m "Add invoice PDF client service"
```

## Task 7: Add Invoice PDF UI Actions

**Files:**
- Modify: `src/views/InvoicesView.tsx`
- Modify: `src/views/InvoicesView.test.tsx`

- [ ] **Step 1: Extend UI tests**

Add tests to `src/views/InvoicesView.test.tsx`:

```ts
const refetchInvoices = vi.fn();
let mockInvoices: Invoice[] = [];

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: mockInvoices, isLoading: false, error: null, refetch: refetchInvoices }),
}));

vi.mock('../features/invoices/services/invoice-pdf.service', () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue({ pdfPath: 'invoices/invoice-uuid-1/SF-2026-NOVAK-T-0001.pdf' }),
  getInvoicePdfDownloadUrl: vi.fn().mockResolvedValue('https://signed.example/invoice.pdf'),
}));

const createInvoiceForPdfTest = (pdfPath: string | null = null): Invoice => ({
  id: 'invoice-uuid-1',
  contractorProfileId: 'profile-uuid-1',
  eid: 1,
  hours: 7,
  hAmt: 1400,
  km: 0,
  kAmt: 0,
  receiptAmt: 0,
  total: 1400,
  job: 'JOB-1',
  status: 'draft',
  sentAt: null,
  invoiceNumber: 'SF-2026-NOVAK-T-0001',
  pdfPath,
  pdfGeneratedAt: pdfPath ? '2026-04-27T10:00:00Z' : null,
});

it('shows generate PDF button when invoice has no pdfPath', () => {
  mockInvoices = [createInvoiceForPdfTest(null)];

  render(<InvoicesView />);

  expect(screen.getByRole('button', { name: /Vygenerovat PDF/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Stahnout PDF/i })).not.toBeInTheDocument();
});

it('shows download PDF button when invoice has pdfPath', () => {
  mockInvoices = [createInvoiceForPdfTest('invoices/invoice-uuid-1/SF-2026-NOVAK-T-0001.pdf')];

  render(<InvoicesView />);

  expect(screen.getByRole('button', { name: /Stahnout PDF/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Vygenerovat PDF/i })).not.toBeInTheDocument();
});
```

Update the imports at the top of `src/views/InvoicesView.test.tsx` to import `beforeEach` from Vitest and include `Invoice` in the type import. Replace the existing `useInvoicesQuery` mock with the mutable `mockInvoices` version above. Add this setup inside `describe('InvoicesView', ...)` before the tests:

```ts
  beforeEach(() => {
    mockInvoices = [];
    refetchInvoices.mockReset();
  });
```

- [ ] **Step 2: Verify failing tests**

Run:

```bash
npm test -- src/views/InvoicesView.test.tsx
```

Expected: fail because buttons do not exist.

- [ ] **Step 3: Implement UI**

In `src/views/InvoicesView.tsx`:

Import:

```ts
import { generateInvoicePdf, getInvoicePdfDownloadUrl } from '../features/invoices/services/invoice-pdf.service';
```

Add state:

```ts
  const [pdfActionInvoiceId, setPdfActionInvoiceId] = useState<string | null>(null);
```

Add handlers:

```ts
  const handleGeneratePdf = async (invoiceId: string) => {
    try {
      setPdfActionInvoiceId(invoiceId);
      await generateInvoicePdf(invoiceId);
      toast.success('PDF faktury bylo vygenerovano.');
      invoicesQuery.refetch?.();
      loadDependencies();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se vygenerovat PDF.');
    } finally {
      setPdfActionInvoiceId(null);
    }
  };

  const handleDownloadPdf = async (pdfPath: string) => {
    try {
      const url = await getInvoicePdfDownloadUrl(pdfPath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se stahnout PDF.');
    }
  };
```

In each invoice card action area, add:

```tsx
                {invoice.pdfPath ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf(invoice.pdfPath!)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Stahnout PDF
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleGeneratePdf(invoice.id)}
                    disabled={pdfActionInvoiceId === invoice.id}
                    className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-emerald-300"
                  >
                    {pdfActionInvoiceId === invoice.id ? 'Generuji PDF...' : 'Vygenerovat PDF'}
                  </button>
                )}
```

- [ ] **Step 4: Verify**

Run:

```bash
npm test -- src/views/InvoicesView.test.tsx
npm run lint
npm run build
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/views/InvoicesView.tsx src/views/InvoicesView.test.tsx
git commit -m "Add invoice PDF actions to invoices view"
```

## Task 8: Add Supabase Edge Function Skeleton

**Files:**
- Create: `supabase/functions/generate-invoice-pdf/index.ts`
- Create: `supabase/functions/generate-invoice-pdf/README.md`

- [ ] **Step 1: Create Edge Function**

Create `supabase/functions/generate-invoice-pdf/index.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InvoicePayload = {
  invoiceId?: string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { invoiceId } = await request.json() as InvoicePayload;
    if (!invoiceId) {
      return json({ error: 'invoiceId is required' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Supabase environment is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const invoiceResult = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', invoiceId)
      .single();

    if (invoiceResult.error || !invoiceResult.data) {
      return json({ error: invoiceResult.error?.message ?? 'Invoice not found' }, 404);
    }

    const invoice = invoiceResult.data;
    if (!invoice.invoice_number) {
      return json({ error: 'Invoice number is missing' }, 400);
    }

    const pdfBytes = new TextEncoder().encode(
      `Faktura ${invoice.invoice_number}\nVystaveno odberatelem\nDodavatel neni platcem DPH\n`,
    );
    const pdfPath = `invoices/${invoice.id}/${invoice.invoice_number}.pdf`;

    const uploadResult = await supabase
      .storage
      .from('invoice-pdfs')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadResult.error) {
      return json({ error: uploadResult.error.message }, 500);
    }

    const updateResult = await supabase
      .from('invoices')
      .update({
        pdf_path: pdfPath,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);

    if (updateResult.error) {
      return json({ error: updateResult.error.message }, 500);
    }

    return json({ pdfPath });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});

const json = (body: unknown, status = 200): Response => (
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
);
```

This skeleton intentionally creates a minimal file payload first. Replace with true PDF bytes in Task 8 before production use.

- [ ] **Step 2: Add README**

Create `supabase/functions/generate-invoice-pdf/README.md`:

```md
# generate-invoice-pdf

Generates a self-billing invoice PDF for one invoice and stores it in private Supabase Storage bucket `invoice-pdfs`.

Required env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy:

```bash
supabase functions deploy generate-invoice-pdf
```

Manual call from the app happens through `supabase.functions.invoke('generate-invoice-pdf', { body: { invoiceId } })`.
```

- [ ] **Step 3: Verify repo checks**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: pass. Edge Function is not part of Vite build.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-invoice-pdf/index.ts supabase/functions/generate-invoice-pdf/README.md
git commit -m "Add invoice PDF edge function skeleton"
```

## Task 9: Replace Skeleton With Real PDF Rendering

**Files:**
- Modify: `supabase/functions/generate-invoice-pdf/index.ts`
- Create: `supabase/functions/generate-invoice-pdf/invoice-pdf.ts`

- [ ] **Step 1: Create PDF renderer**

Create `supabase/functions/generate-invoice-pdf/invoice-pdf.ts`:

```ts
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

type InvoiceItem = {
  job_number: string;
  hours: number;
  amount_hours: number;
  km: number;
  amount_km: number;
  amount_receipts: number;
  total_amount: number;
};

type Snapshot = Record<string, unknown>;

const money = (value: unknown): string => `${Number(value ?? 0).toLocaleString('cs-CZ')} Kc`;
const text = (value: unknown): string => String(value ?? '');

export const renderInvoicePdf = async ({
  invoice,
  items,
}: {
  invoice: Record<string, unknown>;
  items: InvoiceItem[];
}): Promise<Uint8Array> => {
  const supplier = invoice.supplier_snapshot as Snapshot;
  const customer = invoice.customer_snapshot as Snapshot;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let y = 790;

  const draw = (value: string, x = 48, size = 10, useBold = false) => {
    page.drawText(value, { x, y, size, font: useBold ? bold : font, color: rgb(0.07, 0.09, 0.15) });
    y -= size + 8;
  };

  draw('Faktura', 48, 24, true);
  draw('Vystaveno odberatelem', 48, 11, true);
  draw(`Cislo faktury: ${text(invoice.invoice_number)}`, 48, 11);
  draw(`Datum vystaveni: ${text(invoice.issue_date)} | Datum plneni: ${text(invoice.taxable_supply_date)} | Splatnost: ${text(invoice.due_date)}`, 48, 9);
  y -= 12;

  draw('Dodavatel', 48, 13, true);
  draw(text(supplier.name));
  draw(`${text(supplier.billingStreet)}, ${text(supplier.billingZip)} ${text(supplier.billingCity)}, ${text(supplier.billingCountry)}`);
  draw(`ICO: ${text(supplier.ico)} | DIC: ${text(supplier.dic || 'neni')}`);
  draw(`Bankovni ucet: ${text(supplier.bankAccount)}`);
  draw('Dodavatel neni platcem DPH.');
  y -= 10;

  draw('Odberatel', 48, 13, true);
  draw(text(customer.name));
  draw(`${text(customer.street)}, ${text(customer.zip)} ${text(customer.city)}, ${text(customer.country)}`);
  draw(`ICO: ${text(customer.ico)} | DIC: ${text(customer.dic || 'neni')}`);
  y -= 12;

  draw('Polozky', 48, 13, true);
  draw('Job | Hodiny | Hodiny Kc | Km | Cestovne | Uctenky | Celkem', 48, 8, true);
  items.forEach((item) => {
    draw(`${item.job_number} | ${item.hours} | ${money(item.amount_hours)} | ${item.km} | ${money(item.amount_km)} | ${money(item.amount_receipts)} | ${money(item.total_amount)}`, 48, 8);
  });

  y -= 16;
  draw(`Celkem k uhrade: ${money(invoice.total_amount)}`, 48, 16, true);

  return pdfDoc.save();
};
```

- [ ] **Step 2: Use PDF renderer in Edge Function**

Update `supabase/functions/generate-invoice-pdf/index.ts`:

```ts
import { renderInvoicePdf } from './invoice-pdf.ts';
```

Replace the skeleton `TextEncoder().encode(...)` block with:

```ts
    const pdfBytes = await renderInvoicePdf({
      invoice,
      items: invoice.invoice_items ?? [],
    });
```

Concrete acceptance for this task:

- uploaded object has `contentType: 'application/pdf'`
- downloaded file opens as a PDF
- PDF visibly contains invoice number, supplier, customer, item rows, total, `Vystaveno odberatelem`, `Dodavatel neni platcem DPH`

- [ ] **Step 3: Manual Edge Function test**

After deploying SQL and function to Supabase:

```bash
supabase functions deploy generate-invoice-pdf
```

In the app:

1. Create an invoice with complete supplier/customer data.
2. Click `Vygenerovat PDF`.
3. Click `Stahnout PDF`.
4. Verify the PDF opens and contains required content.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-invoice-pdf/index.ts supabase/functions/generate-invoice-pdf/invoice-pdf.ts
git commit -m "Render self-billing invoice PDF"
```

## Task 10: Final Verification and Preview

**Files:**
- No expected code changes unless fixing test/build issues.

- [ ] **Step 1: Run full checks**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected:

- lint passes
- tests pass
- build passes with only known Vite chunk/Browserslist warnings

- [ ] **Step 2: Start preview**

Run:

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

Open local preview and verify:

- Faktury list renders.
- Invoice without `pdfPath` shows `Vygenerovat PDF`.
- Invoice with `pdfPath` shows `Stahnout PDF`.
- Generate action shows loading and toast.

- [ ] **Step 3: Commit any final fixes**

If fixes were needed:

```bash
git add src/features/invoices/services src/views/InvoicesView.tsx src/views/InvoicesView.test.tsx src/types.ts src/lib/supabase-mappers.ts src/lib/database.types.ts supabase
git commit -m "Stabilize self-billing invoice PDF flow"
```

If no fixes were needed, do not create an empty commit.

## Implementation Notes

- Do not push until the user approves after preview.
- Do not mix this with Nodu design files or onboarding plans.
- Keep all PDF text in ASCII for now to match existing repo style; later UI copy cleanup can restore Czech diacritics consistently.
- If Supabase quota or Edge Function deployment is unavailable, complete frontend/type/service tasks and leave Edge Function manual verification blocked with a clear note.
- Task 8 creates a temporary non-PDF payload only to wire Edge Function, Storage, and DB update plumbing. Task 9 must be completed before the feature is considered usable.

## Self-Review

Spec coverage:

- Event/project/client app links: Task 1.
- DB metadata: Task 2.
- Numbering: Task 3 and Task 5.
- Client resolution and snapshots: Task 4 and Task 5.
- Manual PDF generation and download: Task 6 and Task 7.
- Edge Function + Storage: Task 8 and Task 9.
- Verification/preview: Task 10.

Placeholder scan:

- No unresolved placeholders remain. Task 9 selects `pdf-lib@1.17.1` from `esm.sh` for Supabase Edge Function PDF generation.

Type consistency:

- App types use `invoiceNumber`, `issueDate`, `taxableSupplyDate`, `dueDate`, `currency`, `supplierSnapshot`, `customerSnapshot`, `pdfPath`, `pdfGeneratedAt`.
- Supabase columns use `invoice_number`, `issue_date`, `taxable_supply_date`, `due_date`, `currency`, `supplier_snapshot`, `customer_snapshot`, `pdf_path`, `pdf_generated_at`.

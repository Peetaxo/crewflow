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

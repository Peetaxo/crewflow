import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Invoice, Project, ReceiptItem, Timelog } from '../../../types';
import * as projects from './projects.service';
import { KM_RATE, MEAL_RATE } from '../../../data';

const project = (id = 'AK001', client = 'Klient A'): Project => ({ id, client, name: `Projekt ${id}`, createdAt: '2026-01-01' });
const event = (overrides: Partial<Event> = {}): Event => ({
  id: 1, supabaseId: 'event-1', name: 'Realizace', job: 'AK001', client: 'Klient A',
  startDate: '2026-04-10', endDate: '2026-04-10', city: 'Praha', needed: 1, filled: 1,
  status: 'past', mealAllowanceEnabled: true, ...overrides,
});
const contractor: Contractor = {
  id: 1, profileId: 'crew-1', name: 'Jana Novakova', ii: 'JN', bg: '', fg: '', tags: [],
  events: 1, rate: 300, phone: '', email: '', ico: '', dic: '', bank: '', city: '', reliable: true, note: '',
};
const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 1, supabaseId: 'timelog-1', eid: 1, eventSupabaseId: 'event-1', contractorProfileId: 'crew-1',
  days: [{ d: '2026-04-10', f: '08:00', t: '16:00', type: 'provoz', meals: ['obed'] }],
  km: 10, note: '', status: 'approved', ...overrides,
});
const receipt = (overrides: Partial<ReceiptItem> = {}): ReceiptItem => ({
  id: 1, supabaseId: 'receipt-1', eid: 1, eventSupabaseId: 'event-1', job: 'AK001',
  contractorProfileId: 'crew-1', title: 'Parkovne', vendor: 'Parking', amount: 150,
  paidAt: '2026-04-10', note: '', status: 'approved', ...overrides,
});
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-1', contractorProfileId: 'crew-1', eid: 1, hours: 8, hAmt: 1600, km: 10, kAmt: 50,
  mealAmt: 200, receiptAmt: 150, total: 2000, job: 'AK001', jobNumbers: ['AK001'],
  timelogIds: [1], timelogSupabaseIds: ['timelog-1'], receiptIds: [1], receiptSupabaseIds: ['receipt-1'],
  status: 'sent', sentAt: '2026-04-11', ...overrides,
});
const snapshot = (overrides = {}) => ({
  projects: [project(), project('AK002', 'Klient B')], events: [event()], contractors: [contractor],
  timelogs: [] as Timelog[], receipts: [] as ReceiptItem[], invoices: [] as Invoice[], ...overrides,
});
const amount = (work = 0, travel = 0, meals = 0, receipts = 0) => ({ work, travel, meals, receipts, total: work + travel + meals + receipts });

describe('project period', () => {
  it('has no period when there are no events', () => {
    expect(projects.getProjectPeriod([])).toBeNull();
    expect(projects.formatProjectPeriod(null)).toBe('—');
  });
  it('uses the full event period and formats one day in Czech', () => {
    expect(projects.getProjectPeriod([event()])).toEqual({ startDate: '2026-04-10', endDate: '2026-04-10' });
    expect(projects.formatProjectPeriod(projects.getProjectPeriod([event()]))).toBe('10. 4. 2026');
    expect(projects.getProjectPeriod([event({ endDate: '2026-04-18' })])).toEqual({ startDate: '2026-04-10', endDate: '2026-04-18' });
  });
  it('finds earliest start and latest end independent of event order', () => {
    const period = projects.getProjectPeriod([
      event({ startDate: '2027-01-03', endDate: '2027-01-05' }),
      event({ startDate: '2026-12-20', endDate: '2027-01-10' }),
    ]);
    expect(period).toEqual({ startDate: '2026-12-20', endDate: '2027-01-10' });
    expect(projects.formatProjectPeriod(period)).toBe('20. 12. 2026 – 10. 1. 2027');
  });
});

describe('project financial summary', () => {
  it('returns null for a missing project', () => expect(projects.getProjectSummary('missing', snapshot())).toBeNull());
  it('sorts project events without mutating the snapshot and includes job-only receipts', () => {
    const events = [event({ id: 2, supabaseId: 'event-2', startDate: '2026-04-20', endDate: '2026-04-25' }), event(), event({ id: 3, supabaseId: 'event-3', job: 'AK002' })];
    const data = snapshot({ events, receipts: [receipt({ eid: 0, eventSupabaseId: undefined }), receipt({ id: 2, supabaseId: 'receipt-2', job: 'AK002', eid: 3 })] });
    const summary = projects.getProjectSummary('AK001', data)!;
    expect(summary.events.map((item) => item.id)).toEqual([1, 2]);
    expect(summary.period).toEqual({ startDate: '2026-04-10', endDate: '2026-04-25' });
    expect(summary.receipts.map((item) => item.id)).toEqual([1]);
    expect(events.map((item) => item.id)).toEqual([2, 1, 3]);
  });
  it('includes travel and enabled meals while excluding rejected expenses', () => {
    const summary = projects.getProjectSummary('AK001', snapshot({
      timelogs: [timelog(), timelog({ id: 2, supabaseId: 'rejected', status: 'rejected' })],
      receipts: [receipt(), receipt({ id: 2, supabaseId: 'rejected-receipt', status: 'rejected', amount: 999 })],
    }))!;
    expect(summary.costs).toEqual(amount(2400, 10 * KM_RATE, MEAL_RATE, 150));
    expect(summary.stages.approved).toEqual(summary.costs);
    expect(summary.stages.inProgress.total + summary.stages.invoiced.total + summary.stages.paid.total).toBe(0);
  });
  it('honors an event with disabled meal allowance', () => {
    expect(projects.getProjectSummary('AK001', snapshot({ events: [event({ mealAllowanceEnabled: false })], timelogs: [timelog()] }))!.costs.meals).toBe(0);
  });
  it('keeps four lifecycle stages disjoint including orphan invoiced and paid expenses', () => {
    const summary = projects.getProjectSummary('AK001', snapshot({
      timelogs: ['draft', 'pending_crew_confirmation', 'pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid'].map((status, i) => timelog({
        id: i + 1, supabaseId: `timelog-${i + 1}`, status: status as Timelog['status'], km: 0,
        days: [{ d: '2026-04-10', f: '08:00', t: '09:00', type: 'provoz' }],
      })),
      receipts: ['draft', 'submitted', 'approved', 'attached', 'reimbursed'].map((status, i) => receipt({
        id: i + 1, supabaseId: `receipt-${i + 1}`, status: status as ReceiptItem['status'], amount: 100,
      })),
    }))!;
    expect(summary.stages).toEqual({ inProgress: amount(1200, 0, 0, 200), approved: amount(300, 0, 0, 100), invoiced: amount(300, 0, 0, 100), paid: amount(300, 0, 0, 100) });
    expect(Object.values(summary.stages).reduce((sum, stage) => sum + stage.total, 0)).toBe(summary.costs.total);
  });
  it.each([['draft', 'approved'], ['sent', 'invoiced'], ['paid', 'paid']] as const)('places %s invoice amounts in %s and freezes historic rates', (status, stage) => {
    const billed = invoice({ status });
    const summary = projects.getProjectSummary('AK001', snapshot({ invoices: [billed], timelogs: [timelog({ status: 'invoiced' })], receipts: [receipt({ status: 'attached' })] }))!;
    expect(summary.costs).toEqual(amount(1600, 50, 200, 150));
    expect(summary.stages[stage]).toEqual(summary.costs);
    expect(Object.values(summary.stages).filter((item) => item.total > 0)).toHaveLength(1);
    expect(summary.invoices).toEqual([{ invoice: billed, share: amount(1600, 50, 200, 150) }]);
  });
  it('prefers UUID links over stale numeric IDs and counts a linked receipt once', () => {
    const summary = projects.getProjectSummary('AK001', snapshot({
      invoices: [invoice({ timelogIds: [999], receiptIds: [2] })],
      timelogs: [timelog({ id: 42 }), timelog({ id: 999, supabaseId: 'new-timelog', days: [{ d: '2026-04-10', f: '08:00', t: '09:00', type: 'provoz' }], km: 0 })],
      receipts: [receipt({ id: 99 }), receipt({ id: 2, supabaseId: 'new-receipt', amount: 20 })],
    }))!;
    expect(summary.costs).toEqual(amount(1900, 50, 200, 170));
    expect(summary.stages.approved).toEqual(amount(300, 0, 0, 20));
    expect(summary.stages.invoiced).toEqual(amount(1600, 50, 200, 150));
  });
  it('uses stable event UUIDs when transient event IDs change', () => {
    const summary = projects.getProjectSummary('AK001', snapshot({ events: [event({ id: 100 }), event({ id: 1, supabaseId: 'other-event', job: 'AK002' })], timelogs: [timelog()] }))!;
    expect(summary.costs.work).toBe(2400);
  });
  it('allocates an unequal shared invoice using complete persisted project amounts', () => {
    const billed = invoice({
      job: 'AK001, AK002', jobNumbers: ['AK001, AK002'], hAmt: 4000, kAmt: 150, mealAmt: 400, receiptAmt: 450, total: 5000,
      items: [
        { id: 'item-1', jobNumber: 'AK001', eventSupabaseId: 'event-1', ...amount(1000, 50, 200, 150) },
        { id: 'item-2', jobNumber: 'AK002', ...amount(3000, 100, 200, 300) },
      ],
    });
    const data = snapshot({ invoices: [billed], timelogs: [timelog()], receipts: [receipt()] });
    expect(projects.getProjectSummary('AK001', data)!.costs).toEqual(amount(1000, 50, 200, 150));
    expect(projects.getProjectSummary('AK002', data)!.costs).toEqual(amount(3000, 100, 200, 300));
    expect(projects.getProjectSummary('AK001', data)!.hasUnknownInvoiceAllocation).toBe(false);
  });
  it.each([
    undefined,
    [{ id: 'partial', jobNumber: 'AK001', ...amount(1600, 50, 200, 150) }],
    [{ id: 'missing-meals', jobNumber: 'AK001', work: 4000, travel: 150, receipts: 450, total: 5000 }],
  ])('leaves an unknown shared or incomplete invoice share null', (items) => {
    const billed = invoice({ job: 'AK001, AK002', jobNumbers: ['AK001', 'AK002'], hAmt: 4000, kAmt: 150, mealAmt: 400, receiptAmt: 450, total: 5000, items: items as unknown as Invoice['items'] });
    const summary = projects.getProjectSummary('AK001', snapshot({ invoices: [billed], timelogs: [timelog()], receipts: [receipt()] }))!;
    expect(summary.invoices).toEqual([{ invoice: billed, share: null }]);
    expect(summary.costs.total).toBe(0);
    expect(summary.hasUnknownInvoiceAllocation).toBe(true);
  });
  it('does not promote a partial single-project item to an exact header share', () => {
    const billed = invoice({ items: [{ id: 'partial', jobNumber: 'AK001', ...amount(100) }] });
    expect(projects.getProjectSummary('AK001', snapshot({ invoices: [billed] }))!.invoices[0].share).toBeNull();
  });
  it('does not advertise zero for a project mentioned only in a stale invoice header', () => {
    const billed = invoice({ job: 'AK001, AK002', jobNumbers: ['AK001', 'AK002'], timelogIds: [], timelogSupabaseIds: [], receiptIds: [], receiptSupabaseIds: [],
      items: [{ id: 'other-project', jobNumber: 'AK002', ...amount(1600, 50, 200, 150) }] });
    expect(projects.getProjectSummary('AK001', snapshot({ invoices: [billed] }))!.invoices[0].share).toBeNull();
  });
  it('recognizes an explicit persisted zero-cost project allocation', () => {
    const billed = invoice({ job: 'AK001, AK002', jobNumbers: ['AK001', 'AK002'], timelogIds: [], timelogSupabaseIds: [], receiptIds: [], receiptSupabaseIds: [],
      items: [{ id: 'zero-project', jobNumber: 'AK001', ...amount() }, { id: 'other-project', jobNumber: 'AK002', ...amount(1600, 50, 200, 150) }] });
    expect(projects.getProjectSummary('AK001', snapshot({ invoices: [billed] }))!.invoices[0].share).toEqual(amount());
  });
  it('reconciles the breakdown even if an incomplete item happens to match the header total', () => {
    const billed = invoice({ items: [{ id: 'wrong-breakdown', jobNumber: 'AK001', ...amount(1590, 60, 200, 150) }] });
    expect(projects.getProjectSummary('AK001', snapshot({ invoices: [billed] }))!.invoices[0].share).toBeNull();
  });
  it('counts duplicate snapshots of a receipt once using stable identity', () => {
    expect(projects.getProjectSummary('AK001', snapshot({ receipts: [receipt(), receipt({ id: 42 })] }))!.costs.receipts).toBe(150);
  });
  it('flags missing current rates while still counting known travel, meals and receipts', () => {
    const summary = projects.getProjectSummary('AK001', snapshot({ contractors: [], timelogs: [timelog()], receipts: [receipt()] }))!;
    expect(summary.hasMissingRates).toBe(true);
    expect(summary.costs).toEqual(amount(0, 10 * KM_RATE, MEAL_RATE, 150));
  });
});

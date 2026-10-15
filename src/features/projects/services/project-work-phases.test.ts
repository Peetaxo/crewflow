import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Invoice, Project, Timelog, TimelogDay } from '../../../types';
import { KM_RATE } from '../../../data';
import { getProjectSummary } from './project-summary';

const project = (id = 'AK001'): Project => ({ id, name: id, client: 'Klient', createdAt: '2026-01-01' });
const event = (overrides: Partial<Event> = {}): Event => ({ id: 1, supabaseId: 'event-1', name: 'Akce', job: 'AK001', client: 'Klient', startDate: '2026-04-10', endDate: '2026-04-10', city: 'Praha', needed: 1, filled: 1, status: 'past', ...overrides });
const contractor = { profileId: 'crew-1', rate: 300 } as Contractor;
const day = (type: TimelogDay['type'], f = '08:00', t = '09:00'): TimelogDay => ({ d: '2026-04-10', type, f, t });
const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({ id: 1, supabaseId: 'log-1', eid: 1, eventSupabaseId: 'event-1', contractorProfileId: 'crew-1', days: [day('provoz')], km: 0, note: '', status: 'approved', ...overrides });
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({ id: 'inv-1', contractorProfileId: 'crew-1', eid: 1, hours: 1, hAmt: 200, km: 0, kAmt: 0, total: 200, job: 'AK001', timelogIds: [1], timelogSupabaseIds: ['log-1'], status: 'sent', sentAt: null, ...overrides });
const amount = (work: number) => ({ work, travel: 0, meals: 0, receipts: 0, total: work });
const summary = (overrides = {}) => getProjectSummary('AK001', { projects: [project(), project('AK002')], events: [event()], contractors: [contractor], timelogs: [] as Timelog[], invoices: [] as Invoice[], receipts: [], ...overrides })!;
const reconcile = (result: ReturnType<typeof summary>) => expect(Math.round((result.workPhases.phases.reduce((sum, phase) => sum + phase.amount, 0) + result.workPhases.unallocated.amount) * 100)).toBe(Math.round(result.costs.work * 100));

describe('project actual work phases', () => {
  it('uses recorded phases, overnight hours and repeated same-day phases independently of the current plan', () => {
    const result = summary({ events: [event({ dayTypes: { '2026-04-10': 'deinstal' }, phaseSchedules: { deinstal: [{ id: 'planned', dates: ['2026-04-10'], from: '00:00', to: '01:00' }] } })], timelogs: [timelog({ days: [day('pripravy', '22:00', '02:00'), day('instal', '03:00', '05:00'), day('pripravy', '06:00', '07:00'), day('provoz'), day('deinstal')] })] });
    expect(result.workPhases.phases).toEqual([
      { type: 'pripravy', hours: 5, amount: 1500 }, { type: 'instal', hours: 2, amount: 600 },
      { type: 'provoz', hours: 1, amount: 300 }, { type: 'deinstal', hours: 1, amount: 300 },
    ]);
    reconcile(result);
  });

  it('shares the UUID project membership and deduplication rules and excludes rejected logs', () => {
    const result = summary({ events: [event({ id: 100 }), event({ job: 'AK002', supabaseId: 'event-other' })], timelogs: [timelog(), timelog({ id: 42 }), timelog({ id: 3, supabaseId: 'rejected', status: 'rejected' }), timelog({ id: 4, supabaseId: 'other', eventSupabaseId: 'event-other' })] });
    expect(result.workPhases.phases[2]).toEqual({ type: 'provoz', hours: 1, amount: 300 });
    reconcile(result);
  });

  it('retains hours with missing rates and keeps unsupported runtime types unallocated', () => {
    const result = summary({ contractors: [{ ...contractor, rate: 0, hasKnownRate: false }], timelogs: [timelog({ days: [day('pripravy'), day('legacy' as TimelogDay['type'])] })] });
    expect(result.workPhases.phases[0]).toEqual({ type: 'pripravy', hours: 1, amount: 0 });
    expect(result.workPhases.unallocated).toEqual({ hours: 1, amount: 0 });
    expect(result.hasMissingRates).toBe(true);
    reconcile(result);
  });

  it.each([0, -1, 1])('partitions each already rounded log amount deterministically, including a rate of %s', (rate) => {
    const result = summary({ contractors: [{ ...contractor, rate }], timelogs: [timelog({ days: [day('pripravy', '08:00', '08:20'), day('instal', '09:00', '09:20'), day('provoz', '10:00', '10:20')] })] });
    expect(result.workPhases.phases.map((phase) => phase.amount)).toEqual(rate === 0 ? [0, 0, 0, 0] : [rate * 0.34, rate * 0.33, rate * 0.33, 0]);
    expect(result.hasMissingRates).toBe(false);
    reconcile(result);
  });

  it('rounds per log before partitioning, preserving the existing total rather than rerounding phase subtotals', () => {
    const result = summary({ contractors: [{ ...contractor, rate: 0.1 }], timelogs: [timelog({ days: [day('pripravy', '08:00', '08:01'), day('instal', '09:00', '09:02')] }), timelog({ id: 2, supabaseId: 'log-2', days: [day('pripravy', '08:00', '08:01'), day('instal', '09:00', '09:02')] })] });
    expect(result.costs.work).toBe(0.02);
    expect(result.workPhases.phases.map((phase) => phase.amount)).toEqual([0, 0.02, 0, 0]);
    reconcile(result);
  });

  it('retains an unsafe-large finite price unallocated without attempting imprecise cent partitioning', () => {
    const result = summary({ contractors: [{ ...contractor, rate: 1e16 }], timelogs: [timelog({ days: [day('pripravy'), day('instal'), day('provoz')] })] });
    expect(result.workPhases.phases.map((phase) => phase.amount)).toEqual([0, 0, 0, 0]);
    expect(result.workPhases.unallocated).toEqual({ hours: 0, amount: result.costs.work });
    reconcile(result);
  });

  it('does not change existing per-log total rounding when work and travel have fractions of cents', () => {
    const result = summary({ contractors: [{ ...contractor, rate: 0.4 }], timelogs: [timelog({ km: 0.006 / KM_RATE, days: [day('pripravy', '08:00', '08:01')] })] });
    expect(result.costs).toEqual({ work: 0.01, travel: 0.01, meals: 0, receipts: 0, total: 0.01 });
    reconcile(result);
  });

  it('uses the frozen invoice price, counts linked hours once and labels hour-based invoice allocation', () => {
    const result = summary({ contractors: [{ ...contractor, rate: 9999 }], invoices: [invoice({ hours: 4, hAmt: 1, total: 1 })], timelogs: [timelog({ status: 'invoiced', days: [day('pripravy'), day('instal'), day('provoz', '09:00', '11:00')] })] });
    expect(result.workPhases.phases.map((phase) => [phase.hours, phase.amount])).toEqual([[1, 0.25], [1, 0.25], [2, 0.5], [0, 0]]);
    expect(result.workPhases.unallocated).toEqual({ hours: 0, amount: 0 });
    expect(result.workPhases.hasInvoicedAllocation).toBe(true);
    reconcile(result);
  });

  it('allocates exact project shares using only that project’s hours after reconciling every invoice log', () => {
    const result = summary({ events: [event(), event({ id: 2, supabaseId: 'event-2', job: 'AK002' })], invoices: [invoice({ job: 'AK001, AK002', hours: 4, hAmt: 1000, total: 1000, timelogIds: [999], timelogSupabaseIds: ['log-1', 'log-2'], items: [{ id: 'a', jobNumber: 'AK001', ...amount(100) }, { id: 'b', jobNumber: 'AK002', ...amount(900) }] })], timelogs: [timelog({ days: [day('pripravy'), day('instal')] }), timelog({ id: 2, supabaseId: 'log-2', eid: 2, eventSupabaseId: 'event-2', days: [day('provoz', '08:00', '10:00')] })] });
    expect(result.workPhases.phases.map((phase) => phase.amount)).toEqual([50, 50, 0, 0]);
    expect(result.workPhases.hasInvoicedAllocation).toBe(true);
    reconcile(result);
  });

  it('accepts complete legacy numeric links only when they resolve uniquely', () => {
    const result = summary({ invoices: [invoice({ timelogSupabaseIds: undefined })], timelogs: [timelog({ supabaseId: undefined })] });
    expect(result.workPhases.phases[2]).toEqual({ type: 'provoz', hours: 1, amount: 200 });
    reconcile(result);
  });

  it('reconciles invoice hours after billing’s per-log rounding', () => {
    const result = summary({ invoices: [invoice({ hours: 0.04, timelogSupabaseIds: ['log-1', 'log-2'] })], timelogs: [timelog({ days: [day('pripravy', '08:00', '08:01')] }), timelog({ id: 2, supabaseId: 'log-2', days: [day('instal', '08:00', '08:01')] })] });
    expect(result.workPhases.phases.map((phase) => phase.amount)).toEqual([100, 100, 0, 0]);
    reconcile(result);
  });

  it.each([
    { name: 'missing reference', patch: { timelogSupabaseIds: ['log-1', 'missing'] } },
    { name: 'no references', patch: { timelogIds: [], timelogSupabaseIds: [] } },
    { name: 'hour mismatch', patch: { hours: 2 } },
    { name: 'missing invoice owner', patch: { contractorProfileId: undefined } },
    { name: 'different invoice owner', patch: { contractorProfileId: 'other-crew' } },
    { name: 'repeated reference', patch: { timelogSupabaseIds: ['log-1', 'log-1'] } },
  ])('leaves known invoice money unallocated for $name without duplicating actual hours', ({ patch }) => {
    const result = summary({ invoices: [invoice(patch)], timelogs: [timelog()] });
    const linked = patch.timelogSupabaseIds?.length === 0 ? false : true;
    expect(result.workPhases.phases[2]).toEqual({ type: 'provoz', hours: 1, amount: linked ? 0 : 300 });
    expect(result.workPhases.unallocated).toEqual({ hours: 0, amount: 200 });
    expect(result.workPhases.hasUnallocatedInvoiceCosts).toBe(true);
    reconcile(result);
  });

  it.each([
    { contractorProfileId: undefined },
    { contractorProfileId: 'other-crew' },
    { eventSupabaseId: 'missing-event' },
    { status: 'rejected' as const },
  ])('rejects incomplete or inconsistent linked ownership %#', (patch) => {
    const result = summary({ invoices: [invoice()], timelogs: [timelog(patch)] });
    expect(result.workPhases.unallocated.amount).toBe(200);
    reconcile(result);
  });

  it('does not allocate an invoice with ambiguous numeric links or double-invoiced logs', () => {
    const ambiguous = summary({ invoices: [invoice({ timelogSupabaseIds: undefined })], timelogs: [timelog(), timelog({ supabaseId: 'other-log' })] });
    expect(ambiguous.workPhases.unallocated.amount).toBe(200);
    reconcile(ambiguous);
    const doubled = summary({ invoices: [invoice(), invoice({ id: 'inv-2' })], timelogs: [timelog()] });
    expect(doubled.workPhases.phases[2].hours).toBe(1);
    expect(doubled.workPhases.unallocated).toEqual({ hours: 0, amount: 400 });
    reconcile(doubled);
  });

  it('never fabricates phase money for an unknown invoice project share', () => {
    const result = summary({ invoices: [invoice({ job: 'AK001, AK002' })], timelogs: [timelog()] });
    expect(result.hasUnknownInvoiceAllocation).toBe(true);
    expect(result.workPhases.phases[2]).toEqual({ type: 'provoz', hours: 1, amount: 0 });
    expect(result.workPhases.unallocated.amount).toBe(0);
    reconcile(result);
  });
});

import { describe, expect, it } from 'vitest';
import { parseBillingSnapshot, parseBillingQuote, formatBillingMoney, formatBillingHours } from './contract';
import { billingSnapshotFixture, billingStatementFixture, billingDocumentFixture, id } from './test-fixtures';
const scope = { source: 'supabase' as const, userId: id(2), profileId: id(1), role: 'crew' as const };
describe('billing contract', () => {
  it('preserves exact versions, frozen decimals and nested identities', () => {
    const result = parseBillingSnapshot(billingSnapshotFixture(), scope);
    expect(result.statements[0].updatedAt).toBe('2026-10-15T10:00:00.123456+00:00');
    expect(result.statements[0].financialSnapshot.reports[0].amountHours).toBe(2083.33);
    expect(result.statements[0].supplierSnapshot.profileId).toBe(id(1));
    expect(formatBillingHours(8 + 20 / 60)).toBe('8 h 20 min');
    expect(formatBillingMoney(2083.33)).toContain('2 083,33');
  });
  it('rejects malformed or foreign private snapshots rather than rendering part of them', () => {
    const value = billingSnapshotFixture();
    value.statements[0].contractor_user_id = id(99);
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
    expect(() => parseBillingSnapshot({ ...billingSnapshotFixture(), jobs: [{ lease_token: 'private' }] }, scope)).toThrow();
    expect(() => parseBillingSnapshot({ ...billingSnapshotFixture(), documents: [{ statement_id: id(99) }] }, scope)).toThrow();
  });
  it('keeps unknown financial values on blocked statements unknown', () => {
    const value = billingSnapshotFixture();
    value.statements[0].status = 'blocked'; value.statements[0].blocked_reason = 'financial_data_incomplete';
    value.statements[0].financial_verified = false;
    value.statements[0].financial_snapshot.reports[0].km = null;
    expect(parseBillingSnapshot(value, scope).statements[0].financialSnapshot.reports[0].km).toBeNull();
  });
  it('accepts bulk approval quotes for distinct suppliers and customers', () => {
    const first = billingStatementFixture().financial_snapshot.reports[0];
    const second = { ...first, timelog_id: id(19), contractor_id: id(20), contractor_user_id: id(21),
      supplier_snapshot: { ...first.supplier_snapshot, profileId: id(20) },
      customer_snapshot: { ...first.customer_snapshot, clientId: id(22) } };
    expect(parseBillingQuote({ id: id(30), fingerprint: 'quote', timelog_ids: [first.timelog_id, second.timelog_id],
      preview: { currency: 'CZK', reports: [first, second], total_amount: 4666.66 }, created_at: first.report_updated_at }).preview.reports).toHaveLength(2);
  });
  it('preserves only the proven old preapproval provenance format as read-only history', () => {
    const value = billingSnapshotFixture();
    value.statements[0].financial_snapshot.reports[0] = structuredClone(value.statements[0].financial_snapshot.reports[0]);
    value.statements[0].financial_snapshot.reports[0].status = 'pending_coo';
    value.statements[0].financial_snapshot.reports[0].report_updated_at = '2026-10-14T10:00:00.123456+00:00';
    const result = parseBillingSnapshot(value, scope);
    expect(result.statements[0].needsSourceVerification).toBe(true);
    expect(result.statements[0].financialSnapshot.reports[0].reportUpdatedAt).toBe('2026-10-14T10:00:00.123456+00:00');
    value.statements[0].financial_snapshot.reports[0].amount_hours = 100;
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
  });

});

describe('canonical billing integrity', () => {
  const fresh = () => JSON.parse(JSON.stringify(billingSnapshotFixture())) as ReturnType<typeof billingSnapshotFixture>;
  it.each([
    ['source work amount', (v: ReturnType<typeof fresh>) => { v.statements[0].sources[0].source_snapshot.amount_hours = 1; }],
    ['source frozen day', (v: ReturnType<typeof fresh>) => { v.statements[0].sources[0].source_snapshot.days[0].time_to = '17:00'; }],
    ['source supplier', (v: ReturnType<typeof fresh>) => { v.statements[0].sources[0].source_snapshot.supplier_snapshot.bankAccount = 'foreign account'; }],
    ['fractional currency beyond cents', (v: ReturnType<typeof fresh>) => { v.statements[0].total_amount += 0.001; }],
    ['daily meal sum', (v: ReturnType<typeof fresh>) => { v.statements[0].financial_snapshot.reports[0].days[0].amount_meals = 0; v.statements[0].sources[0].source_snapshot.days[0].amount_meals = 0; }],
    ['header total', (v: ReturnType<typeof fresh>) => { v.statements[0].total_amount = 1; }],
    ['finance total', (v: ReturnType<typeof fresh>) => { v.statements[0].financial_snapshot.total_amount = 1; }],
    ['report total', (v: ReturnType<typeof fresh>) => { v.statements[0].financial_snapshot.reports[0].total_amount = 1; v.statements[0].sources[0].source_snapshot.total_amount = 1; }],
    ['statement customer', (v: ReturnType<typeof fresh>) => { v.statements[0].customer_snapshot.name = 'Another buyer'; }],
    ['statement supplier', (v: ReturnType<typeof fresh>) => { v.statements[0].supplier_snapshot.bankAccount = 'Another account'; }],
  ])('rejects a canonical mismatch in %s', (_name, change) => {
    const v = fresh(); change(v); expect(() => parseBillingSnapshot(v, scope)).toThrow();
  });
  it('rejects an original path owned by a different statement or request, while using request UUID rather than document UUID', () => {
    const value = { ...fresh(), documents: [billingDocumentFixture()] };
    expect(parseBillingSnapshot(value, scope).documents).toHaveLength(1);
    value.documents[0].storage_path = `billing-statements/${id(99)}/documents/${value.documents[0].request_id}.pdf`;
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
    value.documents[0].storage_path = `billing-statements/${id(8)}/documents/${value.documents[0].id}.pdf`;
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
  });
  it('accepts a blocked mixed-customer statement with nullable unknown money and matching source bindings', () => {
    const value = fresh(); const s = value.statements[0];
    s.status = 'blocked'; s.blocked_reason = 'mixed_customer'; s.financial_verified = false;
    const other = structuredClone(s.financial_snapshot.reports[0]);
    other.timelog_id = id(30); other.customer_snapshot = { ...other.customer_snapshot, clientId: id(31), name: 'Other customer' };
    other.km = null;
    s.financial_snapshot.reports.push(other); s.financial_snapshot.total_amount = s.total_amount = 4666.66;
    s.sources.push({ ...s.sources[0], timelog_id: other.timelog_id, source_snapshot: structuredClone(other) });
    expect(parseBillingSnapshot(value, scope).statements[0].financialSnapshot.reports[1].km).toBeNull();
    // The server checks incomplete money before it checks mixed buyers.
    s.blocked_reason = 'financial_data_incomplete';
    expect(parseBillingSnapshot(value, scope).statements[0].financialSnapshot.reports[1].customerSnapshot.clientId).toBe(id(31));
  });
  it('accepts an explicit supplier refresh when both frozen source and finance identities were refreshed together', () => {
    const value = fresh(); const s = value.statements[0];
    s.supplier_snapshot.bankAccount = 'new reviewed account'; s.identity_version = 2;
    s.financial_snapshot.reports[0].supplier_snapshot.bankAccount = s.supplier_snapshot.bankAccount;
    s.sources[0].source_snapshot.supplier_snapshot.bankAccount = s.supplier_snapshot.bankAccount;
    expect(parseBillingSnapshot(value, scope).statements[0].supplierSnapshot.bankAccount).toBe('new reviewed account');
  });
});

describe('verified billing finance completeness', () => {
  const fresh = () => JSON.parse(JSON.stringify(billingSnapshotFixture())) as ReturnType<typeof billingSnapshotFixture>;
  const editBoth = (value: ReturnType<typeof fresh>, change: (r: ReturnType<typeof billingStatementFixture>['financial_snapshot']['reports'][number]) => void) => {
    change(value.statements[0].financial_snapshot.reports[0]); change(value.statements[0].sources[0].source_snapshot);
  };
  it.each(['amount_hours', 'amount_km', 'amount_meals', 'amount_receipts', 'total_amount', 'hourly_rate', 'km_rate', 'meal_rate', 'km', 'hours'] as const)(
    'rejects a verified ready statement with matching unknown %s in source and finance', (key) => {
      const value = fresh(); editBoth(value, (r) => { r[key] = null; });
      if (key === 'total_amount') value.statements[0].financial_snapshot.total_amount = null;
      expect(() => parseBillingSnapshot(value, scope)).toThrow();
    });
  it.each(['hours', 'amount_meals', 'time_from', 'time_to'] as const)('rejects a verified day with matching unknown %s', (key) => {
    const value = fresh(); editBoth(value, (r) => { (r.days[0] as Record<string, unknown>)[key] = null; });
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
  });
  it('rejects an empty verified day set even when all stored monetary totals agree', () => {
    const value = fresh(); editBoth(value, (r) => { r.days = []; r.amount_meals = 0; r.total_amount = r.amount_hours + r.amount_km + r.amount_receipts; });
    value.statements[0].total_amount = value.statements[0].financial_snapshot.total_amount = value.statements[0].financial_snapshot.reports[0].total_amount;
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
  });
  it.each(['ready', 'document_pending', 'document_returned', 'issued'])('rejects a non-blocked %s statement marked financially unverified', (status) => {
    const value = fresh(); value.statements[0].status = status; value.statements[0].financial_verified = false;
    if (status === 'issued') value.statements[0].invoice_id = id(80);
    expect(() => parseBillingSnapshot(value, scope)).toThrow();
  });
  it('preserves an unverified blocked statement with matching unknown money and days, without replacing null by zero', () => {
    const value = fresh(); const s = value.statements[0]; s.status = 'blocked'; s.blocked_reason = 'financial_data_incomplete'; s.financial_verified = false;
    editBoth(value, (r) => { r.amount_hours = r.hours = r.hourly_rate = r.km = r.total_amount = null; r.days = []; r.amount_meals = 0; });
    s.financial_snapshot.total_amount = null;
    const result = parseBillingSnapshot(value, scope).statements[0];
    expect(result.status).toBe('blocked'); expect(result.financialSnapshot.totalAmount).toBeNull();
    expect(result.financialSnapshot.reports[0].amountHours).toBeNull(); expect(result.financialSnapshot.reports[0].days).toEqual([]);
  });
  it('keeps complete verified finance when legal identities block the statement', () => {
    const value = fresh(); value.statements[0].status = 'blocked'; value.statements[0].blocked_reason = 'supplier_data_incomplete';
    value.statements[0].supplier_snapshot.bankAccount = '';
    editBoth(value, (r) => { r.supplier_snapshot.bankAccount = ''; });
    expect(parseBillingSnapshot(value, scope).statements[0].financialVerified).toBe(true);
  });
  it('retains incomplete pending approval quote previews separately from verified statements', () => {
    const r = fresh().statements[0].financial_snapshot.reports[0]; r.status = 'pending_coo'; r.amount_hours = r.hourly_rate = r.km = r.total_amount = null; r.days = []; r.amount_meals = 0;
    const result = parseBillingQuote({ id: id(80), fingerprint: 'incomplete-preview', timelog_ids: [r.timelog_id], preview: { currency: 'CZK', reports: [r], total_amount: null }, created_at: r.report_updated_at });
    expect(result.preview.reports[0].amountHours).toBeNull(); expect(result.preview.reports[0].days).toEqual([]);
  });
});

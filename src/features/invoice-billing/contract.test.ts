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

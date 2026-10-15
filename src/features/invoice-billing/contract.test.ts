import { describe, expect, it } from 'vitest';
import { parseBillingSnapshot, parseBillingQuote, formatBillingMoney, formatBillingHours } from './contract';
import { billingSnapshotFixture, billingStatementFixture, id } from './test-fixtures';
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

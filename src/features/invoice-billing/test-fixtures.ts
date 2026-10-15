export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const version = '2026-10-15T10:00:00.123456+00:00';
export function billingStatementFixture() {
  const supplier = { profileId: id(1), name: 'Jan Dodavatel', ico: '12345678', dic: null, bankAccount: '123/0100', iban: null,
    billingStreet: 'Ulice 1', billingZip: '11000', billingCity: 'Praha', billingCountry: 'CZ', vatPayer: false };
  const customer = { clientId: id(5), name: 'Koncový klient', ico: '87654321', dic: null, street: 'Jiná 2', zip: '60200', city: 'Brno', country: 'CZ' };
  const report = { timelog_id: id(3), report_updated_at: version, status: 'approved', contractor_id: id(1), contractor_user_id: id(2),
    event_id: id(4), event_name: 'Festival', event_updated_at: version, job_number: 'JOB001', project_id: id(6), date_from: '2026-10-01', date_to: '2026-10-01',
    meal_allowance_enabled: true, hourly_rate: 250 as number | null, km_rate: 5.6, meal_rate: 250, km: 0 as number | null, hours: 8 + 20 / 60,
    amount_hours: 2083.33, amount_km: 0, amount_meals: 250, amount_receipts: 0, total_amount: 2333.33,
    days: [{ id: id(7), date: '2026-10-01', time_from: '08:00', time_to: '16:20', day_type: 'provoz', note: '', meals: ['obed'], hours: 8 + 20 / 60, amount_meals: 250 }],
    supplier_snapshot: supplier, customer_snapshot: customer };
  return { id: id(8), contractor_id: id(1), contractor_user_id: id(2), round_id: null, status: 'ready', blocked_reason: null as string | null,
    capture_kind: 'approval', financial_verified: true, financial_version: 1, identity_version: 1,
    financial_snapshot: { currency: 'CZK', reports: [report], total_amount: 2333.33 }, supplier_snapshot: supplier, customer_snapshot: customer,
    preview_issue_date: '2026-10-15', preview_due_date: '2026-10-29', preview_taxable_supply_date: '2026-10-01', preview_valid_until: '2026-10-15T21:59:59.999999+00:00',
    total_amount: 2333.33, currency: 'CZK', approved_by: id(9), approved_at: version, consent_grant_id: null, superseded_by_statement_id: null,
    active_document_id: null as string | null, invoice_id: null, created_at: version, updated_at: version,
    sources: [{ statement_id: id(8), timelog_id: id(3), event_id: id(4), report_updated_at: version, round_id: null, source_snapshot: report, reserved: true }] };
}
export function billingSnapshotFixture() {
  return { version: 1, consent: { contractor_id: id(1), enabled: false, active_grant_id: null, updated_at: null }, consent_history: [],
    statements: [billingStatementFixture()], superseded_statements: [], documents: [], jobs: [] };
}
export function billingDocumentFixture() {
  return { id: id(90), statement_id: id(8), request_id: id(91), uploader_user_id: id(2), statement_updated_at: version,
    financial_version: 1, identity_version: 1, storage_bucket: 'invoice-pdfs', storage_path: `billing-statements/${id(8)}/documents/${id(91)}.pdf`,
    sha256: 'a'.repeat(64), byte_size: 12, content_type: 'application/pdf', external_invoice_number: 'EXT-01', issue_date: '2026-10-15', due_date: '2026-10-29',
    total_amount: 2333.33, created_at: version, decision: null };
}

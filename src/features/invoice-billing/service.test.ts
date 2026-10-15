import { describe, expect, it, vi } from 'vitest';
import { createBillingService, makeBillingCommand } from './service';
import { billingSnapshotFixture, billingDocumentFixture, id, version } from './test-fixtures';
const scope = { source: 'supabase' as const, userId: id(2), profileId: id(1), role: 'crew' as const };
describe('billing I/O', () => {
  it('sends the same immutable UUID and raw expected version on a retry', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ error: { code: '503' } }).mockResolvedValue({ data: { statement: billingSnapshotFixture().statements[0] } });
    const service = createBillingService({ rpc });
    const command = makeBillingCommand({ kind: 'confirm', statementId: id(8), expectedUpdatedAt: version, nonVatConfirmed: true });
    await expect(service.execute(scope, command)).rejects.toMatchObject({ kind: 'ambiguous' });
    await service.execute(scope, command);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_expected_updated_at: version, p_non_vat_confirmed: true, p_request_id: command.requestId });
    expect(Object.isFrozen(command)).toBe(true);
  });
  it('requires explicit owner non-VAT confirmation and CH-only review', async () => {
    const rpc = vi.fn(); const service = createBillingService({ rpc });
    await expect(service.execute(scope, makeBillingCommand({ kind: 'confirm', statementId: id(8), expectedUpdatedAt: version, nonVatConfirmed: false }))).rejects.toMatchObject({ kind: 'invalid' });
    await expect(service.execute({ ...scope, role: 'coo' }, makeBillingCommand({ kind: 'review', statementId: id(8), documentId: id(10), expectedUpdatedAt: version, decision: 'accept', note: '' }))).rejects.toMatchObject({ kind: 'denied' });
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['PT409', '40001'])('recognizes version conflicts %s', async (code) => {
    const service = createBillingService({ rpc: vi.fn().mockResolvedValue({ error: { code } }) });
    await expect(service.read(scope)).rejects.toMatchObject({ kind: 'conflict' });
  });
  it('uploads exact immutable multipart metadata without a client path, amount or Content-Type boundary', async () => {
    const document = billingDocumentFixture(); const statement = { ...billingSnapshotFixture().statements[0], status: 'document_pending', active_document_id: document.id, updated_at: '2026-10-15T10:00:01.123456+00:00' };
    const { decision: _decision, ...registrationDocument } = document;
    const invoke = vi.fn().mockResolvedValue({ data: { statement, document: registrationDocument } });
    const service = createBillingService({ rpc: vi.fn(), functions: { invoke } });
    const file = new File(['%PDF-content'], 'original.pdf', { type: 'application/pdf' });
    vi.spyOn(file, 'slice').mockReturnValue({ arrayBuffer: async () => new TextEncoder().encode('%PDF-').buffer } as Blob);
    const command = makeBillingCommand({ kind: 'upload', statementId: id(8), expectedUpdatedAt: version, invoiceNumber: 'EXT-01', issueDate: '2026-10-15', dueDate: '2026-10-29', file });
    await service.execute(scope, command);
    const [name, options] = invoke.mock.calls[0]; expect(name).toBe('upload-invoice-document');
    expect(Object.keys(options)).toEqual(['body']);
    const body = options.body as FormData;
    expect([...body.keys()].sort()).toEqual(['dueDate', 'expectedUpdatedAt', 'file', 'invoiceNumber', 'issueDate', 'requestId', 'statementId']);
    expect(body.get('expectedUpdatedAt')).toBe(version); expect(body.get('requestId')).toBe(command.requestId);
  });

});

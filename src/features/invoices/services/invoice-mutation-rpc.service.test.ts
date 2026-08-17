import { beforeEach, describe, expect, it, vi } from 'vitest';

const createInput = {
  invoice: {
    contractor_id: 'profile-uuid-1',
    event_id: 'event-uuid-1',
    job_number: 'AK001',
    total_hours: 8,
    amount_hours: 2000,
    amount_km: 50,
    amount_receipts: 300,
    total_amount: 2350,
    invoice_number: 'SF-2026-NOVAK-T-0001',
    issue_date: '2026-04-27',
    taxable_supply_date: '2026-04-27',
    due_date: '2026-05-11',
    currency: 'CZK',
    supplier_snapshot: { name: 'Tomas Novak' },
    customer_snapshot: { name: 'Klient A' },
  },
  items: [{
    job_number: 'AK001',
    event_id: 'event-uuid-1',
    hours: 8,
    amount_hours: 2000,
    km: 10,
    amount_km: 50,
    amount_receipts: 300,
    total_amount: 2350,
  }],
  timelogs: [{ id: 'timelog-uuid-1', expected_updated_at: '2026-04-27T09:00:00Z' }],
  receipts: [{ id: 'receipt-uuid-1', expected_updated_at: '2026-04-27T09:05:00Z' }],
};

const createResult = [{
  invoice_id: 'invoice-uuid-1',
  invoice_status: 'draft',
  invoice_updated_at: '2026-04-27T10:00:00Z',
  paid_at: null,
  timelogs: [{ id: 'timelog-uuid-1', status: 'invoiced', updated_at: '2026-04-27T10:00:00Z' }],
  receipts: [{ id: 'receipt-uuid-1', status: 'attached', updated_at: '2026-04-27T10:00:00Z' }],
}];

describe('invoice mutation RPC adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates an invoice and all linked status changes through one exact RPC payload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: createResult, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { createInvoiceAtomicRpc } = await import('./invoice-mutation-rpc.service');

    await expect(createInvoiceAtomicRpc(createInput)).resolves.toEqual({
      invoice: {
        id: 'invoice-uuid-1',
        status: 'draft',
        updatedAt: '2026-04-27T10:00:00Z',
        paidAt: null,
      },
      timelogs: [{ id: 'timelog-uuid-1', status: 'invoiced', updatedAt: '2026-04-27T10:00:00Z' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'attached', updatedAt: '2026-04-27T10:00:00Z' }],
    });
    expect(rpc).toHaveBeenCalledWith('create_invoice_atomic', {
      p_invoice: createInput.invoice,
      p_items: createInput.items,
      p_timelogs: createInput.timelogs,
      p_receipts: createInput.receipts,
    });
  });

  it('marks the exact invoice and its linked rows paid through one versioned RPC', async () => {
    const data = [{
      invoice_id: 'invoice-uuid-1',
      invoice_status: 'paid',
      invoice_updated_at: '2026-04-28T10:00:00Z',
      paid_at: '2026-04-28T10:00:00Z',
      timelogs: [{ id: 'timelog-uuid-1', status: 'paid', updated_at: '2026-04-28T10:00:00Z' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'reimbursed', updated_at: '2026-04-28T10:00:00Z' }],
    }];
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { markInvoicePaidAtomicRpc } = await import('./invoice-mutation-rpc.service');

    const input = {
      id: 'invoice-uuid-1',
      expectedStatus: 'sent' as const,
      expectedUpdatedAt: '2026-04-28T09:00:00Z',
      paidAt: '2026-04-28T10:00:00Z',
    };
    await expect(markInvoicePaidAtomicRpc(input)).resolves.toMatchObject({
      invoice: { id: 'invoice-uuid-1', status: 'paid' },
      timelogs: [{ id: 'timelog-uuid-1', status: 'paid' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'reimbursed' }],
    });
    expect(rpc).toHaveBeenCalledWith('mark_invoice_paid_atomic', {
      p_invoice_id: input.id,
      p_expected_status: input.expectedStatus,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_paid_at: input.paidAt,
    });
  });

  it('marks the exact invoice sent through the exact versioned RPC contract', async () => {
    const data = [{
      invoice_id: 'invoice-uuid-1',
      invoice_status: 'sent',
      invoice_updated_at: '2026-04-28T09:30:00Z',
      paid_at: null,
      timelogs: [{ id: 'timelog-uuid-1', status: 'invoiced', updated_at: '2026-04-27T10:00:00Z' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'attached', updated_at: '2026-04-27T10:00:00Z' }],
    }];
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { markInvoiceSentAtomicRpc } = await import('./invoice-mutation-rpc.service');
    const input = {
      id: 'invoice-uuid-1',
      expectedUpdatedAt: '2026-04-28T09:00:00Z',
      sentAt: '2026-04-28T09:30:00Z',
    };

    await expect(markInvoiceSentAtomicRpc(input)).resolves.toEqual({
      invoice: {
        id: 'invoice-uuid-1',
        status: 'sent',
        updatedAt: '2026-04-28T09:30:00Z',
        paidAt: null,
      },
      timelogs: [{ id: 'timelog-uuid-1', status: 'invoiced', updatedAt: '2026-04-27T10:00:00Z' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'attached', updatedAt: '2026-04-27T10:00:00Z' }],
    });
    expect(rpc).toHaveBeenCalledWith('mark_invoice_sent_atomic', {
      p_invoice_id: input.id,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_sent_at: input.sentAt,
    });
  });

  it('deletes the exact draft invoice and restores linked rows through one versioned RPC', async () => {
    const data = [{
      invoice_id: 'invoice-uuid-1',
      invoice_status: 'draft',
      invoice_updated_at: '2026-04-28T09:00:00Z',
      paid_at: null,
      timelogs: [{ id: 'timelog-uuid-1', status: 'approved', updated_at: '2026-04-28T10:00:00Z' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'approved', updated_at: '2026-04-28T10:00:00Z' }],
    }];
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteInvoiceAtomicRpc } = await import('./invoice-mutation-rpc.service');

    const input = {
      id: 'invoice-uuid-1',
      expectedStatus: 'draft' as const,
      expectedUpdatedAt: '2026-04-28T09:00:00Z',
    };
    await expect(deleteInvoiceAtomicRpc(input)).resolves.toMatchObject({
      invoice: { id: 'invoice-uuid-1', status: 'draft' },
      timelogs: [{ id: 'timelog-uuid-1', status: 'approved' }],
      receipts: [{ id: 'receipt-uuid-1', status: 'approved' }],
    });
    expect(rpc).toHaveBeenCalledWith('delete_invoice_atomic', {
      p_invoice_id: input.id,
      p_expected_status: input.expectedStatus,
      p_expected_updated_at: input.expectedUpdatedAt,
    });
  });

  it.each([
    ['invoice_mutation_invalid', 'Faktura obsahuje neplatné nebo neúplné údaje.'],
    ['invoice_not_found', 'Faktura už neexistuje nebo k ní nemáte přístup.'],
    ['invoice_create_conflict', 'Vybrané položky se mezitím změnily. Obnovte data a zkuste to znovu.'],
    ['invoice_sent_conflict', 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.'],
    ['invoice_paid_conflict', 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.'],
    ['invoice_delete_conflict', 'Faktura nebo její položky se mezitím změnily. Obnovte data a zkuste to znovu.'],
    ['invoice_has_protected_items', 'Fakturu nelze změnit, protože obsahuje položky v chráněném stavu.'],
    ['invoice_unauthorized', 'K této operaci s fakturou nemáte oprávnění.'],
  ])('maps %s without exposing raw database details', async (token, expectedMessage) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: `internal ${token}: sensitive database detail` },
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteInvoiceAtomicRpc } = await import('./invoice-mutation-rpc.service');

    await expect(deleteInvoiceAtomicRpc({
      id: 'invoice-uuid-1',
      expectedStatus: 'draft',
      expectedUpdatedAt: '2026-04-28T09:00:00Z',
    })).rejects.toThrow(expectedMessage);
  });

  it.each([
    null,
    [],
    [{ ...createResult[0], invoice_id: '' }],
    [{ ...createResult[0], timelogs: [{ id: 'timelog-uuid-1', status: 'approved', updated_at: '' }] }],
    [createResult[0], createResult[0]],
  ])('fails closed on malformed create response %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { createInvoiceAtomicRpc } = await import('./invoice-mutation-rpc.service');

      await expect(createInvoiceAtomicRpc(createInput)).rejects.toThrow('Operaci s fakturou se nepodařilo dokončit.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic invoice mutation response', data);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps unknown database errors diagnostic-only', async () => {
    const databaseError = { code: 'XX000', message: 'sensitive internal invoice mutation failure' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { deleteInvoiceAtomicRpc } = await import('./invoice-mutation-rpc.service');

      await expect(deleteInvoiceAtomicRpc({
        id: 'invoice-uuid-1',
        expectedStatus: 'draft',
        expectedUpdatedAt: '2026-04-28T09:00:00Z',
      })).rejects.toThrow('Operaci s fakturou se nepodařilo dokončit.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic invoice mutation RPC error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });
});

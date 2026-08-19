import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('receipt mutation RPC adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('transitions the exact sorted UUID/version target set through one RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { id: 'receipt-uuid-a', status: 'submitted', updated_at: '2026-04-28T10:00:00Z' },
        { id: 'receipt-uuid-b', status: 'submitted', updated_at: '2026-04-28T10:00:01Z' },
      ],
      error: null,
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { transitionReceiptStatusesAtomicRpc } = await import('./receipt-mutation-rpc.service');
    const result = await transitionReceiptStatusesAtomicRpc({
      receipts: [
        { id: 'receipt-uuid-b', expected_updated_at: '2026-04-28T09:00:01Z' },
        { id: 'receipt-uuid-a', expected_updated_at: '2026-04-28T09:00:00Z' },
      ],
      expectedStatus: 'draft',
      nextStatus: 'submitted',
    });

    expect(rpc).toHaveBeenCalledWith('transition_receipt_statuses_atomic', {
      p_receipts: [
        { id: 'receipt-uuid-a', expected_updated_at: '2026-04-28T09:00:00Z' },
        { id: 'receipt-uuid-b', expected_updated_at: '2026-04-28T09:00:01Z' },
      ],
      p_expected_status: 'draft',
      p_next_status: 'submitted',
    });
    expect(result).toEqual([
      { id: 'receipt-uuid-a', status: 'submitted', updatedAt: '2026-04-28T10:00:00Z' },
      { id: 'receipt-uuid-b', status: 'submitted', updatedAt: '2026-04-28T10:00:01Z' },
    ]);
  });

  it.each([
    ['receipt_mutation_invalid', 'Účtenky obsahují neplatné nebo neúplné údaje.'],
    ['receipt_mutation_conflict', 'Účtenky se mezitím změnily. Obnovte data a zkuste to znovu.'],
    ['receipt_mutation_unauthorized', 'K této operaci s účtenkami nemáte oprávnění.'],
  ])('maps %s without exposing raw database details', async (token, expectedMessage) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: `internal ${token}: sensitive receipt relation detail` },
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { transitionReceiptStatusesAtomicRpc } = await import('./receipt-mutation-rpc.service');

    await expect(transitionReceiptStatusesAtomicRpc({
      receipts: [{ id: 'receipt-uuid-a', expected_updated_at: '2026-04-28T09:00:00Z' }],
      expectedStatus: 'draft',
      nextStatus: 'submitted',
    })).rejects.toThrow(expectedMessage);
  });

  it.each([
    null,
    [],
    [{ id: 'receipt-uuid-a', status: 'submitted', updated_at: '' }],
    [{ id: 'receipt-uuid-extra', status: 'submitted', updated_at: '2026-04-28T10:00:00Z' }],
    [
      { id: 'receipt-uuid-a', status: 'submitted', updated_at: '2026-04-28T10:00:00Z' },
      { id: 'receipt-uuid-a', status: 'submitted', updated_at: '2026-04-28T10:00:01Z' },
    ],
  ])('fails closed on malformed or non-exact canonical response %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { transitionReceiptStatusesAtomicRpc } = await import('./receipt-mutation-rpc.service');

      await expect(transitionReceiptStatusesAtomicRpc({
        receipts: [{ id: 'receipt-uuid-a', expected_updated_at: '2026-04-28T09:00:00Z' }],
        expectedStatus: 'draft',
        nextStatus: 'submitted',
      })).rejects.toThrow('Operaci s účtenkami se nepodařilo dokončit.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected receipt mutation RPC response', data);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps unknown database errors diagnostic-only', async () => {
    const databaseError = { code: 'XX000', message: 'sensitive receipt mutation failure' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { transitionReceiptStatusesAtomicRpc } = await import('./receipt-mutation-rpc.service');

      await expect(transitionReceiptStatusesAtomicRpc({
        receipts: [{ id: 'receipt-uuid-a', expected_updated_at: '2026-04-28T09:00:00Z' }],
        expectedStatus: 'draft',
        nextStatus: 'submitted',
      })).rejects.toThrow('Operaci s účtenkami se nepodařilo dokončit.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected receipt mutation RPC error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });
});

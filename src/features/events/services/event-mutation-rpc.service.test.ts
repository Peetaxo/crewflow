import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('event mutation RPC adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('deletes an event through the exact atomic RPC contract', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ event_id: 'event-uuid-1' }],
      error: null,
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

    await expect(deleteEventAtomicRpc(
      'event-uuid-1',
      '2026-08-18T09:15:00.000Z',
    )).resolves.toEqual({ eventId: 'event-uuid-1' });
    expect(rpc).toHaveBeenCalledWith('delete_event_atomic', {
      p_event_id: 'event-uuid-1',
      p_expected_updated_at: '2026-08-18T09:15:00.000Z',
    });
  });

  it.each([
    ['event_has_protected_timelogs', 'Akci nelze smazat, protože obsahuje chráněné výkazy.'],
    ['event_has_protected_receipts', 'Akci nelze smazat, protože obsahuje chráněné účtenky.'],
    ['event_delete_conflict', 'Akce se mezitím změnila. Obnovte data a zkuste to znovu.'],
    ['event_not_found', 'Akce už neexistuje nebo k ní nemáte přístup.'],
  ])('maps %s without exposing raw database details', async (token, expectedMessage) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: `internal prefix: ${token}: sensitive relation detail` },
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

    await expect(deleteEventAtomicRpc(
      'event-uuid-1',
      '2026-08-18T09:15:00.000Z',
    )).rejects.toThrow(expectedMessage);
  });

  it('maps only the billing membership foreign-key rejection to actionable deletion guidance', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '23503',
        message: 'update or delete on table "events" violates foreign key constraint "billing_group_members_event_id_fkey"',
      },
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

    await expect(deleteEventAtomicRpc(
      'event-uuid-1',
      '2026-08-18T09:15:00.000Z',
    )).rejects.toThrow('Nejprve odeberte akci ze společné fakturace.');
  });

  it.each([
    { code: '23503', message: 'update or delete on table "events" violates foreign key constraint "other_event_fk"' },
    { code: 'XX000', message: 'billing_group_members_event_id_fkey' },
  ])('does not expose deletion guidance for a non-matching billing foreign-key error', async (databaseError) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

      await expect(deleteEventAtomicRpc(
        'event-uuid-1',
        '2026-08-18T09:15:00.000Z',
      )).rejects.toThrow('Akci se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic event delete RPC error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    null,
    [],
    [{ event_id: 'wrong-event-uuid' }],
    [{ event_id: 'event-uuid-1' }, { event_id: 'event-uuid-1' }],
  ])('fails closed on malformed atomic delete response %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

      await expect(deleteEventAtomicRpc(
        'event-uuid-1',
        '2026-08-18T09:15:00.000Z',
      )).rejects.toThrow('Akci se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic event delete response', data);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps unknown database errors diagnostic-only', async () => {
    const databaseError = { code: 'XX000', message: 'sensitive internal event delete failure' };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

      await expect(deleteEventAtomicRpc(
        'event-uuid-1',
        '2026-08-18T09:15:00.000Z',
      )).rejects.toThrow('Akci se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic event delete RPC error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });
});

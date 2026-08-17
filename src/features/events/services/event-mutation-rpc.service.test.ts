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

    await expect(deleteEventAtomicRpc('event-uuid-1')).resolves.toEqual({ eventId: 'event-uuid-1' });
    expect(rpc).toHaveBeenCalledWith('delete_event_atomic', { p_event_id: 'event-uuid-1' });
  });

  it.each([
    ['event_has_protected_timelogs', 'Akci nelze smazat, protože obsahuje chráněné výkazy.'],
    ['event_delete_conflict', 'Akce se mezitím změnila. Obnovte data a zkuste to znovu.'],
    ['event_not_found', 'Akce už neexistuje nebo k ní nemáte přístup.'],
  ])('maps %s without exposing raw database details', async (token, expectedMessage) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: `internal prefix: ${token}: sensitive relation detail` },
    });
    vi.doMock('../../../lib/supabase', () => ({ supabase: { rpc } }));

    const { deleteEventAtomicRpc } = await import('./event-mutation-rpc.service');

    await expect(deleteEventAtomicRpc('event-uuid-1')).rejects.toThrow(expectedMessage);
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

      await expect(deleteEventAtomicRpc('event-uuid-1')).rejects.toThrow('Akci se nepodařilo smazat.');
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

      await expect(deleteEventAtomicRpc('event-uuid-1')).rejects.toThrow('Akci se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic event delete RPC error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../../../types';
import {
  deleteTimelogAtomicRpc,
  importApprovedTimelogAtomicRpc,
  saveTimelogAtomicRpc,
  transitionTimelogStatusesAtomicRpc,
} from './timelog-mutation-rpc.service';

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: null as { rpc: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('../../../lib/supabase', () => ({
  get supabase() {
    return supabaseMock.client;
  },
}));

const day: Timelog['days'][number] = {
  d: '2026-08-15',
  f: '08:00',
  t: '17:00',
  type: 'provoz',
  note: '  směna  ',
};
const result = {
  id: 'timelog-uuid-1',
  updated_at: '2026-08-17T12:00:00.000Z',
  status: 'draft',
};

describe('atomic timelog RPC adapter', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset();
    supabaseMock.client = { rpc: supabaseMock.rpc };
  });

  it('sends exact create/update identity, version, status, and deterministic normalized days', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: result, error: null });

    await expect(saveTimelogAtomicRpc({
      timelogId: 'timelog-uuid-1',
      eventId: 'event-uuid-1',
      contractorId: 'profile-uuid-1',
      expectedUpdatedAt: '2026-08-17T11:00:00.000Z',
      expectedStatus: 'draft',
      km: 12,
      note: 'Poznámka',
      status: 'pending_ch',
      days: [day],
    })).resolves.toEqual(result);

    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_timelog_atomic', {
      p_timelog_id: 'timelog-uuid-1',
      p_event_id: 'event-uuid-1',
      p_contractor_id: 'profile-uuid-1',
      p_expected_updated_at: '2026-08-17T11:00:00.000Z',
      p_expected_status: 'draft',
      p_km: 12,
      p_note: 'Poznámka',
      p_status: 'pending_ch',
      p_days: [{
        date: '2026-08-15',
        time_from: '08:00',
        time_to: '17:00',
        day_type: 'provoz',
        note: 'směna',
      }],
    });
  });

  it('sends sorted exact UUID/version targets in one status RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [
        { ...result, id: 'timelog-a', status: 'approved' },
        { ...result, id: 'timelog-b', status: 'approved' },
      ],
      error: null,
    });

    await transitionTimelogStatusesAtomicRpc({
      targets: [
        { id: 'timelog-b', expectedUpdatedAt: '2026-08-17T11:00:00.000Z' },
        { id: 'timelog-a', expectedUpdatedAt: '2026-08-17T10:00:00.000Z' },
      ],
      expectedStatus: 'pending_coo',
      nextStatus: 'approved',
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('transition_timelog_statuses_atomic', {
      p_targets: [
        { id: 'timelog-a', expected_updated_at: '2026-08-17T10:00:00.000Z' },
        { id: 'timelog-b', expected_updated_at: '2026-08-17T11:00:00.000Z' },
      ],
      p_expected_status: 'pending_coo',
      p_next_status: 'approved',
    });
  });

  it('deletes only through the versioned parent RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: result, error: null });

    await deleteTimelogAtomicRpc({
      id: 'timelog-uuid-1',
      expectedUpdatedAt: '2026-08-17T11:00:00.000Z',
      expectedStatus: 'draft',
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('delete_timelog_atomic', {
      p_timelog_id: 'timelog-uuid-1',
      p_expected_updated_at: '2026-08-17T11:00:00.000Z',
      p_expected_status: 'draft',
    });
  });

  it('uses the dedicated import RPC without a generic requested-status argument', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { ...result, status: 'invoiced' },
      error: null,
    });

    await expect(importApprovedTimelogAtomicRpc({
      timelogId: null,
      eventId: 'event-uuid-1',
      contractorId: 'profile-uuid-1',
      expectedUpdatedAt: null,
      expectedStatus: null,
      km: 0,
      note: 'PowerApps',
      days: [day],
    })).resolves.toEqual({ ...result, status: 'invoiced' });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('import_approved_timelog_atomic', {
      p_timelog_id: null,
      p_event_id: 'event-uuid-1',
      p_contractor_id: 'profile-uuid-1',
      p_expected_updated_at: null,
      p_expected_status: null,
      p_km: 0,
      p_note: 'PowerApps',
      p_days: [expect.objectContaining({ date: '2026-08-15' })],
    });
  });

  it.each([
    ['timelog_mutation_invalid', 'Výkaz obsahuje neplatné údaje nebo směny.'],
    ['timelog_mutation_not_found', 'Výkaz už neexistuje nebo k němu nemáte přístup.'],
    ['timelog_mutation_conflict', 'Výkaz se mezitím změnil. Obnovte data a zkuste to znovu.'],
    ['timelog_mutation_blocked', 'Výkaz v tomto stavu nelze smazat.'],
    ['timelog_import_unauthorized', 'Import schváleného výkazu může provést pouze COO.'],
  ])('maps %s to a stable Czech error without exposing raw SQL', async (token, message) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: `database failure: ${token}` },
    });

    await expect(deleteTimelogAtomicRpc({
      id: 'timelog-uuid-1',
      expectedUpdatedAt: result.updated_at,
      expectedStatus: 'draft',
    })).rejects.toThrow(message);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('hides unexpected database details and keeps them only in console diagnostics', async () => {
    const databaseError = { message: 'new row violates row-level security policy', code: '42501' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: databaseError });

    await expect(deleteTimelogAtomicRpc({
      id: 'timelog-uuid-1',
      expectedUpdatedAt: result.updated_at,
      expectedStatus: 'draft',
    })).rejects.toThrow('Operaci s výkazem se nepodařilo dokončit.');
    expect(consoleError).toHaveBeenCalledWith('Unexpected timelog mutation RPC error', databaseError);
  });
});

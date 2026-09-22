import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handoffTimelogsForApprovalAtomicRpc,
  listEventContactOptionsRpc,
  resolveTimelogApprovalsAtomicRpc,
} from './timelog-approval-rpc.service';

const supabaseMock = vi.hoisted(() => ({
  rpc: vi.fn(),
  client: null as { rpc: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('../../../lib/supabase', () => ({
  get supabase() {
    return supabaseMock.client;
  },
}));

const ids = {
  timelog: '11111111-1111-4111-8111-111111111111',
  approval: '22222222-2222-4222-8222-222222222222',
  round: '33333333-3333-4333-8333-333333333333',
  profile: '44444444-4444-4444-8444-444444444444',
};
const handoffTarget = {
  id: ids.timelog,
  expectedUpdatedAt: '2026-09-20T08:00:00Z',
  approvalId: ids.approval,
  approvalRoundId: ids.round,
};

describe('targeted timelog approval RPC adapter', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset();
    supabaseMock.client = { rpc: supabaseMock.rpc };
  });

  it('lists validated event contact options and normalizes a nullable phone snapshot', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ profile_id: ids.profile, name: 'Ada Lovelace', phone: null, can_approve_hours: true }],
      error: null,
    });

    await expect(listEventContactOptionsRpc()).resolves.toEqual([{
      profileId: ids.profile,
      name: 'Ada Lovelace',
      phone: '',
      canApproveHours: true,
    }]);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('list_event_contact_options');
  });

  it('passes caller-generated handoff ids and versions exactly', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{
        id: ids.timelog,
        updated_at: '2026-09-20T09:00:00Z',
        status: 'pending_coo',
        approval_id: ids.approval,
        approval_round_id: ids.round,
        approval_status: 'pending',
        approval_updated_at: '2026-09-20T09:00:00Z',
      }],
      error: null,
    });

    await expect(handoffTimelogsForApprovalAtomicRpc([handoffTarget])).resolves.toHaveLength(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('handoff_timelogs_for_approval_atomic', {
      p_targets: [{
        id: ids.timelog,
        expected_updated_at: handoffTarget.expectedUpdatedAt,
        approval_id: ids.approval,
        approval_round_id: ids.round,
      }],
    });
  });

  it('passes exact targeted and legacy resolution arguments including the return note', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [{ id: ids.timelog, updated_at: '2026-09-20T10:00:00Z', status: 'rejected' }],
      error: null,
    });

    await resolveTimelogApprovalsAtomicRpc({
      targets: [{
        id: ids.timelog,
        expectedUpdatedAt: '2026-09-20T09:00:00Z',
        approvalId: ids.approval,
        approvalUpdatedAt: '2026-09-20T09:00:00Z',
      }, {
        id: '55555555-5555-4555-8555-555555555555',
        expectedUpdatedAt: '2026-09-20T09:30:00Z',
        approvalId: null,
        approvalUpdatedAt: null,
      }],
      resolution: 'returned',
      note: 'Doplňte přestávku.',
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('resolve_timelog_approvals_atomic', {
      p_targets: [{
        id: ids.timelog,
        expected_updated_at: '2026-09-20T09:00:00Z',
        approval_id: ids.approval,
        approval_updated_at: '2026-09-20T09:00:00Z',
      }, {
        id: '55555555-5555-4555-8555-555555555555',
        expected_updated_at: '2026-09-20T09:30:00Z',
        approval_id: null,
        approval_updated_at: null,
      }],
      p_resolution: 'returned',
      p_note: 'Doplňte přestávku.',
    });
  });

  it.each([
    [null],
    [{}],
    [[{ profile_id: 'not-a-uuid', name: 'Ada', phone: '', can_approve_hours: true }]],
    [[{ profile_id: ids.profile, name: 'Ada', phone: 42, can_approve_hours: true }]],
  ])('rejects malformed contact option responses %#', async (data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });
    await expect(listEventContactOptionsRpc()).rejects.toThrow('neplatnou odpověď');
  });

  it.each([
    [null],
    [{}],
    [[{ id: ids.timelog, updated_at: '', status: 'pending_coo', approval_id: ids.approval, approval_round_id: ids.round, approval_status: 'pending', approval_updated_at: 'v1' }]],
    [[{ id: ids.timelog, updated_at: 'v2', status: 'pending_ch', approval_id: ids.approval, approval_round_id: ids.round, approval_status: 'pending', approval_updated_at: 'v1' }]],
  ])('rejects malformed handoff responses %#', async (data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });
    await expect(handoffTimelogsForApprovalAtomicRpc([handoffTarget])).rejects.toThrow('neplatnou odpověď');
  });

  it.each([
    ['timelog_approver_unavailable', '', 'Vybraný schvalovatel není dostupný.'],
    ['timelog_approval_unauthorized', '42501', 'K této operaci schválení nemáte oprávnění.'],
    ['timelog_approval_conflict', '40001', 'Schválení se mezitím změnilo.'],
    ['timelog_approval_invalid', '22023', 'Požadavek na schválení obsahuje neplatné údaje.'],
  ])('maps %s / %s to actionable Czech errors', async (token, code, message) => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: { code, message: `backend: ${token}` } });
    await expect(handoffTimelogsForApprovalAtomicRpc([handoffTarget])).rejects.toThrow(message);
  });

  it('rejects a missing return note before calling the backend', async () => {
    await expect(resolveTimelogApprovalsAtomicRpc({
      targets: [],
      resolution: 'returned',
      note: '   ',
    })).rejects.toThrow('Pro vrácení výkazu doplňte poznámku.');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it('preserves unknown backend context and thrown network failures', async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'XX000', message: 'connection closed by upstream' },
    });
    await expect(listEventContactOptionsRpc()).rejects.toThrow('connection closed by upstream');

    const networkError = new Error('Network request failed');
    supabaseMock.rpc.mockRejectedValueOnce(networkError);
    await expect(listEventContactOptionsRpc()).rejects.toBe(networkError);
  });
});

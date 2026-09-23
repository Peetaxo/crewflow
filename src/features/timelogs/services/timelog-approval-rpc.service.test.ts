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
  timelog2: '55555555-5555-4555-8555-555555555555',
  approval2: '66666666-6666-4666-8666-666666666666',
  round2: '77777777-7777-4777-8777-777777777777',
  extra: '88888888-8888-4888-8888-888888888888',
};
const handoffTarget = {
  id: ids.timelog,
  expectedUpdatedAt: '2026-09-20T08:00:00Z',
  approvalId: ids.approval,
  approvalRoundId: ids.round,
};
const handoffTarget2 = {
  id: ids.timelog2,
  expectedUpdatedAt: '2026-09-20T08:30:00Z',
  approvalId: ids.approval2,
  approvalRoundId: ids.round2,
};
const handoffResult = ({
  id = ids.timelog,
  approvalId = ids.approval,
  approvalRoundId = ids.round,
}: {
  id?: string;
  approvalId?: string;
  approvalRoundId?: string;
} = {}) => ({
  id,
  updated_at: '2026-09-20T09:00:00Z',
  status: 'pending_coo',
  approval_id: approvalId,
  approval_round_id: approvalRoundId,
  approval_status: 'pending',
  approval_updated_at: '2026-09-20T09:00:00Z',
});
const resolutionTarget = {
  id: ids.timelog,
  expectedUpdatedAt: '2026-09-20T09:00:00Z',
  approvalId: ids.approval,
  approvalUpdatedAt: '2026-09-20T09:00:00Z',
};
const resolutionTarget2 = {
  id: ids.timelog2,
  expectedUpdatedAt: '2026-09-20T09:30:00Z',
  approvalId: ids.approval2,
  approvalUpdatedAt: '2026-09-20T09:30:00Z',
};
const resolutionResult = (id = ids.timelog) => ({
  id,
  updated_at: '2026-09-20T10:00:00Z',
  status: 'approved',
});

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
      data: [handoffResult()],
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
      data: [
        { id: ids.timelog, updated_at: '2026-09-20T10:00:00Z', status: 'rejected' },
        { id: ids.timelog2, updated_at: '2026-09-20T10:00:00Z', status: 'rejected' },
      ],
      error: null,
    });

    await resolveTimelogApprovalsAtomicRpc({
      targets: [{
        id: ids.timelog,
        expectedUpdatedAt: '2026-09-20T09:00:00Z',
        approvalId: ids.approval,
        approvalUpdatedAt: '2026-09-20T09:00:00Z',
      }, {
        id: ids.timelog2,
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
    ['handoff', () => handoffTimelogsForApprovalAtomicRpc([])],
    ['resolution', () => resolveTimelogApprovalsAtomicRpc({ targets: [], resolution: 'approved' })],
  ])('rejects an empty %s batch before calling the backend', async (_kind, request) => {
    await expect(request()).rejects.toThrow('neplatné údaje');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['timelog id', { ...handoffTarget2, id: ids.timelog }],
    ['approval id', { ...handoffTarget2, approvalId: ids.approval }],
    ['approval round id', { ...handoffTarget2, approvalRoundId: ids.round }],
  ])('rejects duplicate handoff %s before calling the backend', async (_identity, duplicateTarget) => {
    await expect(handoffTimelogsForApprovalAtomicRpc([
      handoffTarget,
      duplicateTarget,
    ])).rejects.toThrow('neplatné údaje');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['timelog id', { ...resolutionTarget2, id: ids.timelog }],
    ['approval id', { ...resolutionTarget2, approvalId: ids.approval }],
  ])('rejects duplicate resolution %s before calling the backend', async (_identity, duplicateTarget) => {
    await expect(resolveTimelogApprovalsAtomicRpc({
      targets: [resolutionTarget, duplicateTarget],
      resolution: 'approved',
    })).rejects.toThrow('neplatné údaje');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...resolutionTarget, approvalId: null }],
    [{ ...resolutionTarget, approvalUpdatedAt: null }],
  ])('rejects a partial legacy approval identity before calling the backend %#', async (target) => {
    await expect(resolveTimelogApprovalsAtomicRpc({
      targets: [target],
      resolution: 'approved',
    })).rejects.toThrow('neplatné údaje');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
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

  it('rejects duplicate contact option profile ids', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [
        { profile_id: ids.profile, name: 'Ada', phone: '', can_approve_hours: true },
        { profile_id: ids.profile, name: 'Ada duplicate', phone: '', can_approve_hours: false },
      ],
      error: null,
    });

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
    ['empty', []],
    ['partial', [handoffResult()]],
    ['extra', [
      handoffResult(),
      handoffResult({ id: ids.timelog2, approvalId: ids.approval2, approvalRoundId: ids.round2 }),
      handoffResult({ id: ids.extra, approvalId: ids.extra, approvalRoundId: ids.extra }),
    ]],
    ['duplicate', [handoffResult(), handoffResult()]],
    ['wrong timelog id', [
      handoffResult({ id: ids.extra }),
      handoffResult({ id: ids.timelog2, approvalId: ids.approval2, approvalRoundId: ids.round2 }),
    ]],
  ])('rejects a %s handoff response that does not exactly correlate to the request', async (_kind, data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });

    await expect(handoffTimelogsForApprovalAtomicRpc([
      handoffTarget,
      handoffTarget2,
    ])).rejects.toThrow('neplatnou odpověď');
  });

  it.each([
    ['approval id', handoffResult({ approvalId: ids.approval2 })],
    ['approval round id', handoffResult({ approvalRoundId: ids.round2 })],
  ])('rejects a handoff response with a mismatched %s', async (_identity, data) => {
    supabaseMock.rpc.mockResolvedValue({ data: [data], error: null });

    await expect(handoffTimelogsForApprovalAtomicRpc([handoffTarget]))
      .rejects.toThrow('neplatnou odpověď');
  });

  it('returns correlated handoff results in deterministic target order', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [
        handoffResult({ id: ids.timelog2, approvalId: ids.approval2, approvalRoundId: ids.round2 }),
        handoffResult(),
      ],
      error: null,
    });

    const result = await handoffTimelogsForApprovalAtomicRpc([handoffTarget2, handoffTarget]);

    expect(result.map((row) => row.id)).toEqual([ids.timelog, ids.timelog2]);
  });

  it.each([
    [null],
    [{}],
    [[{ id: ids.timelog, updated_at: '', status: 'approved' }]],
    [[{ id: ids.timelog, updated_at: 'v2', status: 'not-a-status' }]],
  ])('rejects malformed resolution responses %#', async (data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });
    await expect(resolveTimelogApprovalsAtomicRpc({
      targets: [resolutionTarget],
      resolution: 'approved',
    })).rejects.toThrow('neplatnou odpověď');
  });

  it.each([
    ['empty', []],
    ['partial', [resolutionResult()]],
    ['extra', [resolutionResult(), resolutionResult(ids.timelog2), resolutionResult(ids.extra)]],
    ['duplicate', [resolutionResult(), resolutionResult()]],
    ['wrong timelog id', [resolutionResult(ids.extra), resolutionResult(ids.timelog2)]],
  ])('rejects a %s resolution response that does not exactly correlate to the request', async (_kind, data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });

    await expect(resolveTimelogApprovalsAtomicRpc({
      targets: [resolutionTarget, resolutionTarget2],
      resolution: 'approved',
    })).rejects.toThrow('neplatnou odpověď');
  });

  it('returns correlated resolution results in deterministic target order', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: [resolutionResult(ids.timelog2), resolutionResult()],
      error: null,
    });

    const result = await resolveTimelogApprovalsAtomicRpc({
      targets: [resolutionTarget2, resolutionTarget],
      resolution: 'approved',
    });

    expect(result.map((row) => row.id)).toEqual([ids.timelog, ids.timelog2]);
  });

  it.each([
    ['timelog_approver_unavailable', '', 'Vybraný schvalovatel není dostupný.'],
    ['timelog_approval_unauthorized', '', 'K této operaci schválení nemáte oprávnění.'],
    ['timelog_approval_conflict', '', 'Schválení se mezitím změnilo.'],
    ['timelog_approval_invalid', '', 'Požadavek na schválení obsahuje neplatné údaje.'],
    ['backend failure', '42501', 'K této operaci schválení nemáte oprávnění.'],
    ['backend failure', '40001', 'Schválení se mezitím změnilo.'],
    ['backend failure', '22023', 'Požadavek na schválení obsahuje neplatné údaje.'],
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

  it('preserves an unknown structured backend error by object identity', async () => {
    const backendError = {
      code: 'XX000',
      details: 'upstream reset while reading response',
      hint: 'retry after reconnecting',
      message: 'connection closed by upstream',
    };
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: backendError,
    });

    const request = listEventContactOptionsRpc();
    await expect(request).rejects.toBe(backendError);
    await request.catch((error) => {
      expect(error).toMatchObject({
        code: 'XX000',
        details: 'upstream reset while reading response',
        hint: 'retry after reconnecting',
        message: 'connection closed by upstream',
      });
    });
  });

  it('preserves Error and thrown network failures by object identity', async () => {
    const backendError = new Error('PostgREST failed');
    supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: backendError });
    await expect(listEventContactOptionsRpc()).rejects.toBe(backendError);

    const networkError = new Error('Network request failed');
    supabaseMock.rpc.mockRejectedValueOnce(networkError);
    await expect(listEventContactOptionsRpc()).rejects.toBe(networkError);
  });
});

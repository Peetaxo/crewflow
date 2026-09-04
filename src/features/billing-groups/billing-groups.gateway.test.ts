import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';
import { billingEventVersion, type BillingScope, type SaveBillingGroup } from './billing-groups.model';

const UUIDS = {
  request: '11111111-1111-4111-8111-111111111111',
  group: '22222222-2222-4222-8222-222222222222',
  otherGroup: '33333333-3333-4333-8333-333333333333',
};

const managerScope: BillingScope = {
  source: 'local', userId: 'manager', profileId: 'manager-profile', role: 'coo',
};

const event = (id: number, overrides: Partial<Event> = {}): Event => ({
  id,
  name: `Akce ${id}`,
  job: `JOB-${id}`,
  projectId: `project-${id}`,
  startDate: '2026-09-01',
  endDate: '2026-09-02',
  city: 'Praha',
  needed: 1,
  filled: 0,
  status: 'planning',
  client: 'Klient',
  ...overrides,
});

const emptyState = () => ({
  events: [], eventApplications: [], eventCrewAssignments: [], timelogs: [],
});

async function loadGateway(options: {
  appDataSource?: 'local' | 'supabase';
  state?: ReturnType<typeof emptyState> & Record<string, unknown>;
  client?: unknown;
} = {}) {
  vi.resetModules();
  vi.doMock('../../lib/app-config', () => ({ appDataSource: options.appDataSource ?? 'supabase' }));
  vi.doMock('../../lib/app-data', () => ({ getLocalAppState: () => structuredClone(options.state ?? emptyState()) }));
  vi.doMock('../../lib/supabase', () => ({ supabase: options.client ?? null }));
  return import('./billing-groups.gateway');
}

function command(
  current: Event[],
  overrides: Partial<SaveBillingGroup> = {},
): SaveBillingGroup {
  const targetIds = overrides.eventIds ?? current.map((item) => `local:${item.id}`);
  return {
    requestId: UUIDS.request,
    groupId: UUIDS.group,
    name: ' Skupina ',
    eventIds: targetIds,
    expectedRevision: 0,
    eventVersions: Object.fromEntries(current.map((item) => {
      const version = billingEventVersion(item, 'local');
      return [version.id, version.version];
    })),
    confirmCrossProject: true,
    confirmMoves: true,
    deleteGroup: false,
    ...overrides,
  };
}

function expectBillingError(action: () => unknown, kind: string): void {
  expect(action).toThrow(expect.objectContaining({ kind }));
}

describe('billing groups gateway', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('is importable and routes the local source to an empty local snapshot', async () => {
    const { readBillingGroups } = await loadGateway({ appDataSource: 'local' });

    await expect(readBillingGroups({ ...managerScope, source: 'local' }, new AbortController().signal))
      .resolves.toEqual({ revision: 0, groups: [] });
  });

  it('checks cancellation before dispatching to the local adapter', async () => {
    const { readBillingGroups } = await loadGateway({ appDataSource: 'local' });
    const controller = new AbortController();
    controller.abort();

    await expect(readBillingGroups({ ...managerScope, source: 'local' }, controller.signal))
      .rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('maps a strict remote snapshot and forwards the abort signal', async () => {
    const abortSignal = vi.fn();
    const rpc = vi.fn(() => ({ abortSignal }));
    const client = { rpc };
    const { readBillingGroups } = await loadGateway({ client });
    abortSignal.mockResolvedValue({ data: {
      revision: 4,
      groups: [{ id: UUIDS.group, name: 'Skupina', event_ids: [UUIDS.otherGroup] }],
    }, error: null });
    const controller = new AbortController();

    await expect(readBillingGroups({ ...managerScope, source: 'supabase', userId: 'user' }, controller.signal))
      .resolves.toEqual({ revision: 4, groups: [{ id: UUIDS.group, name: 'Skupina', eventIds: [UUIDS.otherGroup] }] });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('read_billing_groups');
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it('rejects hidden counts and unknown nested snapshot fields', async () => {
    const abortSignal = vi.fn();
    const rpc = vi.fn(() => ({ abortSignal }));
    abortSignal.mockResolvedValue({ data: {
      revision: 0,
      hidden_count: 1,
      groups: [{ id: UUIDS.group, name: 'G', event_ids: [], unexpected: true }],
    }, error: null });
    const { readBillingGroups } = await loadGateway({ client: { rpc } });

    await expect(readBillingGroups({ ...managerScope, source: 'supabase', userId: 'user' }, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('rejects an otherwise valid snapshot with an unknown nested group field', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: {
      revision: 0,
      groups: [{ id: UUIDS.group, name: 'G', event_ids: [], unexpected: true }],
    }, error: null });
    const { readBillingGroups } = await loadGateway({ client: { rpc: vi.fn(() => ({ abortSignal })) } });

    await expect(readBillingGroups({ ...managerScope, source: 'supabase', userId: 'user' }, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'ambiguous' });
  });

  it('does not fall back to local data for an unavailable remote client', async () => {
    const { readBillingGroups } = await loadGateway({ appDataSource: 'local' });

    await expect(readBillingGroups({ ...managerScope, source: 'supabase', userId: 'user' }, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'denied' });
  });

  it('treats malformed successful mutations and mismatched result IDs as ambiguous', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { request_id: UUIDS.request, group_id: UUIDS.group, revision: '1' }, error: null })
      .mockResolvedValueOnce({ data: { request_id: UUIDS.otherGroup, group_id: UUIDS.group, revision: 1 }, error: null });
    const { saveBillingGroup } = await loadGateway({ client: { rpc } });
    const remoteCommand = { ...command([], { eventVersions: {} }), eventIds: [] };
    const remoteScope = { ...managerScope, source: 'supabase' as const, userId: 'user' };

    await expect(saveBillingGroup(remoteScope, remoteCommand)).rejects.toMatchObject({ kind: 'ambiguous' });
    await expect(saveBillingGroup(remoteScope, remoteCommand)).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('maps an exact remote mutation result and forwards the command without normalization', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      request_id: UUIDS.request, group_id: UUIDS.group, revision: 8,
    }, error: null });
    const { saveBillingGroup } = await loadGateway({ client: { rpc } });
    const remoteCommand = command([], { name: '  Neupravený název  ', eventIds: [], eventVersions: {} });
    const remoteScope = { ...managerScope, source: 'supabase' as const, userId: 'user' };

    await expect(saveBillingGroup(remoteScope, remoteCommand)).resolves.toEqual({
      requestId: UUIDS.request, groupId: UUIDS.group, revision: 8,
    });
    expect(rpc).toHaveBeenCalledWith('save_billing_group_atomic', {
      p_request_id: remoteCommand.requestId,
      p_group_id: remoteCommand.groupId,
      p_name: remoteCommand.name,
      p_event_ids: remoteCommand.eventIds,
      p_expected_revision: remoteCommand.expectedRevision,
      p_event_versions: remoteCommand.eventVersions,
      p_confirm_cross_project: remoteCommand.confirmCrossProject,
      p_confirm_moves: remoteCommand.confirmMoves,
      p_delete: remoteCommand.deleteGroup,
    });
  });

  it('makes one RPC for a conflict and does not retry a thrown transport failure', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'conflict' } })
      .mockImplementationOnce(() => { throw new Error('offline'); });
    const { saveBillingGroup } = await loadGateway({ client: { rpc } });
    const remoteCommand = { ...command([], { eventVersions: {} }), eventIds: [] };
    const remoteScope = { ...managerScope, source: 'supabase' as const, userId: 'user' };

    await expect(saveBillingGroup(remoteScope, remoteCommand)).rejects.toMatchObject({
      kind: 'conflict', message: 'Data se mezitím změnila. Obnovte výběr a znovu jej potvrďte.',
    });
    await expect(saveBillingGroup(remoteScope, remoteCommand)).rejects.toMatchObject({ kind: 'ambiguous' });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('local billing groups adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('starts empty, returns clones, and denies crew writes', async () => {
    const state = emptyState();
    const { readLocalBillingGroups, saveLocalBillingGroup } = await loadGateway({ appDataSource: 'local', state });
    const first = readLocalBillingGroups(managerScope);
    first.groups.push({ id: UUIDS.group, name: 'mutace', eventIds: [] });

    expect(readLocalBillingGroups(managerScope)).toEqual({ revision: 0, groups: [] });
    expectBillingError(() => saveLocalBillingGroup({ ...managerScope, role: 'crew' }, command([])), 'denied');
  });

  it('keeps only visible members and groups private to crew while managers see all', async () => {
    const first = event(1, { status: 'planning' });
    const second = event(2, { status: 'upcoming' });
    const state = {
      ...emptyState(),
      events: [first, second],
      eventCrewAssignments: [{ eventId: 1, contractorProfileId: 'crew-profile', name: 'Crew' }],
    };
    const { readLocalBillingGroups, saveLocalBillingGroup } = await loadGateway({ appDataSource: 'local', state });
    saveLocalBillingGroup(managerScope, command([first, second]));

    expect(readLocalBillingGroups(managerScope)).toEqual(expect.objectContaining({
      revision: 1,
      groups: [{ id: UUIDS.group, name: 'Skupina', eventIds: ['local:1', 'local:2'] }],
    }));
    expect(readLocalBillingGroups({ ...managerScope, role: 'crew', profileId: 'crew-profile' }))
      .toEqual({ revision: null, groups: [{ id: UUIDS.group, name: 'Skupina', eventIds: ['local:1', 'local:2'] }] });
    expect(readLocalBillingGroups({ ...managerScope, role: 'crew', profileId: 'other' }))
      .toEqual({ revision: null, groups: [{ id: UUIDS.group, name: 'Skupina', eventIds: ['local:2'] }] });
  });

  it('replays the exact local request without increasing revision and rejects actor or payload reuse', async () => {
    const first = event(1);
    const { saveLocalBillingGroup, readLocalBillingGroups } = await loadGateway({ appDataSource: 'local', state: { ...emptyState(), events: [first] } });
    const firstCommand = command([first]);

    expect(saveLocalBillingGroup(managerScope, firstCommand)).toMatchObject({ revision: 1 });
    expect(saveLocalBillingGroup(managerScope, firstCommand)).toMatchObject({ revision: 1 });
    expectBillingError(() => saveLocalBillingGroup({ ...managerScope, userId: 'other' }, firstCommand), 'invalid');
    expectBillingError(() => saveLocalBillingGroup(managerScope, { ...firstCommand, name: 'Jiné' }), 'invalid');
    expect(readLocalBillingGroups(managerScope)).toMatchObject({ revision: 1 });
  });

  it('does not mutate local state for stale revisions or removed event versions', async () => {
    const first = event(1);
    const state = { ...emptyState(), events: [first] };
    const { saveLocalBillingGroup, readLocalBillingGroups } = await loadGateway({ appDataSource: 'local', state });
    saveLocalBillingGroup(managerScope, command([first]));

    expectBillingError(() => saveLocalBillingGroup(managerScope, command([first], {
      requestId: UUIDS.otherGroup, expectedRevision: 0,
    })), 'conflict');
    state.events = [];
    expectBillingError(() => saveLocalBillingGroup(managerScope, command([first], {
      requestId: '44444444-4444-4444-8444-444444444444', expectedRevision: 1,
    })), 'conflict');
    expect(readLocalBillingGroups(managerScope)).toMatchObject({
      revision: 1, groups: [{ id: UUIDS.group, name: 'Skupina', eventIds: ['local:1'] }],
    });
  });

  it('requires cross-project and move confirmations, retains empty sources, and deletes only empty groups', async () => {
    const first = event(1);
    const second = event(2, { projectId: 'another', job: 'OTHER' });
    const state = { ...emptyState(), events: [first, second] };
    const { saveLocalBillingGroup, readLocalBillingGroups } = await loadGateway({ appDataSource: 'local', state });
    saveLocalBillingGroup(managerScope, command([first], { groupId: UUIDS.otherGroup }));
    const move = command([first, second], {
      requestId: '66666666-6666-4666-8666-666666666666',
      expectedRevision: 1, confirmCrossProject: false, confirmMoves: false,
    });

    expectBillingError(() => saveLocalBillingGroup(managerScope, move), 'invalid');
    expectBillingError(() => saveLocalBillingGroup(managerScope, { ...move, confirmCrossProject: true }), 'invalid');
    const moved = saveLocalBillingGroup(managerScope, { ...move, confirmCrossProject: true, confirmMoves: true });
    expect(moved.revision).toBe(2);
    const snapshot = readLocalBillingGroups(managerScope);
    expect(snapshot.groups).toEqual(expect.arrayContaining([{ id: UUIDS.otherGroup, name: 'Skupina', eventIds: [] }]));

    expect(saveLocalBillingGroup(managerScope, command([], {
      requestId: '55555555-5555-4555-8555-555555555555', groupId: UUIDS.otherGroup,
      expectedRevision: 2, eventVersions: {}, deleteGroup: true,
    }))).toMatchObject({ revision: 3 });
  });
});

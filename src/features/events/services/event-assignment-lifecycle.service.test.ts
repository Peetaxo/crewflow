import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelogStatus } from '../../../types';
import {
  assignEventCrewRpc,
  isDisposableTimelogStatus,
  removeEventCrewRpc,
} from './event-assignment-lifecycle.service';

const supabaseMock = vi.hoisted(() => {
  const rpc = vi.fn();

  return {
    rpc,
    client: { rpc } as { rpc: typeof rpc } | null,
  };
});

vi.mock('../../../lib/supabase', () => ({
  get supabase() {
    return supabaseMock.client;
  },
}));

const assignmentResult = {
  event_id: 'event-1',
  profile_id: 'profile-1',
  assignment_id: 'assignment-1',
  timelog_id: 'timelog-1',
  application_id: 'application-1',
  timelog_created: true,
  crew_filled: 2,
};

const removalResult = {
  event_id: 'event-1',
  profile_id: 'profile-1',
  application_id: null,
  assignment_removed: true,
  timelog_removed: true,
  crew_filled: 1,
};

describe('event assignment lifecycle RPC adapter', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset();
    supabaseMock.client = { rpc: supabaseMock.rpc };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends canonical UUIDs and normalized days to assign_event_crew', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: assignmentResult, error: null });

    const result = await assignEventCrewRpc({
      eventId: 'event-1',
      profileId: 'profile-1',
      applicationId: 'application-1',
      days: [{ d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz', note: '' }],
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('assign_event_crew', {
      p_event_id: 'event-1',
      p_profile_id: 'profile-1',
      p_application_id: 'application-1',
      p_days: [{
        date: '2026-08-15',
        time_from: '08:00',
        time_to: '17:00',
        day_type: 'provoz',
        note: null,
      }],
    });
    expect(result).toEqual(assignmentResult);
  });

  it('sends null for an omitted application and trims nonempty day notes', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { ...assignmentResult, application_id: null },
      error: null,
    });

    await assignEventCrewRpc({
      eventId: 'event-1',
      profileId: 'profile-1',
      days: [
        { d: '2026-08-15', f: '08:00', t: '12:00', type: 'instal', note: '   ' },
        { d: '2026-08-16', f: '09:00', t: '18:00', type: 'provoz', note: '  call crewhead  ' },
      ],
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith('assign_event_crew', {
      p_event_id: 'event-1',
      p_profile_id: 'profile-1',
      p_application_id: null,
      p_days: [
        {
          date: '2026-08-15',
          time_from: '08:00',
          time_to: '12:00',
          day_type: 'instal',
          note: null,
        },
        {
          date: '2026-08-16',
          time_from: '09:00',
          time_to: '18:00',
          day_type: 'provoz',
          note: 'call crewhead',
        },
      ],
    });
  });

  it('calls remove_event_crew with exact arguments and returns its typed object', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: removalResult, error: null });

    const result = await removeEventCrewRpc('event-1', 'profile-1');

    expect(supabaseMock.rpc).toHaveBeenCalledWith('remove_event_crew', {
      p_event_id: 'event-1',
      p_profile_id: 'profile-1',
    });
    expect(result).toEqual(removalResult);
  });

  it.each([
    ['crew_lifecycle_unauthorized', 'Tuto akci může provést pouze CrewHead nebo COO.'],
    ['crew_lifecycle_not_found', 'Akce nebo člen Crew nebyl nalezen.'],
    ['crew_assignment_conflict', 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.'],
    ['crew_assignment_invalid_days', 'Pro přiřazení Crew nejsou k dispozici platné směny.'],
    ['crew_removal_blocked', 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'],
  ])('maps %s inside a Supabase error to a stable Czech message', async (token, message) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: `RPC failed with ${token} in database context` },
    });

    await expect(removeEventCrewRpc('event-1', 'profile-1'))
      .rejects.toThrow(message);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', true],
    ['rejected', true],
    ['pending_crew_confirmation', false],
    ['pending_ch', false],
    ['pending_coo', false],
    ['approved', false],
    ['invoiced', false],
    ['paid', false],
  ] satisfies Array<[TimelogStatus, boolean]>)('reports whether %s timelogs are disposable', (status, expected) => {
    expect(isDisposableTimelogStatus(status)).toBe(expected);
  });

  it('maps unknown RPC errors to a generic message and logs the diagnostic', async () => {
    const rpcError = { message: 'database connection dropped', code: '08006' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(assignEventCrewRpc({
      eventId: 'event-1',
      profileId: 'profile-1',
      days: [],
    })).rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
    expect(consoleError).toHaveBeenCalledWith('Unexpected Crew lifecycle RPC error', rpcError);
  });

  it.each([null, undefined, false, 0, '', [], ['unexpected']])(
    'maps malformed RPC response %j to a generic message',
    async (data) => {
      supabaseMock.rpc.mockResolvedValue({ data, error: null });

      await expect(removeEventCrewRpc('event-1', 'profile-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
    },
  );

  it('maps an unavailable Supabase client to a generic message', async () => {
    supabaseMock.client = null;

    await expect(removeEventCrewRpc('event-1', 'profile-1'))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Timelog, TimelogStatus } from '../../../types';
import {
  approveEventWithdrawalRpc,
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

  it('normalizes frozen input days without mutating them', async () => {
    const days: Timelog['days'] = [
      { d: '2026-08-15', f: '08:00', t: '17:00', type: 'provoz', note: '  frozen note  ' },
    ];
    days.forEach(Object.freeze);
    Object.freeze(days);
    const originalDays = structuredClone(days);
    supabaseMock.rpc.mockResolvedValue({ data: assignmentResult, error: null });

    await assignEventCrewRpc({
      eventId: 'event-1',
      profileId: 'profile-1',
      applicationId: 'application-1',
      days,
    });

    expect(days).toEqual(originalDays);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('assign_event_crew', expect.objectContaining({
      p_days: [expect.objectContaining({ note: 'frozen note' })],
    }));
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

  it('calls approve_event_withdrawal with stable UUIDs and returns its typed removal object', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { ...removalResult, application_id: 'application-1' },
      error: null,
    });

    const result = await approveEventWithdrawalRpc(
      'event-1',
      'profile-1',
      'application-1',
    );

    expect(supabaseMock.rpc).toHaveBeenCalledWith('approve_event_withdrawal', {
      p_event_id: 'event-1',
      p_profile_id: 'profile-1',
      p_application_id: 'application-1',
    });
    expect(result).toEqual({ ...removalResult, application_id: 'application-1' });
  });

  it.each([
    ['crew_lifecycle_unauthorized', 'Tuto akci může provést pouze CrewHead nebo COO.'],
    ['crew_lifecycle_not_found', 'Akce nebo člen Crew nebyl nalezen.'],
    ['crew_assignment_conflict', 'Výkaz pro tuto Crew a akci už existuje a nelze ho přepsat.'],
    ['crew_assignment_invalid_days', 'Pro přiřazení Crew nejsou k dispozici platné směny.'],
    ['crew_removal_blocked', 'Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'],
    ['crew_application_conflict', 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.'],
    ['crew_withdrawal_conflict', 'Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.'],
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

  it('does not map a lifecycle token embedded in a longer identifier', async () => {
    const rpcError = { message: 'RPC failed with crew_lifecycle_not_found_details' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabaseMock.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(removeEventCrewRpc('event-1', 'profile-1'))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
    expect(consoleError).toHaveBeenCalledWith('Unexpected Crew lifecycle RPC error', rpcError);
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

  it.each([
    ['empty object', {}],
    ['missing required field', { ...assignmentResult, timelog_id: undefined }],
    ['null event id', { ...assignmentResult, event_id: null }],
    ['empty profile id', { ...assignmentResult, profile_id: '' }],
    ['wrong timelog_created type', { ...assignmentResult, timelog_created: 'false' }],
    ['string crew count', { ...assignmentResult, crew_filled: '2' }],
    ['negative crew count', { ...assignmentResult, crew_filled: -1 }],
    ['fractional crew count', { ...assignmentResult, crew_filled: 1.5 }],
    ['wrong application id type', { ...assignmentResult, application_id: 42 }],
    ['empty application id', { ...assignmentResult, application_id: '' }],
  ])('rejects an invalid assignment response: %s', async (_label, data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });

    await expect(assignEventCrewRpc({
      eventId: 'event-1',
      profileId: 'profile-1',
      days: [],
    })).rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
  });

  it.each([
    ['empty object', {}],
    ['missing required field', { ...removalResult, timelog_removed: undefined }],
    ['null event id', { ...removalResult, event_id: null }],
    ['empty profile id', { ...removalResult, profile_id: '' }],
    ['wrong assignment_removed type', { ...removalResult, assignment_removed: 'true' }],
    ['wrong timelog_removed type', { ...removalResult, timelog_removed: 1 }],
    ['string crew count', { ...removalResult, crew_filled: '1' }],
    ['negative crew count', { ...removalResult, crew_filled: -1 }],
    ['fractional crew count', { ...removalResult, crew_filled: 0.5 }],
    ['wrong application id type', { ...removalResult, application_id: false }],
    ['empty application id', { ...removalResult, application_id: '' }],
  ])('rejects an invalid removal response: %s', async (_label, data) => {
    supabaseMock.rpc.mockResolvedValue({ data, error: null });

    await expect(removeEventCrewRpc('event-1', 'profile-1'))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('candidates.service hydration guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not fetch candidates from Supabase again after the first successful hydration', async () => {
    let snapshot = {
      candidates: [],
    };

    const order = vi.fn(async () => ({
      data: [
        {
          id: 'candidate-uuid-1',
          name: 'Jan Novak',
          stage: 'new',
        },
      ],
      error: null,
    }));

    const select = vi.fn(() => ({
      order,
    }));

    const from = vi.fn(() => ({
      select,
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapCandidate: (row: { name: string; stage: string }) => ({
        name: row.name,
        stage: row.stage,
      }),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { getCandidates } = await import('./candidates.service');

    expect(getCandidates()).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getCandidates()).toEqual([
      {
        id: 1,
        name: 'Jan Novak',
        stage: 'new',
      },
    ]);

    expect(from).toHaveBeenCalledTimes(1);
  });

  it('merges Tally and Cal.com rows for the same candidate into one pipeline card', async () => {
    let snapshot = {
      candidates: [],
    };

    const order = vi.fn(async () => ({
      data: [
        {
          id: 'candidate-tally',
          first_name: 'David',
          last_name: 'Hora',
          phone: '+420734325088',
          email: '05davidhora@gmail.cpm',
          tally_submission_id: 'Nqo2j10',
          stage: 'new',
          interview_date: null,
          cal_booking_uid: null,
          cal_booking_status: null,
          cal_event_type: null,
        },
        {
          id: 'candidate-cal',
          first_name: 'David',
          last_name: 'Hora',
          phone: null,
          email: '05davidhora05@gmail.com',
          tally_submission_id: null,
          stage: 'interview_scheduled',
          interview_date: '2026-05-13 12:00:00+00',
          cal_booking_uid: 'q2yeD8wdEWkehrqfmZTKTb',
          cal_booking_status: 'booked',
          cal_event_type: 'BOOKING_CREATED',
        },
      ],
      error: null,
    }));

    const select = vi.fn(() => ({
      order,
    }));

    const from = vi.fn(() => ({
      select,
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
      },
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapCandidate: (row: {
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string | null;
        tally_submission_id: string | null;
        stage: 'new' | 'interview_scheduled';
        interview_date: string | null;
        cal_booking_uid: string | null;
        cal_booking_status: string | null;
        cal_event_type: string | null;
      }) => ({
        id: Number.NaN,
        tallySubmissionId: row.tally_submission_id,
        name: `${row.first_name} ${row.last_name}`,
        phone: row.phone ?? '',
        email: row.email ?? '',
        src: row.tally_submission_id ? 'Tally' : 'Cal.com',
        calBooked: Boolean(row.cal_booking_uid || row.interview_date),
        calBookingUid: row.cal_booking_uid,
        calBookingStatus: row.cal_booking_status,
        calEventType: row.cal_event_type,
        stage: row.stage,
        interviewAt: row.interview_date,
        note: '',
      }),
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => snapshot,
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = updater(snapshot);
        return snapshot;
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    const { refreshCandidatesFromSupabase, getCandidates } = await import('./candidates.service');

    await refreshCandidatesFromSupabase();

    const candidates = getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: 'David Hora',
      phone: '+420734325088',
      email: '05davidhora05@gmail.com',
      tallySubmissionId: 'Nqo2j10',
      calBooked: true,
      calBookingUid: 'q2yeD8wdEWkehrqfmZTKTb',
      calBookingStatus: 'booked',
      calEventType: 'BOOKING_CREATED',
      stage: 'interview_scheduled',
      interviewAt: '2026-05-13 12:00:00+00',
    });
  });
});

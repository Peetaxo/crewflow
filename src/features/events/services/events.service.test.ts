import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventCrewAssignment, Timelog } from '../../../types';

describe('events.service fetch snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hydrates event job number and client name from related project and client rows', async () => {
    const eventsSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'event-row-1',
              project_id: 'project-row-1',
              job_number: null,
              client_name: null,
              name: 'Akce 1',
              date_from: '2026-04-20',
              date_to: '2026-04-21',
              time_from: null,
              time_to: null,
              city: 'Praha',
              crew_needed: 2,
              crew_filled: 2,
              status: 'upcoming',
              description: null,
              contact_person: null,
              dresscode: null,
              meeting_point: null,
              show_day_types: false,
              day_types: null,
              phase_times: null,
              phase_schedules: null,
            },
          ],
          error: null,
        }),
      })),
    }));
    const projectsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'project-row-1',
            job_number: 'AK001',
            client_id: 'client-row-1',
            name: 'Projekt 1',
            note: null,
            created_at: '2026-04-10',
            updated_at: '2026-04-10',
          },
        ],
        error: null,
      }),
    }));
    const clientsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'client-row-1',
            name: 'Klient A',
            ico: null,
            dic: null,
            street: null,
            zip: null,
            city: 'Praha',
            country: null,
            note: null,
            created_at: '2026-04-10',
            updated_at: '2026-04-10',
          },
        ],
        error: null,
      }),
    }));
    const timelogsSelect = vi.fn().mockResolvedValue({
      data: [
        { event_id: 'event-row-1', contractor_id: 'profile-uuid-1' },
      ],
      error: null,
    });
    const eventAssignmentsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }));
    const grasonConfirmationsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'grason-confirmation-1',
            source_month: '2026-05',
            source_key: '2026-05-20|Akce 1 / AK001',
            event_id: 'event-row-1',
            profile_id: 'profile-uuid-1',
            shift_date: '2026-05-20',
            source_title: 'Akce 1 / AK001',
            event_name: 'Akce 1',
            job_number: 'AK001',
            phase: 'provoz',
            confirmed_name: 'Test User',
            source_occurrence_count: 1,
            raw_payload: null,
            imported_at: '2026-05-20T00:00:00Z',
            updated_at: '2026-05-20T00:00:00Z',
          },
        ],
        error: null,
      }),
    }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') return { select: eventsSelect };
          if (table === 'projects') return { select: projectsSelect };
          if (table === 'clients') return { select: clientsSelect };
          if (table === 'timelogs') return { select: timelogsSelect };
          if (table === 'event_assignments') return { select: eventAssignmentsSelect };
          if (table === 'grason_event_confirmations') return { select: grasonConfirmationsSelect };
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    const updateLocalAppState = vi.fn((updater: (snapshot: { events: unknown[]; contractors: unknown[] }) => unknown) => (
      updater({ events: [{ id: 99, name: 'Stara akce' }], contractors: [{ id: 1, name: 'Crew' }] })
    ));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => ({ events: [] }),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: (row: { name: string; city: string }) => ({
        id: Number.NaN,
        name: row.name,
        city: row.city,
      }),
      mapEvent: (row: {
        id: string;
        name: string;
        status: 'upcoming';
        date_from: string;
        date_to: string;
        city: string;
        crew_filled: number;
      }) => ({
        id: Number.NaN,
        supabaseId: row.id,
        name: row.name,
        job: '',
        startDate: row.date_from,
        endDate: row.date_to,
        city: row.city,
        needed: 2,
        filled: row.crew_filled,
        status: row.status,
        client: '',
      }),
    }));

    const { fetchEventsSnapshot } = await import('./events.service');

    await expect(fetchEventsSnapshot()).resolves.toEqual([
      {
        id: 1,
        supabaseId: 'event-row-1',
        name: 'Akce 1',
        job: 'AK001',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming',
        client: 'Klient A',
      },
    ]);

    expect(updateLocalAppState).toHaveBeenCalledTimes(1);
    expect(updateLocalAppState.mock.results[0].value).toEqual({
      events: [
        {
          id: 1,
          supabaseId: 'event-row-1',
          name: 'Akce 1',
          job: 'AK001',
          startDate: '2026-04-20',
          endDate: '2026-04-21',
          city: 'Praha',
          needed: 2,
          filled: 1,
          status: 'upcoming',
          client: 'Klient A',
        },
      ],
      eventCrewAssignments: [],
      grasonEventConfirmations: [
        {
          id: 'grason-confirmation-1',
          source: 'grason',
          sourceMonth: '2026-05',
          sourceKey: '2026-05-20|Akce 1 / AK001',
          eventId: 'event-row-1',
          profileId: 'profile-uuid-1',
          shiftDate: '2026-05-20',
          sourceTitle: 'Akce 1 / AK001',
          eventName: 'Akce 1',
          jobNumber: 'AK001',
          phase: 'provoz',
          confirmedName: 'Test User',
          sourceOccurrenceCount: 1,
          rawPayload: null,
          importedAt: '2026-05-20T00:00:00Z',
          updatedAt: '2026-05-20T00:00:00Z',
        },
      ],
      contractors: [{ id: 1, name: 'Crew' }],
    });
  });
});

const createSnapshot = (overrides?: Partial<{
  events: Event[];
  projects: Array<{ id: string; name: string; client: string; createdAt: string; note: string }>;
  clients: Array<{ id: number; name: string }>;
  contractors: Array<{ id: number; profileId?: string; name: string; ii: string; bg: string; fg: string; tags: string[]; events: number; rate: number; phone: string; email: string; ico: string; dic: string; bank: string; city: string; reliable: boolean; note: string }>;
  timelogs: Timelog[];
  eventCrewAssignments: EventCrewAssignment[];
  receipts: Array<{ id: number; eid: number }>;
}>) => ({
  events: [],
  projects: [
    { id: 'AK001', name: 'Projekt 1', client: 'Klient A', createdAt: '2026-04-10', note: '' },
  ],
  clients: [
    { id: 1, name: 'Klient A' },
  ],
  contractors: [
    {
      id: 1,
      profileId: 'profile-uuid-1',
      name: 'Test User',
      ii: 'TU',
      bg: '#000',
      fg: '#fff',
      tags: [],
      events: 0,
      rate: 250,
      phone: '',
      email: '',
      ico: '',
      dic: '',
      bank: '',
      city: 'Praha',
      reliable: true,
      note: '',
    },
  ],
  timelogs: [],
  eventCrewAssignments: [],
  receipts: [],
  invoices: [],
  candidates: [],
  ...overrides,
});

describe('events.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('requests timelog hydration when reading event detail data', async () => {
    const ensureSupabaseTimelogsLoaded = vi.fn();
    const snapshot = createSnapshot({
      events: [
        {
          id: 1,
          supabaseId: 'event-uuid-1',
          name: 'Akce 1',
          job: 'AK001',
          startDate: '2026-04-20',
          endDate: '2026-04-20',
          city: 'Praha',
          needed: 2,
          filled: 1,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: false,
        },
      ],
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      ensureSupabaseTimelogsLoaded,
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { getEventDetailData } = await import('./events.service');

    const detail = getEventDetailData(1);

    expect(detail.event?.filled).toBe(1);
    expect(getEventDetailData('event-uuid-1').event?.name).toBe('Akce 1');
    await vi.waitFor(() => {
      expect(ensureSupabaseTimelogsLoaded).toHaveBeenCalledOnce();
    });
  });

  it('treats imported Grason crew assignments as normal assigned crew without requiring timelogs', async () => {
    const ensureSupabaseTimelogsLoaded = vi.fn();
    const snapshot = createSnapshot({
      events: [
        {
          id: 1,
          supabaseId: 'event-uuid-1',
          name: 'Grason akce',
          job: 'AK001',
          startDate: '2026-05-20',
          endDate: '2026-05-20',
          city: 'Praha',
          needed: 2,
          filled: 2,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: true,
        },
      ],
      eventCrewAssignments: [
        {
          eventId: 1,
          eventSupabaseId: 'event-uuid-1',
          contractorProfileId: 'profile-uuid-1',
          name: 'Test User',
        },
      ],
      grasonEventConfirmations: [
        {
          id: 'confirmation-1',
          source: 'grason',
          sourceMonth: '2026-05',
          sourceKey: '2026-05-20|Grason akce / AK001',
          eventId: 'event-uuid-1',
          profileId: 'profile-uuid-1',
          shiftDate: '2026-05-20',
          sourceTitle: 'Grason akce / AK001',
          eventName: 'Grason akce',
          jobNumber: 'AK001',
          phase: 'provoz',
          confirmedName: 'Test User',
          sourceOccurrenceCount: 1,
          rawPayload: null,
          importedAt: '2026-05-20T00:00:00Z',
          updatedAt: '2026-05-20T00:00:00Z',
        },
        {
          id: 'confirmation-2',
          source: 'grason',
          sourceMonth: '2026-05',
          sourceKey: '2026-05-20|Grason akce / AK001',
          eventId: 'event-uuid-1',
          profileId: null,
          shiftDate: '2026-05-20',
          sourceTitle: 'Grason akce / AK001',
          eventName: 'Grason akce',
          jobNumber: 'AK001',
          phase: 'provoz',
          confirmedName: 'Externi Clovek',
          sourceOccurrenceCount: 1,
          rawPayload: null,
          importedAt: '2026-05-20T00:00:00Z',
          updatedAt: '2026-05-20T00:00:00Z',
        },
      ],
    } as Parameters<typeof createSnapshot>[0]);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'local',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: vi.fn(),
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      ensureSupabaseTimelogsLoaded,
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { getEventCrew, getEventDetailData, getGrasonConfirmationsForEvent } = await import('./events.service');

    const detail = getEventDetailData('event-uuid-1');

    expect(detail.timelogs).toEqual([]);
    expect(detail.event?.filled).toBe(1);
    expect(getEventCrew(1).map((contractor) => contractor.name)).toEqual(['Test User']);
    expect(detail.grasonConfirmations.map((confirmation) => confirmation.confirmedName)).toEqual([
      'Externi Clovek',
      'Test User',
    ]);
    expect(getGrasonConfirmationsForEvent(detail.event!, snapshot.grasonEventConfirmations).map((confirmation) => confirmation.confirmedName)).toEqual([
      'Externi Clovek',
      'Test User',
    ]);
  });

  it('persists a new event to Supabase with the mapped project row id', async () => {
    let snapshot = createSnapshot();

    const projectsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'project-row-1', job_number: 'AK001', client_id: 'client-row-1' }],
        error: null,
      }),
    }));
    const clientsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'client-row-1', name: 'Klient A' }],
        error: null,
      }),
    }));
    const eventsInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'event-row-1' }, error: null });
    const eventsInsertSelect = vi.fn(() => ({ single: eventsInsertSingle }));
    const eventsInsert = vi.fn(() => ({ select: eventsInsertSelect }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'projects') return { select: projectsSelect };
          if (table === 'clients') return { select: clientsSelect };
          if (table === 'events') return { insert: eventsInsert };
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { saveEvent } = await import('./events.service');

    const saved = await saveEvent({
      id: 1,
      name: ' Akce 1 ',
      job: ' ak001 ',
      startDate: '2026-04-20',
      endDate: '2026-04-21',
      startTime: '08:00',
      endTime: '17:00',
      city: 'Praha',
      needed: 2,
      filled: 0,
      status: 'upcoming',
      client: ' Klient A ',
      showDayTypes: false,
    });

    expect(eventsInsert).toHaveBeenCalledWith({
      name: 'Akce 1',
      project_id: 'project-row-1',
      job_number: 'AK001',
      client_name: 'Klient A',
      date_from: '2026-04-20',
      date_to: '2026-04-21',
      time_from: '08:00',
      time_to: '17:00',
      city: 'Praha',
      crew_needed: 2,
      crew_filled: 0,
      status: 'upcoming',
      description: null,
      contact_person: null,
      dresscode: null,
      meeting_point: null,
      show_day_types: false,
      day_types: null,
      phase_times: null,
      phase_schedules: null,
    });
    expect(saved.job).toBe('AK001');
    expect(saved.client).toBe('Klient A');
    expect(snapshot.events).toHaveLength(1);
  });

  it('assigns crew by contractor profile id without profiles lookup', async () => {
    let snapshot = createSnapshot({
      events: [
        {
          id: 1,
          name: 'Akce 1',
          job: 'AK001',
          startDate: '2026-04-20',
          endDate: '2026-04-21',
          startTime: '08:00',
          endTime: '17:00',
          city: 'Praha',
          needed: 2,
          filled: 1,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: false,
        },
      ],
    });

    const eventsSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'event-row-1' }],
          error: null,
        }),
      })),
    }));
    const timelogsInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'timelog-row-1' },
      error: null,
    });
    const timelogsInsertSelect = vi.fn(() => ({ single: timelogsInsertSingle }));
    const timelogsInsert = vi.fn(() => ({ select: timelogsInsertSelect }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const eventsUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const eventsUpdate = vi.fn(() => ({ eq: eventsUpdateEq }));

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') return { select: eventsSelect, update: eventsUpdate };
          if (table === 'timelogs') return { insert: timelogsInsert };
          if (table === 'timelog_days') return { insert: timelogDaysInsert };
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { assignCrewToEvent } = await import('./events.service');

    const assignment = await assignCrewToEvent(1, 'profile-uuid-1');

    expect(timelogsInsert).toHaveBeenCalledWith({
      event_id: 'event-row-1',
      contractor_id: 'profile-uuid-1',
      km: 0,
      note: '',
      status: 'draft',
    });
    expect(timelogDaysInsert).toHaveBeenCalledWith([
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-20',
        time_from: '08:00',
        time_to: '17:00',
        day_type: 'instal',
      },
      {
        timelog_id: 'timelog-row-1',
        date: '2026-04-21',
        time_from: '08:00',
        time_to: '17:00',
        day_type: 'instal',
      },
    ]);
    expect(eventsUpdate).toHaveBeenCalledWith({ crew_filled: 1 });
    expect(eventsUpdateEq).toHaveBeenCalledWith('id', 'event-row-1');
    expect(assignment.event.filled).toBe(1);
    expect(snapshot.timelogs).toHaveLength(1);
    expect(snapshot.timelogs[0].contractorProfileId).toBe('profile-uuid-1');
  });

  it('removes crew by contractor profile id without profiles lookup', async () => {
    let snapshot = createSnapshot({
      events: [
        {
          id: 1,
          name: 'Akce 1',
          job: 'AK001',
          startDate: '2026-04-20',
          endDate: '2026-04-21',
          startTime: '08:00',
          endTime: '17:00',
          city: 'Praha',
          needed: 2,
          filled: 2,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: false,
        },
      ],
      timelogs: [
        {
          id: 1,
          eid: 1,
          contractorProfileId: 'profile-uuid-1',
          days: [{ d: '2026-04-20', f: '08:00', t: '17:00', type: 'instal' }],
          km: 0,
          note: '',
          status: 'draft',
        },
      ],
    });

    const eventsSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'event-row-1' }],
          error: null,
        }),
      })),
    }));
    const timelogSelectEqContractor = vi.fn().mockResolvedValue({
      data: [{ id: 'timelog-row-1' }],
      error: null,
    });
    const timelogSelectEqEvent = vi.fn(() => ({ eq: timelogSelectEqContractor }));
    const timelogSelect = vi.fn(() => ({ eq: timelogSelectEqEvent }));
    const timelogDeleteIn = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDeleteIn = vi.fn().mockResolvedValue({ error: null });
    const eventsUpdateEq = vi.fn().mockResolvedValue({ error: null });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') {
            return {
              select: eventsSelect,
              update: vi.fn(() => ({ eq: eventsUpdateEq })),
            };
          }
          if (table === 'timelogs') {
            return {
              select: timelogSelect,
              delete: vi.fn(() => ({ in: timelogDeleteIn })),
            };
          }
          if (table === 'timelog_days') {
            return {
              delete: vi.fn(() => ({ in: timelogDaysDeleteIn })),
            };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { removeContractorFromEvent } = await import('./events.service');

    const result = await removeContractorFromEvent(1, 'profile-uuid-1');

    expect(timelogSelectEqEvent).toHaveBeenCalledWith('event_id', 'event-row-1');
    expect(timelogSelectEqContractor).toHaveBeenCalledWith('contractor_id', 'profile-uuid-1');
    expect(timelogDaysDeleteIn).toHaveBeenCalledWith('timelog_id', ['timelog-row-1']);
    expect(timelogDeleteIn).toHaveBeenCalledWith('id', ['timelog-row-1']);
    expect(eventsUpdateEq).toHaveBeenCalledWith('id', 'event-row-1');
    expect(result.event.filled).toBe(0);
    expect(snapshot.timelogs).toHaveLength(0);
  });

  it('deletes only the Supabase event matching the UUID when local event ids collide', async () => {
    let snapshot = createSnapshot({
      events: [
        {
          id: 1,
          supabaseId: 'event-uuid-1',
          name: 'Mladi ladi jazz',
          job: 'AK001',
          startDate: '2026-04-30',
          endDate: '2026-04-30',
          city: 'Praha',
          needed: 2,
          filled: 0,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: false,
        },
        {
          id: 1,
          supabaseId: 'event-uuid-2',
          name: 'Mladi ladi jazz',
          job: 'AK001',
          startDate: '2026-04-30',
          endDate: '2026-04-30',
          city: 'Praha',
          needed: 2,
          filled: 0,
          status: 'upcoming',
          client: 'Klient A',
          showDayTypes: false,
        },
      ],
      timelogs: [],
      receipts: [],
    });

    const timelogsSelectEq = vi.fn().mockResolvedValue({ data: [], error: null });
    const eventDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const receiptDeleteEq = vi.fn().mockResolvedValue({ error: null });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'timelogs') {
            return { select: vi.fn(() => ({ eq: timelogsSelectEq })) };
          }
          if (table === 'receipts') {
            return { delete: vi.fn(() => ({ eq: receiptDeleteEq })) };
          }
          if (table === 'events') {
            return { delete: vi.fn(() => ({ eq: eventDeleteEq })) };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    }));

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { deleteEvent } = await import('./events.service');

    await deleteEvent('event-uuid-1');

    expect(eventDeleteEq).toHaveBeenCalledWith('id', 'event-uuid-1');
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0].supabaseId).toBe('event-uuid-2');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, ReceiptItem, Timelog } from '../../../types';

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
    const applicationsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    }));
    const crewAssignmentsRpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: 'event-row-1',
          profile_id: 'profile-uuid-1',
          first_name: 'Test',
          last_name: 'User',
        },
      ],
      error: null,
    });

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
          if (table === 'event_applications') return { select: applicationsSelect };
          throw new Error(`Unexpected table ${table}`);
        }),
        rpc: crewAssignmentsRpc,
      },
    }));

    const updateLocalAppState = vi.fn((updater: (snapshot: { events: unknown[]; eventApplications: unknown[]; eventCrewAssignments: unknown[]; contractors: unknown[] }) => unknown) => (
      updater({ events: [{ id: 99, name: 'Stara akce' }], eventApplications: [], eventCrewAssignments: [], contractors: [{ id: 1, name: 'Crew' }] })
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
        filled: 2,
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
          filled: 2,
          status: 'upcoming',
          client: 'Klient A',
        },
      ],
      eventApplications: [],
      eventCrewAssignments: [
        {
          eventId: 1,
          eventSupabaseId: 'event-row-1',
          contractorProfileId: 'profile-uuid-1',
          name: 'Test User',
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
  receipts: ReceiptItem[];
  eventCrewAssignments: Array<{ eventId: number; contractorProfileId: string; name: string }>;
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
  receipts: [],
  eventCrewAssignments: [],
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

  it('does not leak local demo receipts into Supabase event detail by local numeric id', async () => {
    const ensureSupabaseTimelogsLoaded = vi.fn();
    const demoReceipt: ReceiptItem = {
      id: 1,
      eid: 1,
      job: 'DEMO001',
      title: 'Demo uctenka',
      vendor: 'Demo vendor',
      amount: 420,
      paidAt: '2026-04-16',
      note: '',
      status: 'approved',
    };
    const supabaseReceipt: ReceiptItem = {
      id: 2,
      eventSupabaseId: 'event-uuid-1',
      eid: 1,
      job: 'AK001',
      title: 'Supabase uctenka',
      vendor: 'Real vendor',
      amount: 250,
      paidAt: '2026-04-16',
      note: '',
      status: 'submitted',
    };
    const otherSupabaseReceipt: ReceiptItem = {
      id: 3,
      eventSupabaseId: 'event-uuid-2',
      eid: 1,
      job: 'AK002',
      title: 'Jina Supabase uctenka',
      vendor: 'Other vendor',
      amount: 100,
      paidAt: '2026-04-16',
      note: '',
      status: 'submitted',
    };
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
      receipts: [demoReceipt, supabaseReceipt, otherSupabaseReceipt],
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
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

    expect(getEventDetailData('event-uuid-1').receipts).toEqual([supabaseReceipt]);
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
      allow_crew_time_proposal: false,
      day_types: null,
      phase_times: null,
      phase_schedules: null,
    });
    expect(saved.job).toBe('AK001');
    expect(saved.client).toBe('Klient A');
    expect(snapshot.events).toHaveLength(1);
  });

  it('persists synced timelog day times to Supabase when an event time changes', async () => {
    let snapshot = createSnapshot({
      events: [
        {
          id: 1,
          supabaseId: 'event-row-1',
          name: 'Akce 1',
          job: 'AK001',
          startDate: '2026-05-12',
          endDate: '2026-05-12',
          startTime: '08:00',
          endTime: '14:00',
          city: 'Praha',
          needed: 2,
          filled: 1,
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
          days: [{ d: '2026-05-12', f: '08:00', t: '14:00', type: 'instal' }],
          km: 0,
          note: '',
          status: 'draft',
        },
      ],
    });
    const eventsUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const eventsUpdate = vi.fn(() => ({ eq: eventsUpdateEq }));
    const timelogsEq = vi.fn().mockResolvedValue({
      data: [{ id: 'timelog-row-1', contractor_id: 'profile-uuid-1' }],
      error: null,
    });
    const timelogsSelect = vi.fn(() => ({ eq: timelogsEq }));
    const timelogDaysDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({ eq: timelogDaysDeleteEq }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
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

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') return { update: eventsUpdate };
          if (table === 'projects') return { select: projectsSelect };
          if (table === 'clients') return { select: clientsSelect };
          if (table === 'timelogs') return { select: timelogsSelect };
          if (table === 'timelog_days') return { delete: timelogDaysDelete, insert: timelogDaysInsert };
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

    await saveEvent({
      ...snapshot.events[0],
      startTime: '10:00',
      endTime: '16:00',
    });

    expect(timelogDaysDeleteEq).toHaveBeenCalledWith('timelog_id', 'timelog-row-1');
    expect(timelogDaysInsert).toHaveBeenCalledWith([
      {
        timelog_id: 'timelog-row-1',
        date: '2026-05-12',
        time_from: '10:00',
        time_to: '16:00',
        day_type: 'instal',
      },
    ]);
    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-05-12', f: '10:00', t: '16:00', type: 'instal' },
    ]);
  });

  it('creates an unsaved copy of an event on the next available day without crew assignments', async () => {
    const snapshot = createSnapshot({
      events: [
        {
          id: 5,
          supabaseId: 'event-uuid-5',
          name: 'Akce ke kopii',
          job: 'AK001',
          startDate: '2026-04-16',
          endDate: '2026-04-17',
          startTime: '09:00',
          endTime: '17:00',
          city: 'Praha',
          needed: 3,
          filled: 3,
          status: 'past',
          client: 'Klient A',
          showDayTypes: true,
          dayTypes: {
            '2026-04-16': 'instal',
            '2026-04-17': 'deinstal',
          },
          phaseSchedules: {
            instal: [{ id: 'slot-i', from: '09:00', to: '12:00', dates: ['2026-04-16'] }],
            deinstal: [{ id: 'slot-d', from: '13:00', to: '17:00', dates: ['2026-04-17'] }],
          },
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

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: vi.fn(),
      mapEvent: vi.fn(),
    }));

    const { createEventCopy } = await import('./events.service');

    const copy = createEventCopy(snapshot.events[0]);

    expect(copy).toMatchObject({
      id: 6,
      name: 'Akce ke kopii',
      job: 'AK001',
      startDate: '2026-04-18',
      endDate: '2026-04-19',
      filled: 0,
      status: 'upcoming',
      client: 'Klient A',
    });
    expect(copy.supabaseId).toBeUndefined();
    expect(copy.dayTypes).toEqual({
      '2026-04-18': 'instal',
      '2026-04-19': 'deinstal',
    });
    expect(copy.phaseSchedules?.instal?.[0].dates).toEqual(['2026-04-18']);
    expect(copy.phaseSchedules?.deinstal?.[0].dates).toEqual(['2026-04-19']);
    expect(copy.phaseSchedules?.instal?.[0].id).not.toBe('slot-i');
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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventApplication, EventCrewAssignment, GrasonEventConfirmation, ReceiptItem, Timelog } from '../../../types';

describe('events.service fetch snapshot', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('hydrates event job number and client name from related project and client rows', async () => {
    const eventsSelect = vi.fn(() => ({
      order: vi.fn(() => ({
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
    const timelogsSelect = vi.fn().mockResolvedValue({
      data: [],
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
      eventApplications: [],
      eventCrewAssignments: [
        {
          eventId: 1,
          eventSupabaseId: 'event-row-1',
          contractorProfileId: 'profile-uuid-1',
          name: 'Test User',
        },
      ],
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
  eventApplications: EventApplication[];
  eventCrewAssignments: EventCrewAssignment[];
  receipts: ReceiptItem[];
  grasonEventConfirmations: GrasonEventConfirmation[];
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
  eventApplications: [],
  eventCrewAssignments: [],
  receipts: [],
  grasonEventConfirmations: [],
  invoices: [],
  candidates: [],
  ...overrides,
});

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('events.service write flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const lifecycleEvent: Event = {
    id: 1,
    supabaseId: 'event-row-1',
    updatedAt: '2026-04-10T09:00:00Z',
    name: 'Akce 1',
    job: 'AK001',
    startDate: '2026-04-20',
    endDate: '2026-04-21',
    startTime: '08:00',
    endTime: '17:00',
    city: 'Praha',
    needed: 2,
    filled: 0,
    status: 'upcoming',
    client: 'Klient A',
    showDayTypes: false,
  };

  const canonicalTimelog: Timelog = {
    id: 1,
    supabaseId: 'timelog-row-1',
    eid: 1,
    eventSupabaseId: 'event-row-1',
    contractorProfileId: 'profile-uuid-1',
    days: [
      { d: '2026-04-20', f: '08:00', t: '17:00', type: 'instal' },
      { d: '2026-04-21', f: '08:00', t: '17:00', type: 'instal' },
    ],
    km: 0,
    note: '',
    status: 'draft',
  };

  const lifecycleApplication: EventApplication = {
    id: 1,
    supabaseId: 'application-row-1',
    eventId: 1,
    eventSupabaseId: 'event-row-1',
    contractorProfileId: 'profile-uuid-1',
    status: 'pending',
    note: '',
    createdAt: '2026-04-10T08:00:00Z',
  };

  const rpcAssignment = {
    event_id: 'event-row-1',
    profile_id: 'profile-uuid-1',
    assignment_id: 'assignment-row-1',
    timelog_id: 'timelog-row-1',
    application_id: null,
    timelog_created: true,
    crew_filled: 1,
  };

  const rpcRemoval = {
    event_id: 'event-row-1',
    profile_id: 'profile-uuid-1',
    application_id: null,
    assignment_removed: true,
    timelog_removed: true,
    crew_filled: 0,
  };

  const rpcWithdrawalApproval = {
    ...rpcRemoval,
    application_id: 'application-row-1',
  };

  const setupLifecycleService = async ({
    dataSource = 'supabase',
    initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      eventApplications: [lifecycleApplication],
    }),
    refreshedEvents = [lifecycleEvent],
    refreshedTimelogs = [canonicalTimelog],
    refreshedReceipts = initialSnapshot.receipts ?? [],
    refreshedApplicationStatus = 'approved' as EventApplication['status'],
    failEventsRefresh = false,
    failTimelogsRefresh = false,
    deferredPublicEvents = null as Event[] | null,
    eventSaveError = null as { code: string; message: string } | null,
  } = {}) => {
    let snapshot = structuredClone(initialSnapshot);
    const assignEventCrewRpc = vi.fn().mockResolvedValue(rpcAssignment);
    const removeEventCrewRpc = vi.fn().mockResolvedValue(rpcRemoval);
    const approveEventWithdrawalRpc = vi.fn().mockResolvedValue(rpcWithdrawalApproval);
    const deleteEventAtomicRpc = vi.fn().mockResolvedValue({ event_id: 'event-row-1' });
    const setQueryData = vi.fn();
    const invalidateQueries = vi.fn();
    const isDisposableTimelogStatus = vi.fn((status: Timelog['status']) => (
      status === 'draft' || status === 'rejected'
    ));
    const timelogsInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { id: 'timelog-row-1' }, error: null }),
      })),
    }));
    const timelogsDelete = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ error: null }),
    }));
    const timelogDaysInsert = vi.fn().mockResolvedValue({ error: null });
    const timelogDaysDelete = vi.fn(() => ({
      in: vi.fn().mockResolvedValue({ error: null }),
    }));
    const eventAssignmentsInsert = vi.fn().mockResolvedValue({ error: null });
    const eventAssignmentsDelete = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    }));
    const eventsUpdateSingle = vi.fn(async () => ({
      data: eventSaveError ? null : {
        id: eventRows[0]?.id,
        updated_at: eventRows[0]?.updated_at,
        crew_filled: eventRows[0]?.crew_filled,
      },
      error: eventSaveError,
    }));
    const eventsUpdateSelect = vi.fn(() => ({ single: eventsUpdateSingle }));
    const eventsUpdateVersionEq = vi.fn(() => ({ select: eventsUpdateSelect }));
    const eventsUpdateIdEq = vi.fn(() => ({ eq: eventsUpdateVersionEq }));
    const eventsUpdate = vi.fn(() => ({ eq: eventsUpdateIdEq }));
    let requestedApplicationStatus: EventApplication['status'] = 'pending';
    const eventApplicationsSelect = vi.fn(async () => ({
      data: [{
        ...applicationRows[0],
        status: requestedApplicationStatus,
      }],
      error: null,
    }));
    const eventApplicationsExpectedStatusEq = vi.fn(() => ({ select: eventApplicationsSelect }));
    const eventApplicationsIdEq = vi.fn(() => ({
      eq: eventApplicationsExpectedStatusEq,
      select: eventApplicationsSelect,
    }));
    const eventApplicationsUpdate = vi.fn(({ status }: { status: EventApplication['status'] }) => {
      requestedApplicationStatus = status;
      return { eq: eventApplicationsIdEq };
    });
    const eventApplicationsUpsertSingle = vi.fn(async () => ({
      data: {
        ...applicationRows[0],
        status: requestedApplicationStatus,
      },
      error: null,
    }));
    const eventApplicationsUpsertSelect = vi.fn(() => ({ single: eventApplicationsUpsertSingle }));
    const eventApplicationsUpsert = vi.fn(({ status }: { status: EventApplication['status'] }) => {
      requestedApplicationStatus = status;
      return { select: eventApplicationsUpsertSelect };
    });

    const toEventRow = (event: Event) => ({
      id: event.supabaseId,
      updated_at: event.updatedAt ?? '2026-04-10T09:00:00Z',
      project_id: 'project-row-1',
      job_number: event.job,
      client_name: event.client,
      name: event.name,
      date_from: event.startDate,
      date_to: event.endDate,
      time_from: event.startTime ?? null,
      time_to: event.endTime ?? null,
      city: event.city,
      address: event.address ?? event.city,
      place_id: event.placeId ?? null,
      location_lat: event.locationLat ?? null,
      location_lng: event.locationLng ?? null,
      crew_needed: event.needed,
      crew_filled: event.filled,
      status: event.status,
      description: null,
      contact_person: null,
      dresscode: null,
      meeting_point: null,
      show_day_types: event.showDayTypes ?? false,
      allow_crew_time_proposal: event.allowCrewTimeProposal ?? false,
      day_types: event.dayTypes ?? null,
      phase_times: event.phaseTimes ?? null,
      phase_schedules: event.phaseSchedules ?? null,
    });
    const eventRows = refreshedEvents.map(toEventRow);
    const applicationRows = (initialSnapshot.eventApplications ?? []).map((application) => ({
      id: application.supabaseId ?? 'application-row-1',
      event_id: application.eventSupabaseId ?? 'event-row-1',
      profile_id: application.contractorProfileId,
      status: refreshedApplicationStatus,
      note: application.note ?? null,
      planned_from: application.plannedFrom ?? null,
      planned_to: application.plannedTo ?? null,
      created_at: application.createdAt ?? '2026-04-10T08:00:00Z',
    }));
    const loadTimelogsSnapshot = vi.fn(async () => {
      if (failTimelogsRefresh) {
        throw new Error('timelog refresh failed');
      }
      return structuredClone(refreshedTimelogs);
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: dataSource,
    }));

    vi.doMock('./event-assignment-lifecycle.service', () => ({
      approveEventWithdrawalRpc,
      assignEventCrewRpc,
      removeEventCrewRpc,
      isDisposableTimelogStatus,
    }));

    vi.doMock('./event-mutation-rpc.service', () => ({ deleteEventAtomicRpc }));

    vi.doMock('../../timelogs/services/timelogs.service', () => ({
      ensureSupabaseTimelogsLoaded: vi.fn(),
      loadTimelogsSnapshot,
      fetchTimelogsSnapshot: loadTimelogsSnapshot,
    }));

    const fetchReceiptsSnapshot = vi.fn(async () => structuredClone(refreshedReceipts));
    vi.doMock('../../receipts/services/receipts.service', () => ({ fetchReceiptsSnapshot }));

    vi.doMock('../../../lib/query-client', () => ({
      queryClient: {
        setQueryData,
        invalidateQueries,
      },
    }));

    vi.doMock('../../../lib/query-keys', () => ({
      queryKeys: {
        events: { all: ['events'] },
        timelogs: { all: ['timelogs'] },
        receipts: { all: ['receipts'] },
      },
    }));

    const createEventsQuery = (result: Promise<{
      data: typeof eventRows;
      error: { message: string } | null;
    }>) => {
      const order = vi.fn();
      const query = {
        order,
        then: result.then.bind(result),
      };
      order.mockReturnValue(query);
      return query;
    };
    const eventsQuery = createEventsQuery(Promise.resolve({
      data: eventRows,
      error: failEventsRefresh ? { message: 'event refresh failed' } : null,
    }));
    const deferredPublicEventsResult = createDeferred<{
      data: typeof eventRows;
      error: null;
    }>();
    const deferredPublicEventsQuery = createEventsQuery(deferredPublicEventsResult.promise);
    const eventsSelect = vi.fn(() => eventsQuery);
    if (deferredPublicEvents) {
      eventsSelect.mockImplementationOnce(() => deferredPublicEventsQuery);
    }

    const from = vi.fn((table: string) => {
      if (table === 'events') {
        return {
          select: eventsSelect,
          update: eventsUpdate,
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{
                id: 'project-row-1',
                job_number: 'AK001',
                client_id: 'client-row-1',
                name: 'Projekt 1',
                note: null,
                created_at: '2026-04-10',
                updated_at: '2026-04-10',
              }],
              error: null,
            }),
          })),
        };
      }
      if (table === 'clients') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ id: 'client-row-1', name: 'Klient A', city: 'Praha' }],
              error: null,
            }),
          })),
        };
      }
      if (table === 'timelogs') {
        return {
          select: vi.fn((columns: string) => {
            if (columns === 'event_id,contractor_id') {
              return Promise.resolve({
                data: refreshedTimelogs.map((timelog) => ({
                  event_id: 'event-row-1',
                  contractor_id: timelog.contractorProfileId ?? null,
                })),
                error: null,
              });
            }
            return {
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [{ id: 'timelog-row-1' }], error: null }),
              })),
            };
          }),
          insert: timelogsInsert,
          delete: timelogsDelete,
        };
      }
      if (table === 'timelog_days') {
        return { insert: timelogDaysInsert, delete: timelogDaysDelete };
      }
      if (table === 'event_assignments') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
          insert: eventAssignmentsInsert,
          delete: eventAssignmentsDelete,
        };
      }
      if (table === 'grason_event_confirmations') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      if (table === 'event_applications') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: applicationRows, error: null }),
          })),
          update: eventApplicationsUpdate,
          upsert: eventApplicationsUpsert,
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: dataSource === 'supabase',
      supabase: dataSource === 'supabase'
        ? {
            from,
            rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        : null,
    }));

    const updateLocalAppState = vi.fn((updater: (state: typeof snapshot) => typeof snapshot) => {
      snapshot = structuredClone(updater(structuredClone(snapshot)));
      return structuredClone(snapshot);
    });

    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState,
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));

    vi.doMock('../../../lib/supabase-mappers', () => ({
      mapClient: (row: { name: string; city: string }) => ({
        id: Number.NaN,
        name: row.name,
        city: row.city,
      }),
      mapEvent: (row: typeof eventRows[number]) => ({
        id: Number.NaN,
        supabaseId: row.id,
        updatedAt: row.updated_at,
        name: row.name,
        job: row.job_number,
        startDate: row.date_from,
        endDate: row.date_to,
        startTime: row.time_from ?? undefined,
        endTime: row.time_to ?? undefined,
        city: row.city,
        needed: row.crew_needed,
        filled: row.crew_filled,
        status: row.status,
        client: row.client_name,
        showDayTypes: row.show_day_types,
      }),
    }));

    return {
      service: await import('./events.service'),
      getSnapshot: () => structuredClone(snapshot),
      setSnapshot: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
      },
      assignEventCrewRpc,
      removeEventCrewRpc,
      approveEventWithdrawalRpc,
      deleteEventAtomicRpc,
      fetchReceiptsSnapshot,
      loadTimelogsSnapshot,
      updateLocalAppState,
      setQueryData,
      invalidateQueries,
      eventsOrder: eventsQuery.order,
      eventsSelect,
      resolveDeferredPublicEvents: () => {
        deferredPublicEventsResult.resolve({
          data: (deferredPublicEvents ?? []).map(toEventRow),
          error: null,
        });
      },
      eventApplicationsUpdate,
      eventApplicationsIdEq,
      eventApplicationsExpectedStatusEq,
      eventApplicationsSelect,
      eventApplicationsUpsertSingle,
      directWrites: {
        timelogsInsert,
        timelogsDelete,
        timelogDaysInsert,
        timelogDaysDelete,
        eventAssignmentsInsert,
        eventAssignmentsDelete,
        eventsUpdate,
      },
    };
  };

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
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'event-row-1') });

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
    const eventsInsertSingle = vi.fn().mockResolvedValue({
      data: { id: 'event-row-1', updated_at: '2026-04-19T10:00:00Z', crew_filled: 0 },
      error: null,
    });
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
      address: 'Rohanske nabrezi 678/23, Praha',
      placeId: 'ChIJ-event-place',
      locationLat: 50.0929,
      locationLng: 14.4502,
      needed: 2,
      filled: 0,
      status: 'upcoming',
      client: ' Klient A ',
      showDayTypes: false,
    });

    expect(eventsInsert).toHaveBeenCalledWith({
      id: 'event-row-1',
      name: 'Akce 1',
      project_id: 'project-row-1',
      job_number: 'AK001',
      client_name: 'Klient A',
      date_from: '2026-04-20',
      date_to: '2026-04-21',
      time_from: '08:00',
      time_to: '17:00',
      city: 'Rohanske nabrezi 678/23, Praha',
      address: 'Rohanske nabrezi 678/23, Praha',
      place_id: 'ChIJ-event-place',
      location_lat: 50.0929,
      location_lng: 14.4502,
      crew_needed: 2,
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
    expect(saved.city).toBe('Rohanske nabrezi 678/23, Praha');
    expect(saved.address).toBe('Rohanske nabrezi 678/23, Praha');
    expect(saved.supabaseId).toBe('event-row-1');
    expect(saved.updatedAt).toBe('2026-04-19T10:00:00Z');
    expect(snapshot.events).toHaveLength(1);
  });

  it('saves event-only changes without directly writing or changing existing timelogs', async () => {
    let snapshot = createSnapshot({
      events: [
        {
          id: 1,
          supabaseId: 'event-row-1',
          updatedAt: '2026-05-12T09:00:00Z',
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
    const eventsUpdateSingle = vi.fn().mockResolvedValue({
      data: { id: 'event-row-1', updated_at: '2026-05-12T10:00:00Z', crew_filled: 1 },
      error: null,
    });
    const eventsUpdateSelect = vi.fn(() => ({ single: eventsUpdateSingle }));
    const eventsUpdateVersionEq = vi.fn(() => ({ select: eventsUpdateSelect }));
    const eventsUpdateIdEq = vi.fn(() => ({ eq: eventsUpdateVersionEq }));
    const eventsUpdate = vi.fn(() => ({ eq: eventsUpdateIdEq }));
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
    const from = vi.fn((table: string) => {
      if (table === 'events') return { update: eventsUpdate };
      if (table === 'projects') return { select: projectsSelect };
      if (table === 'clients') return { select: clientsSelect };
      if (table === 'timelogs') return { select: timelogsSelect };
      if (table === 'timelog_days') return { delete: timelogDaysDelete, insert: timelogDaysInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
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

    expect(from).not.toHaveBeenCalledWith('timelogs');
    expect(from).not.toHaveBeenCalledWith('timelog_days');
    expect(timelogsSelect).not.toHaveBeenCalled();
    expect(timelogDaysDelete).not.toHaveBeenCalled();
    expect(timelogDaysInsert).not.toHaveBeenCalled();
    expect(snapshot.timelogs[0].days).toEqual([
      { d: '2026-05-12', f: '08:00', t: '14:00', type: 'instal' },
    ]);
    expect(snapshot.events[0].startTime).toBe('10:00');
    expect(snapshot.events[0].endTime).toBe('16:00');
  });

  it('does not expose raw database details when saving a Supabase event fails', async () => {
    let snapshot = createSnapshot({
      events: [{
        id: 1,
        supabaseId: 'event-row-1',
        updatedAt: '2026-05-12T09:00:00Z',
        name: 'Akce 1',
        job: 'AK001',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
        city: 'Praha',
        needed: 2,
        filled: 1,
        status: 'upcoming',
        client: 'Klient A',
        showDayTypes: false,
      }],
    });
    const databaseError = {
      code: '23514',
      message: 'new row for relation "events" violates check constraint internal_event_rule',
      details: 'Sensitive internal constraint detail',
    };
    const eventsUpdateSingle = vi.fn().mockResolvedValue({ data: null, error: databaseError });
    const eventsUpdateSelect = vi.fn(() => ({ single: eventsUpdateSingle }));
    const eventsUpdateVersionEq = vi.fn(() => ({ select: eventsUpdateSelect }));
    const eventsUpdateIdEq = vi.fn(() => ({ eq: eventsUpdateVersionEq }));
    const eventsUpdate = vi.fn(() => ({ eq: eventsUpdateIdEq }));
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

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') return { update: eventsUpdate };
          if (table === 'projects') return { select: projectsSelect };
          if (table === 'clients') return { select: clientsSelect };
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { saveEvent } = await import('./events.service');

      await expect(saveEvent({ ...snapshot.events[0], name: 'Změněná akce' }))
        .rejects.toThrow('Akci se nepodařilo uložit.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected event save error', databaseError);
      expect(snapshot.events[0].name).toBe('Akce 1');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('updates an event by stable UUID/version without persisting stale derived crew_filled', async () => {
    const currentEvent = {
      id: 1,
      supabaseId: 'event-row-1',
      updatedAt: '2026-05-12T10:00:00Z',
      name: 'Akce 1',
      job: 'AK001',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      city: 'Praha',
      needed: 2,
      filled: 2,
      status: 'upcoming' as const,
      client: 'Klient A',
      showDayTypes: false,
    } as Event & { updatedAt: string };
    let snapshot = createSnapshot({ events: [currentEvent] });
    const single = vi.fn().mockResolvedValue({
      data: { id: 'event-row-1', updated_at: '2026-05-12T11:00:00Z', crew_filled: 2 },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const versionEq = vi.fn(() => ({ select }));
    const idEq = vi.fn(() => ({ eq: versionEq }));
    const update = vi.fn(() => ({ eq: idEq }));
    const projectsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({
        data: [{ id: 'project-row-1', job_number: 'AK001', client_id: 'client-row-1' }], error: null,
      }),
    }));
    const clientsSelect = vi.fn(() => ({
      order: vi.fn().mockResolvedValue({ data: [{ id: 'client-row-1', name: 'Klient A' }], error: null }),
    }));

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'events') return { update };
          if (table === 'projects') return { select: projectsSelect };
          if (table === 'clients') return { select: clientsSelect };
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
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapClient: vi.fn(), mapEvent: vi.fn() }));

    const { saveEvent } = await import('./events.service');
    const saved = await saveEvent({ ...currentEvent, name: 'Změněná akce', filled: 0 });

    expect(update).toHaveBeenCalledWith(expect.not.objectContaining({ crew_filled: expect.anything() }));
    expect(idEq).toHaveBeenCalledWith('id', 'event-row-1');
    expect(versionEq).toHaveBeenCalledWith('updated_at', '2026-05-12T10:00:00Z');
    expect(select).toHaveBeenCalledWith('id,updated_at,crew_filled');
    expect(saved).toMatchObject({
      supabaseId: 'event-row-1', updatedAt: '2026-05-12T11:00:00Z', filled: 2, name: 'Změněná akce',
    });
    expect(snapshot.events[0]).toMatchObject({ updatedAt: '2026-05-12T11:00:00Z', filled: 2 });
  });

  it('waits behind assignment lifecycle work and rejects a stale editor version before event DML', async () => {
    const staleEvent = {
      id: 1,
      supabaseId: 'event-row-1',
      updatedAt: '2026-05-12T10:00:00Z',
      name: 'Akce 1',
      job: 'AK001',
      startDate: '2026-05-12',
      endDate: '2026-05-12',
      city: 'Praha',
      needed: 2,
      filled: 0,
      status: 'upcoming' as const,
      client: 'Klient A',
      showDayTypes: false,
    } as Event & { updatedAt: string };
    let snapshot = createSnapshot({ events: [staleEvent] });
    const update = vi.fn();

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from: vi.fn((table: string) => (table === 'events' ? { update } : { select: vi.fn() })) },
    }));
    vi.doMock('../../../lib/app-data', () => ({
      getLocalAppState: () => structuredClone(snapshot),
      updateLocalAppState: (updater: (state: typeof snapshot) => typeof snapshot) => {
        snapshot = structuredClone(updater(structuredClone(snapshot)));
        return structuredClone(snapshot);
      },
      subscribeToLocalAppState: vi.fn(() => () => undefined),
    }));
    vi.doMock('../../../lib/supabase-mappers', () => ({ mapClient: vi.fn(), mapEvent: vi.fn() }));

    const { saveEvent } = await import('./events.service');
    const { runLifecycleDataMutation } = await import('../../event-lifecycle-generation');
    const assignmentEntered = createDeferred<void>();
    const releaseAssignment = createDeferred<void>();
    const assignment = runLifecycleDataMutation(['test:assignment'], async () => {
      assignmentEntered.resolve();
      await releaseAssignment.promise;
    });
    await assignmentEntered.promise;

    const pendingSave = saveEvent({ ...staleEvent, name: 'Stará editace' });
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();

    snapshot = {
      ...snapshot,
      events: [{ ...staleEvent, filled: 1, updatedAt: '2026-05-12T10:30:00Z' }],
    };
    releaseAssignment.resolve();
    await assignment;

    await expect(pendingSave).rejects.toThrow(
      'Akce se mezitím změnila. Obnovte data a zkuste to znovu.',
    );
    expect(update).not.toHaveBeenCalled();
    expect(snapshot.events[0]).toMatchObject({ filled: 1, updatedAt: '2026-05-12T10:30:00Z' });
  });

  it('recovers a lost event create response by one stable client UUID without inserting twice', async () => {
    let snapshot = createSnapshot();
    let authoritativeEventRow: Record<string, unknown> | null = null;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'event-client-uuid') });
    const insert = vi.fn((payload: Record<string, unknown>) => {
      authoritativeEventRow = {
        ...payload,
        updated_at: '2026-05-12T11:00:00Z',
        crew_filled: 0,
      };
      return {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'XX000', message: 'connection lost after committed event insert' },
          }),
        })),
      };
    });
    const eventOrderResult = () => {
      const result = Promise.resolve({
        data: authoritativeEventRow ? [authoritativeEventRow] : [], error: null,
      });
      const query = Object.assign(result, { order: vi.fn(() => query) });
      return query;
    };
    const emptyOrderResult = { order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const projectRows = [{
      id: 'project-row-1', job_number: 'AK001', client_id: 'client-row-1', name: 'Projekt 1',
      note: null, created_at: '2026-04-10', updated_at: '2026-04-10',
    }];
    const clientRows = [{ id: 'client-row-1', name: 'Klient A', city: 'Praha' }];

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
        from: vi.fn((table: string) => {
          if (table === 'events') {
            return { insert, select: vi.fn(() => eventOrderResult()) };
          }
          if (table === 'projects') {
            return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: projectRows, error: null }) })) };
          }
          if (table === 'clients') {
            return { select: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: clientRows, error: null }) })) };
          }
          if (table === 'timelogs') return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
          if (table === 'event_assignments' || table === 'event_applications' || table === 'grason_event_confirmations') {
            return { select: vi.fn(() => emptyOrderResult) };
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
      mapClient: vi.fn((row: Record<string, unknown>) => ({ id: Number.NaN, name: row.name, city: row.city })),
      mapEvent: vi.fn((row: Record<string, unknown>) => ({
        id: Number.NaN,
        supabaseId: row.id,
        updatedAt: row.updated_at,
        projectId: row.project_id,
        name: row.name,
        job: row.job_number,
        startDate: row.date_from,
        endDate: row.date_to,
        startTime: row.time_from ?? undefined,
        endTime: row.time_to ?? undefined,
        city: row.city,
        address: row.address ?? undefined,
        placeId: row.place_id ?? undefined,
        locationLat: row.location_lat,
        locationLng: row.location_lng,
        needed: row.crew_needed,
        filled: row.crew_filled,
        status: row.status,
        client: row.client_name,
        description: row.description ?? undefined,
        contactPerson: row.contact_person ?? undefined,
        dresscode: row.dresscode ?? undefined,
        meetingLocation: row.meeting_point ?? undefined,
        showDayTypes: row.show_day_types,
        allowCrewTimeProposal: row.allow_crew_time_proposal,
        dayTypes: row.day_types ?? undefined,
        phaseTimes: row.phase_times ?? undefined,
        phaseSchedules: row.phase_schedules ?? undefined,
      })),
    }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { saveEvent } = await import('./events.service');
      const created = await saveEvent({
        id: 1,
        name: 'Nová akce',
        job: 'AK001',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
        city: 'Praha',
        needed: 2,
        filled: 0,
        status: 'upcoming',
        client: 'Klient A',
        showDayTypes: false,
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-client-uuid' }));
      expect(created).toMatchObject({
        supabaseId: 'event-client-uuid', updatedAt: '2026-05-12T11:00:00Z', name: 'Nová akce', filled: 0,
      });
      expect(snapshot.events).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('maps an optimistic event update miss to a stable conflict without redundant recovery', async () => {
    const harness = await setupLifecycleService({
      eventSaveError: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });

    await expect(harness.service.saveEvent({ ...lifecycleEvent, name: 'Změněná akce' }))
      .rejects.toThrow('Akce se mezitím změnila. Obnovte data a zkuste to znovu.');

    expect(harness.directWrites.eventsUpdate).toHaveBeenCalledTimes(1);
    expect(harness.eventsSelect).not.toHaveBeenCalled();
    expect(harness.getSnapshot().events[0]).toMatchObject({
      name: 'Akce 1', updatedAt: '2026-04-10T09:00:00Z',
    });
  });

  it('returns canonical event state when an update commits but its response is lost', async () => {
    const canonicalEvent = {
      ...lifecycleEvent,
      name: 'Změněná akce',
      address: 'Praha',
      locationLat: null,
      locationLng: null,
      updatedAt: '2026-04-10T10:00:00Z',
      filled: 1,
    };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({ events: [lifecycleEvent], eventApplications: [] }),
      refreshedEvents: [canonicalEvent],
      eventSaveError: { code: 'XX000', message: 'connection lost after committed event update' },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const saved = await harness.service.saveEvent({ ...lifecycleEvent, name: 'Změněná akce' });

      expect(harness.directWrites.eventsUpdate).toHaveBeenCalledTimes(1);
      expect(harness.eventsSelect).toHaveBeenCalledTimes(1);
      expect(saved).toMatchObject({
        supabaseId: 'event-row-1', name: 'Změněná akce', updatedAt: '2026-04-10T10:00:00Z', filled: 1,
      });
      expect(harness.getSnapshot().events[0]).toMatchObject({
        supabaseId: 'event-row-1', name: 'Změněná akce', updatedAt: '2026-04-10T10:00:00Z', filled: 1,
      });
    } finally {
      consoleError.mockRestore();
    }
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

  it('assigns Crew with one RPC and performs no direct lifecycle writes', async () => {
    const harness = await setupLifecycleService();

    const result = await harness.service.assignCrewToEvent(1, 'profile-uuid-1');

    expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
    expect(harness.assignEventCrewRpc).toHaveBeenCalledWith({
      eventId: 'event-row-1',
      profileId: 'profile-uuid-1',
      applicationId: null,
      days: canonicalTimelog.days,
    });
    expect(harness.directWrites.timelogsInsert).not.toHaveBeenCalled();
    expect(harness.directWrites.timelogDaysInsert).not.toHaveBeenCalled();
    expect(harness.directWrites.eventAssignmentsInsert).not.toHaveBeenCalled();
    expect(harness.directWrites.eventsUpdate).not.toHaveBeenCalled();
    expect(harness.eventApplicationsUpdate).not.toHaveBeenCalled();
    expect(result.rpc).toEqual(rpcAssignment);
  });

  it('approves an application with one assignment RPC and no separate status update', async () => {
    const harness = await setupLifecycleService();

    await harness.service.approveEventApplication(1);

    expect(harness.assignEventCrewRpc).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-row-1',
      profileId: 'profile-uuid-1',
      applicationId: 'application-row-1',
    }));
    expect(harness.eventApplicationsUpdate).not.toHaveBeenCalled();
  });

  it('requires an application UUID before approving in Supabase mode', async () => {
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      eventApplications: [{ ...lifecycleApplication, supabaseId: undefined }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    const before = harness.getSnapshot();

    await expect(harness.service.approveEventApplication(1))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

    expect(harness.assignEventCrewRpc).not.toHaveBeenCalled();
    expect(harness.getSnapshot()).toEqual(before);
  });

  it('conditions a Supabase application update on the expected current status', async () => {
    const harness = await setupLifecycleService();

    await expect(harness.service.updateEventApplicationStatus(1, 'rejected', 'pending'))
      .resolves.toMatchObject({ status: 'rejected' });

    expect(harness.eventApplicationsUpdate).toHaveBeenCalledWith({ status: 'rejected' });
    expect(harness.eventApplicationsIdEq).toHaveBeenCalledWith('id', 'application-row-1');
    expect(harness.eventApplicationsExpectedStatusEq).toHaveBeenCalledWith('status', 'pending');
    expect(harness.eventApplicationsSelect).toHaveBeenCalledWith('*');
    expect(harness.getSnapshot().eventApplications[0].status).toBe('rejected');
  });

  it('reports a stable conflict and preserves state when a conditional Supabase update matches no row', async () => {
    const harness = await setupLifecycleService();
    const before = harness.getSnapshot();
    harness.eventApplicationsSelect.mockResolvedValueOnce({ data: [], error: null });

    await expect(harness.service.updateEventApplicationStatus(1, 'rejected', 'pending'))
      .rejects.toThrow('Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.');

    expect(harness.getSnapshot()).toEqual(before);
  });

  it('refuses a stale expected application status in the local fallback', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, supabaseId: undefined }],
      eventApplications: [{ ...lifecycleApplication, supabaseId: undefined, status: 'approved' }],
    });
    const harness = await setupLifecycleService({ dataSource: 'local', initialSnapshot });
    const before = harness.getSnapshot();

    await expect(harness.service.updateEventApplicationStatus(1, 'rejected', 'pending'))
      .rejects.toThrow('Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.');

    expect(harness.getSnapshot()).toEqual(before);
    expect(harness.eventApplicationsUpdate).not.toHaveBeenCalled();
  });

  it('withdraws a pending application with a conditional status update', async () => {
    const harness = await setupLifecycleService();

    await harness.service.withdrawEventApplication(1, 'profile-uuid-1');

    expect(harness.eventApplicationsUpdate).toHaveBeenCalledWith({ status: 'withdrawn' });
    expect(harness.eventApplicationsExpectedStatusEq).toHaveBeenCalledWith('status', 'pending');
  });

  it('maps a stale Crew re-application trigger rejection to the stable application conflict', async () => {
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      eventApplications: [{ ...lifecycleApplication, status: 'withdrawn' }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    const before = harness.getSnapshot();
    harness.eventApplicationsUpsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'crew_lifecycle_unauthorized' },
    });

    const error = await harness.service.applyForEvent(1, 'profile-uuid-1').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message)
      .toBe('Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.');
    expect((error as Error).message).not.toContain('crew_lifecycle_unauthorized');
    expect(harness.getSnapshot()).toEqual(before);
  });

  it('maps a stale Crew withdrawal-request trigger rejection to the stable withdrawal conflict', async () => {
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      timelogs: [canonicalTimelog],
      eventApplications: [{ ...lifecycleApplication, status: 'approved' }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    const before = harness.getSnapshot();
    harness.eventApplicationsUpsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'crew_lifecycle_unauthorized' },
    });

    const error = await harness.service.requestEventWithdrawal(1, 'profile-uuid-1').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message)
      .toBe('Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.');
    expect((error as Error).message).not.toContain('crew_lifecycle_unauthorized');
    expect(harness.getSnapshot()).toEqual(before);
  });

  it('reconciles a successful Crew re-application by stable UUID after a concurrent reindex', async () => {
    const upsertDeferred = createDeferred<{
      data: {
        id: string;
        event_id: string;
        profile_id: string;
        status: EventApplication['status'];
        note: null;
        planned_from: null;
        planned_to: null;
        created_at: string;
      };
      error: null;
    }>();
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      eventApplications: [{ ...lifecycleApplication, status: 'withdrawn' }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    harness.eventApplicationsUpsertSingle.mockReturnValueOnce(upsertDeferred.promise);

    const applicationPromise = harness.service.applyForEvent(1, 'profile-uuid-1');
    await vi.waitFor(() => expect(harness.eventApplicationsUpsertSingle).toHaveBeenCalledOnce());

    const otherEvent = { ...lifecycleEvent, id: 1, supabaseId: 'event-row-other', name: 'Other event' };
    const currentEvent = { ...lifecycleEvent, id: 2 };
    const otherApplication: EventApplication = {
      ...lifecycleApplication,
      id: 1,
      supabaseId: 'application-row-other',
      eventId: 1,
      eventSupabaseId: 'event-row-other',
      status: 'pending',
    };
    const currentApplication: EventApplication = {
      ...lifecycleApplication,
      id: 2,
      eventId: 2,
      status: 'withdrawn',
    };
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      events: [otherEvent, currentEvent],
      eventApplications: [otherApplication, currentApplication],
    }));
    upsertDeferred.resolve({
      data: {
        id: 'application-row-1',
        event_id: 'event-row-1',
        profile_id: 'profile-uuid-1',
        status: 'pending',
        note: null,
        planned_from: null,
        planned_to: null,
        created_at: '2026-04-10T08:00:00Z',
      },
      error: null,
    });

    await expect(applicationPromise).resolves.toMatchObject({
      id: 2,
      eventId: 2,
      supabaseId: 'application-row-1',
      eventSupabaseId: 'event-row-1',
      status: 'pending',
    });
    expect(harness.getSnapshot().eventApplications).toEqual([
      otherApplication,
      expect.objectContaining({
        id: 2,
        eventId: 2,
        supabaseId: 'application-row-1',
        eventSupabaseId: 'event-row-1',
        status: 'pending',
      }),
    ]);
  });

  it('reconciles a successful withdrawal request by stable UUID after a concurrent reindex', async () => {
    const upsertDeferred = createDeferred<{
      data: {
        id: string;
        event_id: string;
        profile_id: string;
        status: EventApplication['status'];
        note: null;
        planned_from: null;
        planned_to: null;
        created_at: string;
      };
      error: null;
    }>();
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      timelogs: [canonicalTimelog],
      eventApplications: [{ ...lifecycleApplication, status: 'approved' }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    harness.eventApplicationsUpsertSingle.mockReturnValueOnce(upsertDeferred.promise);

    const withdrawalPromise = harness.service.requestEventWithdrawal(1, 'profile-uuid-1');
    await vi.waitFor(() => expect(harness.eventApplicationsUpsertSingle).toHaveBeenCalledOnce());

    const otherEvent = { ...lifecycleEvent, id: 1, supabaseId: 'event-row-other', name: 'Other event' };
    const currentEvent = { ...lifecycleEvent, id: 2 };
    const otherApplication: EventApplication = {
      ...lifecycleApplication,
      id: 1,
      supabaseId: 'application-row-other',
      eventId: 1,
      eventSupabaseId: 'event-row-other',
      status: 'pending',
    };
    const currentApplication: EventApplication = {
      ...lifecycleApplication,
      id: 2,
      eventId: 2,
      status: 'approved',
    };
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      events: [otherEvent, currentEvent],
      timelogs: [{ ...canonicalTimelog, id: 2, eid: 2 }],
      eventApplications: [otherApplication, currentApplication],
    }));
    upsertDeferred.resolve({
      data: {
        id: 'application-row-1',
        event_id: 'event-row-1',
        profile_id: 'profile-uuid-1',
        status: 'withdrawal_requested',
        note: null,
        planned_from: null,
        planned_to: null,
        created_at: '2026-04-10T08:00:00Z',
      },
      error: null,
    });

    await expect(withdrawalPromise).resolves.toMatchObject({
      id: 2,
      eventId: 2,
      supabaseId: 'application-row-1',
      eventSupabaseId: 'event-row-1',
      status: 'withdrawal_requested',
    });
    expect(harness.getSnapshot().eventApplications).toEqual([
      otherApplication,
      expect.objectContaining({
        id: 2,
        eventId: 2,
        supabaseId: 'application-row-1',
        eventSupabaseId: 'event-row-1',
        status: 'withdrawal_requested',
      }),
    ]);
  });

  it('reconciles a conditional application update by stable UUID after a concurrent reindex', async () => {
    const updateDeferred = createDeferred<{
      data: Array<{
        id: string;
        event_id: string;
        profile_id: string;
        status: EventApplication['status'];
        note: null;
        planned_from: null;
        planned_to: null;
        created_at: string;
      }>;
      error: null;
    }>();
    const harness = await setupLifecycleService();
    harness.eventApplicationsSelect.mockReturnValueOnce(updateDeferred.promise);

    const updatePromise = harness.service.updateEventApplicationStatus(1, 'rejected', 'pending');
    await vi.waitFor(() => expect(harness.eventApplicationsUpdate).toHaveBeenCalledOnce());

    const otherEvent = { ...lifecycleEvent, id: 1, supabaseId: 'event-row-other', name: 'Other event' };
    const currentEvent = { ...lifecycleEvent, id: 2 };
    const otherApplication: EventApplication = {
      ...lifecycleApplication,
      id: 1,
      supabaseId: 'application-row-other',
      eventId: 1,
      eventSupabaseId: 'event-row-other',
    };
    const currentApplication: EventApplication = {
      ...lifecycleApplication,
      id: 2,
      eventId: 2,
    };
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      events: [otherEvent, currentEvent],
      eventApplications: [otherApplication, currentApplication],
    }));
    updateDeferred.resolve({
      data: [{
        id: 'application-row-1',
        event_id: 'event-row-1',
        profile_id: 'profile-uuid-1',
        status: 'rejected',
        note: null,
        planned_from: null,
        planned_to: null,
        created_at: '2026-04-10T08:00:00Z',
      }],
      error: null,
    });

    await expect(updatePromise).resolves.toMatchObject({
      id: 2,
      eventId: 2,
      supabaseId: 'application-row-1',
      status: 'rejected',
    });
    expect(harness.getSnapshot().eventApplications).toEqual([
      otherApplication,
      expect.objectContaining({
        id: 2,
        eventId: 2,
        supabaseId: 'application-row-1',
        status: 'rejected',
      }),
    ]);
  });

  it('does not let a fetch started before re-application restore the stale application status', async () => {
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      eventApplications: [{ ...lifecycleApplication, status: 'withdrawn' }],
    });
    const harness = await setupLifecycleService({
      initialSnapshot,
      deferredPublicEvents: [lifecycleEvent],
      refreshedApplicationStatus: 'withdrawn',
    });

    const staleFetch = harness.service.fetchEventsSnapshot();
    await vi.waitFor(() => expect(harness.eventsSelect).toHaveBeenCalledOnce());
    await expect(harness.service.applyForEvent(1, 'profile-uuid-1'))
      .resolves.toMatchObject({ status: 'pending' });
    harness.resolveDeferredPublicEvents();
    await staleFetch;

    expect(harness.getSnapshot().eventApplications).toEqual([
      expect.objectContaining({ supabaseId: 'application-row-1', status: 'pending' }),
    ]);
  });

  it.each([
    {
      label: 'trigger token',
      databaseError: { message: 'crew_lifecycle_unauthorized' },
      expectedMessage: 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.',
      expectsDiagnostic: false,
    },
    {
      label: 'unexpected database detail',
      databaseError: { message: 'new row violates row-level security policy' },
      expectedMessage: 'Operaci s Crew se nepodařilo dokončit.',
      expectsDiagnostic: true,
    },
  ])('keeps a conditional Crew withdrawal $label out of the UI error', async ({
    databaseError,
    expectedMessage,
    expectsDiagnostic,
  }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const harness = await setupLifecycleService();
      const before = harness.getSnapshot();
      harness.eventApplicationsSelect.mockResolvedValueOnce({ data: null, error: databaseError });

      const error = await harness.service.withdrawEventApplication(1, 'profile-uuid-1')
        .catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(expectedMessage);
      expect((error as Error).message).not.toContain(databaseError.message);
      expect(harness.getSnapshot()).toEqual(before);
      if (expectsDiagnostic) {
        expect(consoleError).toHaveBeenCalledWith(
          'Unexpected Crew application lifecycle mutation error',
          databaseError,
        );
      } else {
        expect(consoleError).not.toHaveBeenCalled();
      }
    } finally {
      consoleError.mockRestore();
    }
  });

  it('maps a malformed successful Crew application response to a diagnostic-only generic error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const initialSnapshot = createSnapshot({
        events: [lifecycleEvent],
        eventApplications: [{ ...lifecycleApplication, status: 'withdrawn' }],
      });
      const harness = await setupLifecycleService({ initialSnapshot });
      const before = harness.getSnapshot();
      harness.eventApplicationsUpsertSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(harness.service.applyForEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

      expect(consoleError).toHaveBeenCalledWith(
        'Unexpected Crew application lifecycle mutation response',
        null,
      );
      expect(harness.getSnapshot()).toEqual(before);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    {
      label: 're-application',
      initialSnapshot: createSnapshot({
        events: [{ ...lifecycleEvent, supabaseId: undefined }],
        eventApplications: [{
          ...lifecycleApplication,
          supabaseId: undefined,
          eventSupabaseId: undefined,
          status: 'withdrawn',
        }],
      }),
      run: (service: Awaited<ReturnType<typeof setupLifecycleService>>['service']) => (
        service.applyForEvent(1, 'profile-uuid-1')
      ),
    },
    {
      label: 'withdrawal request',
      initialSnapshot: createSnapshot({
        events: [{ ...lifecycleEvent, supabaseId: undefined }],
        timelogs: [{ ...canonicalTimelog, eventSupabaseId: undefined }],
        eventApplications: [{
          ...lifecycleApplication,
          supabaseId: undefined,
          eventSupabaseId: undefined,
          status: 'approved',
        }],
      }),
      run: (service: Awaited<ReturnType<typeof setupLifecycleService>>['service']) => (
        service.requestEventWithdrawal(1, 'profile-uuid-1')
      ),
    },
  ])('fails closed before a Crew $label without the event UUID', async ({ initialSnapshot, run }) => {
    const harness = await setupLifecycleService({ initialSnapshot });
    const before = harness.getSnapshot();

    await expect(run(harness.service))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

    expect(harness.eventApplicationsUpsertSingle).not.toHaveBeenCalled();
    expect(harness.getSnapshot()).toEqual(before);
  });

  it.each([
    {
      label: 'application',
      initialSnapshot: createSnapshot({
        events: [lifecycleEvent],
        eventApplications: [{ ...lifecycleApplication, status: 'withdrawn' }],
      }),
      run: (service: Awaited<ReturnType<typeof setupLifecycleService>>['service']) => (
        service.applyForEvent(1, 'profile-uuid-1')
      ),
    },
    {
      label: 'withdrawal request',
      initialSnapshot: createSnapshot({
        events: [lifecycleEvent],
        timelogs: [canonicalTimelog],
        eventApplications: [{ ...lifecycleApplication, status: 'approved' }],
      }),
      run: (service: Awaited<ReturnType<typeof setupLifecycleService>>['service']) => (
        service.requestEventWithdrawal(1, 'profile-uuid-1')
      ),
    },
  ])('keeps an unexpected Crew $label database error diagnostic-only', async ({ initialSnapshot, run }) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const harness = await setupLifecycleService({ initialSnapshot });
      const databaseError = { message: 'new row violates row-level security policy' };
      harness.eventApplicationsUpsertSingle.mockResolvedValueOnce({ data: null, error: databaseError });

      await expect(run(harness.service))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

      expect(consoleError).toHaveBeenCalledWith('Unexpected Crew application lifecycle mutation error', databaseError);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('hydrates the canonical timelog returned by repeated assignment', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, filled: 1 }],
      timelogs: [canonicalTimelog],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    harness.assignEventCrewRpc.mockResolvedValue({ ...rpcAssignment, timelog_created: false });

    const result = await harness.service.assignCrewToEvent(1, 'profile-uuid-1');
    const snapshot = harness.getSnapshot();

    expect(result.timelog.contractorProfileId).toBe('profile-uuid-1');
    expect(snapshot.timelogs.filter((item) => item.contractorProfileId === 'profile-uuid-1')).toHaveLength(1);
    expect(result.rpc).toEqual({ ...rpcAssignment, timelog_created: false });
  });

  it('selects the canonical refreshed timelog by the RPC UUID instead of the first local pair match', async () => {
    const candidates: Timelog[] = [
      { ...canonicalTimelog, id: 1, supabaseId: 'older-timelog-row' },
      { ...canonicalTimelog, id: 2, supabaseId: 'timelog-row-1' },
    ];
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, filled: 1 }],
      timelogs: candidates,
    });
    const harness = await setupLifecycleService({
      initialSnapshot,
      refreshedTimelogs: candidates,
    });

    const result = await harness.service.assignCrewToEvent(1, 'profile-uuid-1');

    expect(result.timelog.id).toBe(2);
    expect(result.timelog.supabaseId).toBe('timelog-row-1');
  });

  it.each([
    {
      label: 'RPC event',
      rpc: { ...rpcAssignment, event_id: 'other-event-row' },
      timelogs: [canonicalTimelog],
    },
    {
      label: 'RPC profile',
      rpc: { ...rpcAssignment, profile_id: 'other-profile' },
      timelogs: [canonicalTimelog],
    },
    {
      label: 'canonical timelog UUID',
      rpc: { ...rpcAssignment, timelog_id: 'missing-timelog-row' },
      timelogs: [canonicalTimelog],
    },
    {
      label: 'canonical timelog event UUID',
      rpc: rpcAssignment,
      timelogs: [{ ...canonicalTimelog, eventSupabaseId: 'other-event-row' }],
    },
    {
      label: 'canonical timelog profile UUID',
      rpc: rpcAssignment,
      timelogs: [{ ...canonicalTimelog, contractorProfileId: 'other-profile' }],
    },
  ])('rejects a mismatched $label after the assignment RPC commits', async ({ rpc, timelogs }) => {
    const initialSnapshot = createSnapshot({
      events: [lifecycleEvent],
      timelogs,
    });
    const harness = await setupLifecycleService({
      initialSnapshot,
      refreshedTimelogs: timelogs,
    });
    harness.assignEventCrewRpc.mockResolvedValue(rpc);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
      expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to validate refreshed Crew assignment lifecycle state',
        expect.objectContaining({
          requestedEventId: 'event-row-1',
          requestedProfileId: 'profile-uuid-1',
          rpcEventId: rpc.event_id,
          rpcProfileId: rpc.profile_id,
          rpcTimelogId: rpc.timelog_id,
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps the two-argument removal RPC for intentional direct removal', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, filled: 1 }],
      timelogs: [canonicalTimelog],
      eventApplications: [{ ...lifecycleApplication, status: 'withdrawal_requested' }],
    });
    const harness = await setupLifecycleService({
      initialSnapshot,
      refreshedTimelogs: [],
      refreshedApplicationStatus: 'withdrawn',
    });

    await harness.service.removeContractorFromEvent(1, 'profile-uuid-1');
    expect(harness.removeEventCrewRpc).toHaveBeenCalledOnce();
    expect(harness.removeEventCrewRpc).toHaveBeenCalledWith('event-row-1', 'profile-uuid-1');
    expect(harness.approveEventWithdrawalRpc).not.toHaveBeenCalled();
    expect(harness.eventApplicationsUpdate).not.toHaveBeenCalled();
    expect(harness.directWrites.timelogsDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.timelogDaysDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.eventAssignmentsDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.eventsUpdate).not.toHaveBeenCalled();
  });

  it('approves a withdrawal through the dedicated application-scoped RPC', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, filled: 1 }],
      timelogs: [canonicalTimelog],
      eventApplications: [{ ...lifecycleApplication, status: 'withdrawal_requested' }],
    });
    const harness = await setupLifecycleService({
      initialSnapshot,
      refreshedTimelogs: [],
      refreshedApplicationStatus: 'withdrawn',
    });

    await harness.service.approveEventWithdrawal(1);

    expect(harness.approveEventWithdrawalRpc).toHaveBeenCalledWith(
      'event-row-1',
      'profile-uuid-1',
      'application-row-1',
    );
    expect(harness.removeEventCrewRpc).not.toHaveBeenCalled();
    expect(harness.eventApplicationsUpdate).not.toHaveBeenCalled();
    expect(harness.directWrites.timelogsDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.timelogDaysDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.eventAssignmentsDelete).not.toHaveBeenCalled();
    expect(harness.directWrites.eventsUpdate).not.toHaveBeenCalled();
  });

  it('requires stable application and event UUIDs before approving a Supabase withdrawal', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, supabaseId: undefined, filled: 1 }],
      timelogs: [canonicalTimelog],
      eventApplications: [{
        ...lifecycleApplication,
        supabaseId: undefined,
        eventSupabaseId: undefined,
        status: 'withdrawal_requested',
      }],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    const before = harness.getSnapshot();

    await expect(harness.service.approveEventWithdrawal(1))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

    expect(harness.approveEventWithdrawalRpc).not.toHaveBeenCalled();
    expect(harness.removeEventCrewRpc).not.toHaveBeenCalled();
    expect(harness.getSnapshot()).toEqual(before);
  });

  it('keeps local state unchanged when removal is blocked', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, filled: 1 }],
      timelogs: [canonicalTimelog],
    });
    const harness = await setupLifecycleService({ initialSnapshot });
    harness.removeEventCrewRpc.mockRejectedValue(
      new Error('Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.'),
    );
    const before = harness.getSnapshot();

    await expect(harness.service.removeContractorFromEvent(1, 'profile-uuid-1'))
      .rejects.toThrow('Crew nelze odebrat');

    expect(harness.getSnapshot()).toEqual(before);
  });

  it('authoritatively recovers lifecycle state when an assignment RPC commits but its response is lost', async () => {
    const staleEvent = { ...lifecycleEvent, name: 'Stale event before assignment' };
    const freshEvent = { ...lifecycleEvent, name: 'Authoritative assigned event', filled: 1 };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({ events: [staleEvent], timelogs: [] }),
      refreshedEvents: [freshEvent],
      refreshedTimelogs: [canonicalTimelog],
    });
    harness.assignEventCrewRpc.mockRejectedValueOnce(new Error('connection lost after commit'));

    await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1')).rejects.toThrow();

    expect(harness.getSnapshot().events).toEqual([freshEvent]);
    expect(harness.getSnapshot().timelogs).toEqual([canonicalTimelog]);
    expect(harness.setQueryData).toHaveBeenCalledWith(['events'], [freshEvent]);
    expect(harness.setQueryData).toHaveBeenCalledWith(['timelogs'], [canonicalTimelog]);

    await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1')).resolves.toEqual(
      expect.objectContaining({ timelog: expect.objectContaining({ supabaseId: 'timelog-row-1' }) }),
    );
    expect(harness.assignEventCrewRpc).toHaveBeenCalledTimes(2);
  });

  it('authoritatively recovers removal state when the Crew removal response is lost', async () => {
    const removedEvent = { ...lifecycleEvent, filled: 0 };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({
        events: [{ ...lifecycleEvent, filled: 1 }],
        timelogs: [canonicalTimelog],
        eventApplications: [lifecycleApplication],
      }),
      refreshedEvents: [removedEvent],
      refreshedTimelogs: [],
      refreshedApplicationStatus: 'withdrawn',
    });
    harness.removeEventCrewRpc.mockRejectedValueOnce(new Error('connection lost after removal commit'));

    await expect(harness.service.removeContractorFromEvent(1, 'profile-uuid-1')).rejects.toThrow();

    expect(harness.getSnapshot().events).toEqual([removedEvent]);
    expect(harness.getSnapshot().timelogs).toEqual([]);
    expect(harness.getSnapshot().eventApplications[0].status).toBe('withdrawn');
  });

  it('authoritatively recovers withdrawal approval when its RPC response is lost', async () => {
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({
        events: [{ ...lifecycleEvent, filled: 1 }],
        timelogs: [canonicalTimelog],
        eventApplications: [{ ...lifecycleApplication, status: 'withdrawal_requested' }],
      }),
      refreshedEvents: [{ ...lifecycleEvent, filled: 0 }],
      refreshedTimelogs: [],
      refreshedApplicationStatus: 'withdrawn',
    });
    harness.approveEventWithdrawalRpc.mockRejectedValueOnce(
      new Error('connection lost after withdrawal approval commit'),
    );

    await expect(harness.service.approveEventWithdrawal(1)).rejects.toThrow();

    expect(harness.getSnapshot().timelogs).toEqual([]);
    expect(harness.getSnapshot().eventApplications[0]).toMatchObject({
      supabaseId: 'application-row-1',
      status: 'withdrawn',
    });
  });

  it('preserves a stable removal domain error when authoritative recovery also fails', async () => {
    const stableError = new Error('Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.');
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({
        events: [{ ...lifecycleEvent, filled: 1 }],
        timelogs: [canonicalTimelog],
      }),
    });
    harness.removeEventCrewRpc.mockRejectedValueOnce(stableError);
    harness.loadTimelogsSnapshot.mockRejectedValueOnce(new Error('authoritative recovery unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(harness.service.removeContractorFromEvent(1, 'profile-uuid-1'))
        .rejects.toBe(stableError);
      expect(harness.updateLocalAppState).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        'Authoritative Crew lifecycle recovery failed after mutation error',
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries an authoritative lifecycle recovery after the first post-RPC refresh fails', async () => {
    const freshEvent = { ...lifecycleEvent, name: 'Recovered assigned event', filled: 1 };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({ events: [lifecycleEvent], timelogs: [] }),
      refreshedEvents: [freshEvent],
      refreshedTimelogs: [canonicalTimelog],
    });
    harness.loadTimelogsSnapshot.mockReset();
    harness.loadTimelogsSnapshot
      .mockRejectedValueOnce(new Error('first post-RPC refresh failed'))
      .mockResolvedValueOnce([canonicalTimelog]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

      expect(harness.loadTimelogsSnapshot).toHaveBeenCalledTimes(2);
      expect(harness.getSnapshot().events).toEqual([freshEvent]);
      expect(harness.getSnapshot().timelogs).toEqual([canonicalTimelog]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('authoritatively removes event, timelog, and receipt slices when a delete response is lost', async () => {
    const receipt: ReceiptItem = {
      id: 1,
      supabaseId: 'receipt-row-1',
      eventSupabaseId: 'event-row-1',
      updatedAt: '2026-04-20T10:00:00Z',
      contractorProfileId: 'profile-uuid-1',
      eid: 1,
      job: 'AK001',
      title: 'Receipt',
      vendor: 'Vendor',
      amount: 100,
      paidAt: '2026-04-20',
      note: '',
      status: 'draft',
    };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({
        events: [lifecycleEvent],
        timelogs: [canonicalTimelog],
        receipts: [receipt],
        eventApplications: [],
      }),
      refreshedEvents: [],
      refreshedTimelogs: [],
      refreshedReceipts: [],
    });
    harness.deleteEventAtomicRpc.mockRejectedValueOnce(new Error('connection lost after event delete commit'));

    await expect(harness.service.deleteEvent('event-row-1')).rejects.toThrow();

    expect(harness.getSnapshot()).toMatchObject({ events: [], timelogs: [], receipts: [] });
    expect(harness.fetchReceiptsSnapshot).toHaveBeenCalledOnce();
    expect(harness.setQueryData).toHaveBeenCalledWith(['events'], []);
    expect(harness.setQueryData).toHaveBeenCalledWith(['timelogs'], []);
    expect(harness.setQueryData).toHaveBeenCalledWith(['receipts'], []);
  });

  it('prevents an older event fetch from restoring a successfully deleted event', async () => {
    const staleEvent = { ...lifecycleEvent, name: 'Stale event fetch' };
    const harness = await setupLifecycleService({
      initialSnapshot: createSnapshot({ events: [lifecycleEvent], eventApplications: [] }),
      deferredPublicEvents: [staleEvent],
    });

    const staleFetch = harness.service.fetchEventsSnapshot();
    await vi.waitFor(() => expect(harness.eventsSelect).toHaveBeenCalledOnce());

    await expect(harness.service.deleteEvent('event-row-1')).resolves.toEqual({ id: 'event-row-1' });
    expect(harness.loadTimelogsSnapshot).not.toHaveBeenCalled();
    expect(harness.fetchReceiptsSnapshot).not.toHaveBeenCalled();

    harness.resolveDeferredPublicEvents();
    await expect(staleFetch).resolves.toEqual([]);
    expect(harness.getSnapshot().events).toEqual([]);
  });

  it('leaves state and query cache untouched when the event lifecycle load fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await setupLifecycleService({ failEventsRefresh: true });
    const before = harness.getSnapshot();

    try {
      await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

      expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to refresh Crew lifecycle state',
        expect.any(Error),
      );
      expect(harness.getSnapshot()).toEqual(before);
      expect(harness.updateLocalAppState).not.toHaveBeenCalled();
      expect(harness.setQueryData).not.toHaveBeenCalled();
      expect(harness.invalidateQueries).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('leaves state and query cache untouched when the pure timelog lifecycle load fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await setupLifecycleService({
      refreshedEvents: [{
        ...lifecycleEvent,
        name: 'Authoritative refreshed event',
        filled: 2,
      }],
      refreshedApplicationStatus: 'withdrawn',
      failTimelogsRefresh: true,
    });
    const before = harness.getSnapshot();

    try {
      await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

      expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to refresh Crew lifecycle state',
        expect.any(Error),
      );
      expect(harness.getSnapshot()).toEqual(before);
      expect(harness.updateLocalAppState).not.toHaveBeenCalled();
      expect(harness.setQueryData).not.toHaveBeenCalled();
      expect(harness.invalidateQueries).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('commits staged event and timelog lifecycle slices in one state update before syncing queries', async () => {
    const harness = await setupLifecycleService();

    const result = await harness.service.assignCrewToEvent(1, 'profile-uuid-1');
    const snapshot = harness.getSnapshot();

    expect(harness.updateLocalAppState).toHaveBeenCalledOnce();
    expect(snapshot.events[0].supabaseId).toBe('event-row-1');
    expect(snapshot.timelogs).toEqual([canonicalTimelog]);
    expect(result.timelog.supabaseId).toBe('timelog-row-1');
    expect(harness.setQueryData).toHaveBeenCalledWith(['events'], snapshot.events);
    expect(harness.setQueryData).toHaveBeenCalledWith(['timelogs'], snapshot.timelogs);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
    expect(harness.updateLocalAppState.mock.invocationCallOrder[0])
      .toBeLessThan(harness.setQueryData.mock.invocationCallOrder[0]);
    expect(harness.eventsOrder.mock.calls).toEqual([
      ['date_from'],
      ['name'],
      ['id'],
    ]);
  });

  it('does not let an older public event fetch overwrite a newer lifecycle commit or query cache', async () => {
    const staleEvent = { ...lifecycleEvent, name: 'Stale event' };
    const freshEvent = { ...lifecycleEvent, name: 'Fresh event' };
    const harness = await setupLifecycleService({
      refreshedEvents: [freshEvent],
      deferredPublicEvents: [staleEvent],
    });

    const staleFetch = harness.service.fetchEventsSnapshot();
    await vi.waitFor(() => expect(harness.eventsSelect).toHaveBeenCalledOnce());

    await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1')).resolves.toEqual(
      expect.objectContaining({ event: expect.objectContaining({ name: 'Fresh event' }) }),
    );
    harness.resolveDeferredPublicEvents();

    await expect(staleFetch).resolves.toEqual([
      expect.objectContaining({ name: 'Fresh event', supabaseId: 'event-row-1' }),
    ]);
    expect(harness.getSnapshot().events).toEqual([
      expect.objectContaining({ name: 'Fresh event', supabaseId: 'event-row-1' }),
    ]);
    expect(harness.updateLocalAppState).toHaveBeenCalledOnce();
    expect(harness.setQueryData).toHaveBeenLastCalledWith(
      ['receipts'],
      harness.getSnapshot().receipts,
    );
    expect(harness.setQueryData).toHaveBeenCalledWith(['events'], harness.getSnapshot().events);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
  });

  it('does not advance lifecycle generation on refresh failure and leaves ordinary fetches usable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = await setupLifecycleService({ failTimelogsRefresh: true });
    const { getLifecycleSnapshotGeneration } = await import('../../event-lifecycle-generation');
    const before = getLifecycleSnapshotGeneration();

    try {
      await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
        .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');
      expect(getLifecycleSnapshotGeneration()).toBe(before);

      await expect(harness.service.fetchEventsSnapshot()).resolves.toEqual([
        expect.objectContaining({ supabaseId: 'event-row-1' }),
      ]);
      expect(harness.updateLocalAppState).toHaveBeenCalledOnce();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('preserves unrelated state changed while pure lifecycle reads are in flight', async () => {
    const deferredTimelogs = createDeferred<Timelog[]>();
    const harness = await setupLifecycleService();
    harness.loadTimelogsSnapshot.mockImplementationOnce(() => deferredTimelogs.promise);
    const interveningReceipt: ReceiptItem = {
      id: 99,
      eid: 1,
      job: 'AK001',
      title: 'Concurrent receipt',
      vendor: 'Vendor',
      amount: 125,
      paidAt: '2026-04-20',
      note: '',
      status: 'submitted',
    };

    const assignmentPromise = harness.service.assignCrewToEvent(1, 'profile-uuid-1');
    await vi.waitFor(() => {
      expect(harness.loadTimelogsSnapshot).toHaveBeenCalledOnce();
    });
    harness.setSnapshot((snapshot) => ({
      ...snapshot,
      receipts: [interveningReceipt],
      contractors: snapshot.contractors.map((contractor) => ({
        ...contractor,
        note: 'Concurrent contractor edit',
      })),
    }));
    deferredTimelogs.resolve([canonicalTimelog]);

    await expect(assignmentPromise).resolves.toEqual(expect.objectContaining({
      timelog: expect.objectContaining({ supabaseId: 'timelog-row-1' }),
    }));
    expect(harness.getSnapshot().receipts).toEqual([interveningReceipt]);
    expect(harness.getSnapshot().contractors[0].note).toBe('Concurrent contractor edit');
  });

  it('serializes whole overlapping lifecycle mutations and continues after the first refresh fails', async () => {
    const firstTimelogLoad = createDeferred<Timelog[]>();
    const harness = await setupLifecycleService();
    harness.loadTimelogsSnapshot.mockReset();
    harness.loadTimelogsSnapshot
      .mockImplementationOnce(() => firstTimelogLoad.promise)
      .mockResolvedValueOnce([canonicalTimelog]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const firstAssignment = harness.service.assignCrewToEvent(1, 'profile-uuid-1')
        .then(() => null, (error: unknown) => error);
      const secondAssignment = harness.service.assignCrewToEvent(1, 'profile-uuid-1');

      await vi.waitFor(() => {
        expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
        expect(harness.loadTimelogsSnapshot).toHaveBeenCalledOnce();
      });

      firstTimelogLoad.reject(new Error('first staged timelog load failed'));
      await expect(firstAssignment).resolves.toEqual(expect.objectContaining({
        message: 'Operaci s Crew se nepodařilo dokončit.',
      }));
      await vi.waitFor(() => expect(harness.assignEventCrewRpc).toHaveBeenCalledTimes(2));
      await expect(secondAssignment).resolves.toEqual(expect.objectContaining({
        timelog: expect.objectContaining({ supabaseId: 'timelog-row-1' }),
      }));

      expect(harness.loadTimelogsSnapshot).toHaveBeenCalledTimes(3);
      expect(harness.updateLocalAppState).toHaveBeenCalledTimes(2);
      expect(harness.getSnapshot().timelogs).toEqual([canonicalTimelog]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    ['event', [], [canonicalTimelog]],
    ['canonical timelog', [lifecycleEvent], []],
  ])('throws the generic lifecycle error when the refreshed %s is missing', async (_label, refreshedEvents, refreshedTimelogs) => {
    const harness = await setupLifecycleService({ refreshedEvents, refreshedTimelogs });

    await expect(harness.service.assignCrewToEvent(1, 'profile-uuid-1'))
      .rejects.toThrow('Operaci s Crew se nepodařilo dokončit.');

    expect(harness.assignEventCrewRpc).toHaveBeenCalledOnce();
    expect(harness.getSnapshot().timelogs).toEqual(refreshedTimelogs);
  });

  it('blocks local removal when any matching timelog is non-disposable without changing state', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, supabaseId: undefined, filled: 1 }],
      timelogs: [
        canonicalTimelog,
        { ...canonicalTimelog, id: 2, status: 'pending_ch' },
      ],
      eventApplications: [{ ...lifecycleApplication, supabaseId: undefined, status: 'withdrawal_requested' }],
    });
    const harness = await setupLifecycleService({ dataSource: 'local', initialSnapshot });
    const before = harness.getSnapshot();

    await expect(harness.service.removeContractorFromEvent(1, 'profile-uuid-1'))
      .rejects.toThrow('Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.');

    expect(harness.getSnapshot()).toEqual(before);
    expect(harness.removeEventCrewRpc).not.toHaveBeenCalled();
  });

  it('atomically removes all local disposable timelogs and related lifecycle state', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, supabaseId: undefined, filled: 2 }],
      timelogs: [
        canonicalTimelog,
        { ...canonicalTimelog, id: 2, status: 'rejected' },
        { ...canonicalTimelog, id: 3, contractorProfileId: 'profile-uuid-2' },
      ],
      eventApplications: [{ ...lifecycleApplication, supabaseId: undefined, status: 'withdrawal_requested' }],
      eventCrewAssignments: [
        { eventId: 1, contractorProfileId: 'profile-uuid-1', name: 'Test User' },
        { eventId: 1, contractorProfileId: 'profile-uuid-1', name: 'Test User duplicate' },
        { eventId: 1, contractorProfileId: 'profile-uuid-2', name: 'Other User' },
      ],
    });
    const harness = await setupLifecycleService({ dataSource: 'local', initialSnapshot });

    const result = await harness.service.removeContractorFromEvent(1, 'profile-uuid-1');
    const snapshot = harness.getSnapshot();

    expect(snapshot.timelogs.map((timelog) => timelog.contractorProfileId)).toEqual(['profile-uuid-2']);
    expect(snapshot.eventCrewAssignments.map((assignment) => assignment.contractorProfileId)).toEqual(['profile-uuid-2']);
    expect(snapshot.eventApplications[0].status).toBe('withdrawn');
    expect(snapshot.events[0].filled).toBe(1);
    expect(result.event.filled).toBe(1);
    expect(harness.removeEventCrewRpc).not.toHaveBeenCalled();
  });

  it('keeps local approval and withdrawal lifecycle functional without RPC calls', async () => {
    const initialSnapshot = createSnapshot({
      events: [{ ...lifecycleEvent, supabaseId: undefined }],
      eventApplications: [{ ...lifecycleApplication, supabaseId: undefined }],
    });
    const harness = await setupLifecycleService({ dataSource: 'local', initialSnapshot });

    await harness.service.approveEventApplication(1);
    expect(harness.getSnapshot().eventApplications[0].status).toBe('approved');
    expect(harness.getSnapshot().timelogs).toHaveLength(1);

    await harness.service.requestEventWithdrawal(1, 'profile-uuid-1');
    expect(harness.getSnapshot().eventApplications[0].status).toBe('withdrawal_requested');

    await harness.service.approveEventWithdrawal(1);
    expect(harness.getSnapshot().eventApplications[0].status).toBe('withdrawn');
    expect(harness.getSnapshot().timelogs).toHaveLength(0);
    expect(harness.assignEventCrewRpc).not.toHaveBeenCalled();
    expect(harness.removeEventCrewRpc).not.toHaveBeenCalled();
  });

  it('deletes the exact Supabase event UUID through one atomic RPC when local event ids collide', async () => {
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
      timelogs: [
        { ...canonicalTimelog, id: 1, eid: 1, eventSupabaseId: 'event-uuid-1' },
        { ...canonicalTimelog, id: 2, eid: 1, eventSupabaseId: 'event-uuid-2', supabaseId: 'timelog-row-2' },
      ],
      receipts: [
        {
          id: 1, supabaseId: 'receipt-row-1', eventSupabaseId: 'event-uuid-1',
          updatedAt: '2026-04-20T10:00:00Z', contractorProfileId: 'profile-uuid-1',
          eid: 1, job: 'AK001', title: 'Receipt 1', vendor: 'Vendor', amount: 100,
          paidAt: '2026-04-20', note: '', status: 'draft',
        },
        {
          id: 2, supabaseId: 'receipt-row-2', eventSupabaseId: 'event-uuid-2',
          updatedAt: '2026-04-20T10:00:00Z', contractorProfileId: 'profile-uuid-1',
          eid: 1, job: 'AK001', title: 'Receipt 2', vendor: 'Vendor', amount: 200,
          paidAt: '2026-04-20', note: '', status: 'draft',
        },
      ],
    });

    const from = vi.fn(() => {
      throw new Error('Atomic event deletion must not issue direct table mutations');
    });
    const deferredDelete = createDeferred<{
      data: Array<{ event_id: string }>;
      error: null;
    }>();
    const rpc = vi.fn(() => deferredDelete.promise);

    vi.doMock('../../../lib/app-config', () => ({
      appDataSource: 'supabase',
    }));

    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: {
        from,
        rpc,
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
    vi.doUnmock('./event-mutation-rpc.service');

    const { deleteEvent } = await import('./events.service');
    const { runLifecycleDataMutation } = await import('../../event-lifecycle-generation');

    const deletion = deleteEvent('event-uuid-1');
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    const competingMutation = vi.fn().mockResolvedValue(undefined);
    const competing = runLifecycleDataMutation(['timelog:while-event-delete'], competingMutation);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(competingMutation).not.toHaveBeenCalled();

    deferredDelete.resolve({ data: [{ event_id: 'event-uuid-1' }], error: null });
    await deletion;
    await competing;

    expect(rpc).toHaveBeenCalledWith('delete_event_atomic', { p_event_id: 'event-uuid-1' });
    expect(competingMutation).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0].supabaseId).toBe('event-uuid-2');
    expect(snapshot.timelogs.map((row) => row.eventSupabaseId)).toEqual(['event-uuid-2']);
    expect(snapshot.receipts.map((row) => row.eventSupabaseId)).toEqual(['event-uuid-2']);
  });

  it('does not expose raw database details when deleting a Supabase event fails', async () => {
    let snapshot = createSnapshot({
      events: [{
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
      }],
      timelogs: [],
      receipts: [],
    });
    const databaseError = {
      code: '23503',
      message: 'update or delete on table "events" violates foreign key constraint internal_event_fk',
      details: 'Sensitive internal relationship detail',
    };
    const from = vi.fn(() => {
      throw new Error('Atomic event deletion must not issue direct table mutations');
    });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: databaseError });

    vi.doMock('../../../lib/app-config', () => ({ appDataSource: 'supabase' }));
    vi.doMock('../../../lib/supabase', () => ({
      isSupabaseConfigured: true,
      supabase: { from, rpc },
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
    vi.doUnmock('./event-mutation-rpc.service');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const { deleteEvent } = await import('./events.service');

      await expect(deleteEvent('event-uuid-1')).rejects.toThrow('Akci se nepodařilo smazat.');
      expect(consoleError).toHaveBeenCalledWith('Unexpected atomic event delete RPC error', databaseError);
      expect(from).toHaveBeenCalled();
      expect(snapshot.events).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});

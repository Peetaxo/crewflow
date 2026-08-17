import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapClient, mapEvent } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { getDatesBetween, getEventStatus } from '../../../utils';
import { Client, Contractor, Event, EventApplication, EventApplicationStatus, EventCrewAssignment, EventPhaseSlot, GrasonEventConfirmation, Project, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { advanceLifecycleSnapshotGeneration, getLifecycleSnapshotGeneration } from '../../event-lifecycle-generation';
import { EventAssignmentResult, EventConflictDetail, EventFilter, EventWithDerivedStatus } from '../types/events.types';
import { approveEventWithdrawalRpc, assignEventCrewRpc, isDisposableTimelogStatus, removeEventCrewRpc } from './event-assignment-lifecycle.service';

const DEFAULT_TIME_FROM = '08:00';
const DEFAULT_TIME_TO = '17:00';
const CREW_LIFECYCLE_ERROR_MESSAGE = 'Operaci s Crew se nepodařilo dokončit.';
const EVENT_SAVE_ERROR_MESSAGE = 'Akci se nepodařilo uložit.';
const EVENT_DELETE_ERROR_MESSAGE = 'Akci se nepodařilo smazat.';
const EVENT_APPLICATION_STATUS_CONFLICT_MESSAGE = 'Stav přihlášky se mezitím změnil. Obnovte detail akce a zkuste to znovu.';
const EVENT_WITHDRAWAL_STATUS_CONFLICT_MESSAGE = 'Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.';
const ASSIGNMENT_LIFECYCLE_VALIDATION_DIAGNOSTIC = 'Failed to validate refreshed Crew assignment lifecycle state';
const EVENT_PHASE_TYPES: TimelogType[] = ['instal', 'provoz', 'deinstal'];
type TimelogAssignmentRow = { event_id: string | null; contractor_id: string | null };
type EventAssignmentRow = { event_id: string | null; profile_id: string | null; assigned_at?: string | null };
type EventApplicationRow = {
  id: string;
  event_id: string;
  profile_id: string;
  status: EventApplicationStatus;
  note: string | null;
  planned_from: string | null;
  planned_to: string | null;
  created_at: string;
};
type EventCrewAssignmentRow = {
  event_id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
};
type EventIdentifier = number | string;
type GrasonEventConfirmationRow = {
  id: string;
  source_month: string | null;
  source_key: string | null;
  event_id: string | null;
  profile_id: string | null;
  shift_date: string | null;
  source_title: string | null;
  event_name: string | null;
  job_number: string | null;
  phase: string | null;
  confirmed_name: string | null;
  source_occurrence_count: number | null;
  raw_payload: Record<string, unknown> | null;
  imported_at: string | null;
  updated_at: string | null;
};
type SupabaseGrasonResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};
type SupabaseGrasonClient = {
  from: (table: 'grason_event_confirmations') => {
    select: (columns: string) => {
      order: (column: string) => Promise<SupabaseGrasonResult>;
    };
  };
};
type EventLifecycleSnapshot = {
  events: Event[];
  eventApplications: EventApplication[];
  eventCrewAssignments: EventCrewAssignment[];
  grasonEventConfirmations: GrasonEventConfirmation[];
  eventRowIdByLocalId: Map<number, string>;
};

const isEventApplicationRow = (value: unknown): value is EventApplicationRow => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.event_id === 'string'
    && typeof row.profile_id === 'string'
    && ['pending', 'approved', 'rejected', 'withdrawn', 'withdrawal_requested'].includes(String(row.status))
    && (row.note === null || typeof row.note === 'string')
    && (row.planned_from === null || typeof row.planned_from === 'string')
    && (row.planned_to === null || typeof row.planned_to === 'string')
    && typeof row.created_at === 'string';
};

const toCrewApplicationLifecycleMutationError = (error: unknown, conflictMessage: string): Error => {
  const rawMessage = typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : '';

  if (/(^|[^A-Za-z0-9_])crew_lifecycle_unauthorized($|[^A-Za-z0-9_])/.test(rawMessage)) {
    return new Error(conflictMessage);
  }

  console.error('Unexpected Crew application lifecycle mutation error', error);
  return new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
};

const requireEventApplicationMutationRow = (
  value: unknown,
  expectedEventId: string,
  expectedProfileId: string,
  expectedStatus: EventApplicationStatus,
): EventApplicationRow => {
  if (
    !isEventApplicationRow(value)
    || value.event_id !== expectedEventId
    || value.profile_id !== expectedProfileId
    || value.status !== expectedStatus
  ) {
    console.error('Unexpected Crew application lifecycle mutation response', value);
    throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
  }

  return value;
};

const mapEventApplicationMutationRow = (
  row: EventApplicationRow,
  fallback: EventApplication,
): EventApplication => ({
  ...fallback,
  supabaseId: row.id,
  eventSupabaseId: row.event_id,
  contractorProfileId: row.profile_id,
  status: row.status,
  note: row.note ?? '',
  plannedFrom: row.planned_from ?? null,
  plannedTo: row.planned_to ?? null,
  createdAt: row.created_at,
});

const reconcilePersistedEventApplication = (
  applications: EventApplication[],
  events: Event[],
  persistedApplication: EventApplication,
): { applications: EventApplication[]; application: EventApplication } => {
  const currentEvent = persistedApplication.eventSupabaseId
    ? events.find((event) => event.supabaseId === persistedApplication.eventSupabaseId)
    : undefined;
  const matchesStableApplicationId = (application: EventApplication) => (
    Boolean(persistedApplication.supabaseId)
    && application.supabaseId === persistedApplication.supabaseId
  );
  const matchesStableEventProfile = (application: EventApplication) => (
    application.contractorProfileId === persistedApplication.contractorProfileId
    && (
      application.eventSupabaseId === persistedApplication.eventSupabaseId
      || (
        !application.eventSupabaseId
        && currentEvent !== undefined
        && application.eventId === currentEvent.id
      )
    )
  );
  const matchesPersistedApplication = (application: EventApplication) => (
    matchesStableApplicationId(application) || matchesStableEventProfile(application)
  );
  const currentApplication = applications.find(matchesStableApplicationId)
    ?? applications.find(matchesStableEventProfile);
  const canonicalApplication = {
    ...persistedApplication,
    id: currentApplication?.id
      ?? Math.max(0, ...applications.map((application) => application.id)) + 1,
    eventId: currentEvent?.id ?? currentApplication?.eventId ?? persistedApplication.eventId,
  };
  let inserted = false;
  const reconciledApplications = applications.flatMap((application) => {
    if (!matchesPersistedApplication(application)) return [application];
    if (inserted) return [];
    inserted = true;
    return [canonicalApplication];
  });

  if (!inserted) {
    reconciledApplications.push(canonicalApplication);
  }

  return { applications: reconciledApplications, application: canonicalApplication };
};

const throwAssignmentLifecycleValidationError = ({
  requestedEventId,
  requestedProfileId,
  rpc,
  refreshedEvent,
  refreshedTimelog,
}: {
  requestedEventId: string;
  requestedProfileId: string;
  rpc: Awaited<ReturnType<typeof assignEventCrewRpc>>;
  refreshedEvent?: Event;
  refreshedTimelog?: Timelog;
}): never => {
  console.error(ASSIGNMENT_LIFECYCLE_VALIDATION_DIAGNOSTIC, {
    requestedEventId,
    requestedProfileId,
    rpcEventId: rpc.event_id,
    rpcProfileId: rpc.profile_id,
    rpcTimelogId: rpc.timelog_id,
    refreshedEventId: refreshedEvent?.supabaseId ?? null,
    refreshedTimelogId: refreshedTimelog?.supabaseId ?? null,
    refreshedTimelogEventId: refreshedTimelog?.eventSupabaseId ?? null,
    refreshedTimelogProfileId: refreshedTimelog?.contractorProfileId ?? null,
  });
  throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
};

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const addDaysToDateKey = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};

const getDaysBetweenDateKeys = (from: string, to: string): number => {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
};

const shiftDateRecordKeys = <T,>(record: Record<string, T> | undefined, days: number): Record<string, T> | undefined => {
  if (!record) return undefined;

  return Object.fromEntries(
    Object.entries(record).map(([date, value]) => [addDaysToDateKey(date, days), value]),
  );
};

const shiftPhaseSchedules = (
  schedules: Event['phaseSchedules'],
  days: number,
): Event['phaseSchedules'] => {
  if (!schedules) return undefined;

  return Object.fromEntries(
    Object.entries(schedules).map(([phaseType, slots]) => [
      phaseType,
      (slots ?? []).map((slot) => ({
        ...slot,
        id: createSlotId(),
        dates: slot.dates.map((date) => addDaysToDateKey(date, days)),
      })),
    ]),
  ) as Event['phaseSchedules'];
};

let eventsHydrationPromise: Promise<void> | null = null;
let eventsLoaded = false;
let eventLifecycleRefreshQueue: Promise<void> = Promise.resolve();
const eventRowIdByLocalId = new Map<number, string>();

const assignmentMatchesEvent = (assignment: EventCrewAssignment, event: Event): boolean => (
  assignment.eventId === event.id
  || Boolean(event.supabaseId && assignment.eventSupabaseId === event.supabaseId)
);

const getAssignedProfileIdsForEvent = (
  event: Event,
  timelogs: Timelog[] = [],
  eventCrewAssignments: EventCrewAssignment[] = [],
): Set<string> => {
  const assignedProfileIds = new Set<string>();

  timelogs
    .filter((timelog) => timelog.eid === event.id && timelog.contractorProfileId)
    .forEach((timelog) => assignedProfileIds.add(timelog.contractorProfileId as string));

  eventCrewAssignments
    .filter((assignment) => assignmentMatchesEvent(assignment, event))
    .forEach((assignment) => assignedProfileIds.add(assignment.contractorProfileId));

  return assignedProfileIds;
};

const countAssignedCrewForEvent = (
  timelogs: Timelog[],
  eventId: number,
  eventCrewAssignments: EventCrewAssignment[] = [],
  eventOverride?: Event,
): number => {
  const event = eventOverride ?? (getLocalAppState().events ?? []).find((item) => item.id === eventId);
  if (!event) {
    return new Set(
      timelogs
        .filter((timelog) => timelog.eid === eventId && timelog.contractorProfileId)
        .map((timelog) => timelog.contractorProfileId as string),
    ).size;
  }

  return getAssignedProfileIdsForEvent(event, timelogs, eventCrewAssignments).size;
};

const normalizeGrasonMatchText = (value: string | null | undefined): string => (
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
);

const normalizeGrasonJobNumber = (value: string | null | undefined): string => (
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim()
);

const matchesEventIdentifier = (event: Event, eventId: EventIdentifier): boolean => (
  typeof eventId === 'string'
    ? event.supabaseId === eventId
    : event.id === eventId
);

export const getGrasonConfirmationsForEvent = (
  event: Event,
  confirmations: GrasonEventConfirmation[] = [],
): GrasonEventConfirmation[] => {
  const eventJobNumber = normalizeGrasonJobNumber(event.job);
  const eventName = normalizeGrasonMatchText(event.name);

  return confirmations
    .filter((confirmation) => {
      if (event.supabaseId && confirmation.eventId === event.supabaseId) {
        return true;
      }

      if (confirmation.eventId) {
        return false;
      }

      const confirmationJobNumber = normalizeGrasonJobNumber(confirmation.jobNumber);
      const confirmationEventName = normalizeGrasonMatchText(confirmation.eventName);
      return Boolean(
        confirmation.shiftDate
        && event.startDate <= confirmation.shiftDate
        && event.endDate >= confirmation.shiftDate
        && eventJobNumber
        && confirmationJobNumber === eventJobNumber
        && eventName
        && confirmationEventName === eventName,
      );
    })
    .sort((left, right) => (
      `${left.shiftDate}|${left.sourceTitle}|${left.confirmedName}`
        .localeCompare(`${right.shiftDate}|${right.sourceTitle}|${right.confirmedName}`, 'cs')
    ));
};

const EVENT_PHASES = new Set<TimelogType>(['instal', 'provoz', 'deinstal']);

const toEventPhase = (value: string | null): TimelogType => (
  value && EVENT_PHASES.has(value as TimelogType) ? value as TimelogType : 'provoz'
);

const mapGrasonConfirmationRow = (row: GrasonEventConfirmationRow): GrasonEventConfirmation => ({
  id: row.id,
  source: 'grason',
  sourceMonth: row.source_month ?? '',
  sourceKey: row.source_key ?? '',
  eventId: row.event_id,
  profileId: row.profile_id,
  shiftDate: row.shift_date ?? '',
  sourceTitle: row.source_title ?? '',
  eventName: row.event_name ?? '',
  jobNumber: row.job_number ?? '',
  phase: toEventPhase(row.phase),
  confirmedName: row.confirmed_name ?? '',
  sourceOccurrenceCount: row.source_occurrence_count ?? 1,
  rawPayload: row.raw_payload ?? null,
  importedAt: row.imported_at ?? '',
  updatedAt: row.updated_at ?? '',
});

const requestSupabaseTimelogsHydration = () => {
  void import('../../timelogs/services/timelogs.service')
    .then(({ ensureSupabaseTimelogsLoaded }) => ensureSupabaseTimelogsLoaded())
    .catch((error) => {
      console.warn('Nepodarilo se spustit nacitani timelogu pro detail akce.', error);
    });
};

const loadEventsLifecycleSnapshot = async (): Promise<EventLifecycleSnapshot> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    const snapshot = getLocalAppState();
    return {
      events: snapshot.events ?? [],
      eventApplications: snapshot.eventApplications ?? [],
      eventCrewAssignments: snapshot.eventCrewAssignments ?? [],
      grasonEventConfirmations: snapshot.grasonEventConfirmations ?? [],
      eventRowIdByLocalId: new Map(
        (snapshot.events ?? [])
          .filter((event) => event.supabaseId)
          .map((event) => [event.id, event.supabaseId as string]),
      ),
    };
  }

  const supabaseGrason = supabase as unknown as SupabaseGrasonClient;
  const [
    eventsResult,
    projectsResult,
    clientsResult,
    timelogsResult,
    eventAssignmentsResult,
    grasonConfirmationsResult,
    applicationsResult,
    crewAssignmentsResult,
  ] = await Promise.all([
    supabase.from('events').select('*').order('date_from').order('name').order('id'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('timelogs').select('event_id,contractor_id'),
    supabase.from('event_assignments').select('event_id,profile_id,assigned_at').order('assigned_at'),
    supabaseGrason.from('grason_event_confirmations').select('*').order('shift_date'),
    supabase.from('event_applications').select('*').order('created_at'),
    supabase.rpc('list_event_crew_assignments'),
  ]);

  const firstError = eventsResult.error
    ?? projectsResult.error
    ?? clientsResult.error
    ?? timelogsResult.error
    ?? eventAssignmentsResult.error
    ?? applicationsResult.error
    ?? crewAssignmentsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRows = clientsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const eventRows = eventsResult.data ?? [];
  const timelogRows = (timelogsResult.data ?? []) as TimelogAssignmentRow[];
  const eventAssignmentRows = (eventAssignmentsResult.data ?? []) as EventAssignmentRow[];
  const grasonEventConfirmations = grasonConfirmationsResult.error
    ? []
    : ((grasonConfirmationsResult.data ?? []) as GrasonEventConfirmationRow[]).map(mapGrasonConfirmationRow);
  const applicationRows = (applicationsResult.data ?? []) as EventApplicationRow[];
  const crewAssignmentRows = (crewAssignmentsResult.data ?? []) as EventCrewAssignmentRow[];

  if (grasonConfirmationsResult.error) {
    console.warn('Nepodarilo se nacist potvrzeni z Grasonu.', grasonConfirmationsResult.error.message);
  }

  const clientsByUuid = new Map(
    clientRows.map((row, index) => [row.id, { ...mapClient(row), id: index + 1 }]),
  );
  const projectRowsByUuid = new Map(projectRows.map((row) => [row.id, row]));
  const assignedProfilesByEventRowId = new Map<string, Set<string>>();
  const eventRowIdToLocalId = new Map(eventRows.map((row, index) => [row.id, index + 1]));
  const contractorsByProfileId = new Map(
    (getLocalAppState().contractors ?? [])
      .filter((contractor) => contractor.profileId)
      .map((contractor) => [contractor.profileId as string, contractor]),
  );

  timelogRows.forEach((row) => {
    if (!row.event_id || !row.contractor_id) return;

    const assignedProfiles = assignedProfilesByEventRowId.get(row.event_id) ?? new Set<string>();
    assignedProfiles.add(row.contractor_id);
    assignedProfilesByEventRowId.set(row.event_id, assignedProfiles);
  });

  eventAssignmentRows.forEach((row) => {
    if (!row.event_id || !row.profile_id) return;

    const assignedProfiles = assignedProfilesByEventRowId.get(row.event_id) ?? new Set<string>();
    assignedProfiles.add(row.profile_id);
    assignedProfilesByEventRowId.set(row.event_id, assignedProfiles);
  });

  crewAssignmentRows.forEach((row) => {
    const assignedProfiles = assignedProfilesByEventRowId.get(row.event_id) ?? new Set<string>();
    assignedProfiles.add(row.profile_id);
    assignedProfilesByEventRowId.set(row.event_id, assignedProfiles);
  });

  const supabaseEvents = eventRows.map((row, index) => {
    const project = row.project_id ? projectRowsByUuid.get(row.project_id) : undefined;
    const client = project?.client_id ? clientsByUuid.get(project.client_id) : undefined;

    return {
      ...mapEvent(row),
      id: index + 1,
      job: row.job_number ?? project?.job_number ?? '',
      client: row.client_name ?? client?.name ?? '',
      filled: assignedProfilesByEventRowId.get(row.id)?.size ?? row.crew_filled ?? 0,
    };
  });

  const explicitEventCrewAssignments = eventAssignmentRows
    .map((row) => {
      if (!row.event_id || !row.profile_id) return null;
      const localEventId = eventRowIdToLocalId.get(row.event_id);
      if (!localEventId) return null;

      return {
        eventId: localEventId,
        eventSupabaseId: row.event_id,
        contractorProfileId: row.profile_id,
        name: contractorsByProfileId.get(row.profile_id)?.name ?? row.profile_id,
      } satisfies EventCrewAssignment;
    })
    .filter((assignment): assignment is EventCrewAssignment => Boolean(assignment));

  const eventLocalIdByRowId = new Map(eventRows.map((row, index) => [row.id, index + 1]));
  const eventApplications = applicationRows
    .map((row, index) => {
      const eventId = eventLocalIdByRowId.get(row.event_id);
      if (!eventId) return null;
      return {
        id: index + 1,
        supabaseId: row.id,
        eventId,
        eventSupabaseId: row.event_id,
        contractorProfileId: row.profile_id,
        status: row.status,
        note: row.note ?? '',
        plannedFrom: row.planned_from ?? null,
        plannedTo: row.planned_to ?? null,
        createdAt: row.created_at,
      } satisfies EventApplication;
    })
    .filter((application): application is EventApplication => Boolean(application));

  const timelogEventCrewAssignments = crewAssignmentRows
    .map((row) => {
      const eventId = eventLocalIdByRowId.get(row.event_id);
      if (!eventId) return null;
      const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
      return {
        eventId,
        eventSupabaseId: row.event_id,
        contractorProfileId: row.profile_id,
        name: name || 'Clen crew',
      } satisfies EventCrewAssignment;
    })
    .filter((assignment): assignment is EventCrewAssignment => Boolean(assignment));

  const eventCrewAssignments = [
    ...explicitEventCrewAssignments,
    ...timelogEventCrewAssignments.filter((assignment) => (
      !explicitEventCrewAssignments.some((existing) => (
        existing.eventSupabaseId === assignment.eventSupabaseId
        && existing.contractorProfileId === assignment.contractorProfileId
      ))
    )),
  ];

  return {
    events: supabaseEvents,
    eventApplications,
    eventCrewAssignments,
    grasonEventConfirmations,
    eventRowIdByLocalId: new Map(eventRows.map((row, index) => [index + 1, row.id])),
  };
};

const applyEventRowIdMap = (nextMap: Map<number, string>): void => {
  eventRowIdByLocalId.clear();
  nextMap.forEach((rowId, localId) => {
    eventRowIdByLocalId.set(localId, rowId);
  });
};

export const fetchEventsSnapshot = async (): Promise<Event[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().events ?? [];
  }

  const generation = getLifecycleSnapshotGeneration();
  const lifecycleSnapshot = await loadEventsLifecycleSnapshot();
  if (generation !== getLifecycleSnapshotGeneration()) {
    return getLocalAppState().events ?? [];
  }
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    events: lifecycleSnapshot.events,
    eventApplications: lifecycleSnapshot.eventApplications,
    eventCrewAssignments: lifecycleSnapshot.eventCrewAssignments,
    grasonEventConfirmations: lifecycleSnapshot.grasonEventConfirmations,
  }));
  applyEventRowIdMap(lifecycleSnapshot.eventRowIdByLocalId);

  return lifecycleSnapshot.events;
};

const hydrateEventsFromSupabase = async (): Promise<void> => {
  await fetchEventsSnapshot();
};

export const ensureSupabaseEventsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (eventsLoaded) {
    return;
  }

  if (eventsHydrationPromise) {
    return;
  }

  eventsHydrationPromise = hydrateEventsFromSupabase()
    .then(() => {
      eventsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist akce ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      eventsHydrationPromise = null;
    });
};

const syncEventQueryCache = () => {
  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.events.all, snapshot.events ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
  queryClient.setQueryData(queryKeys.receipts.all, snapshot.receipts ?? []);
};

const invalidateEventQueries = () => {
  syncEventQueryCache();
  void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.timelogs.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
};

const refreshEventLifecycleState = (): Promise<void> => {
  const queuedRefresh = eventLifecycleRefreshQueue.then(async () => {
    let eventLifecycleSnapshot: EventLifecycleSnapshot;
    let timelogs: Timelog[];

    try {
      const { loadTimelogsSnapshot } = await import('../../timelogs/services/timelogs.service');
      [eventLifecycleSnapshot, timelogs] = await Promise.all([
        loadEventsLifecycleSnapshot(),
        loadTimelogsSnapshot(),
      ]);
    } catch (error) {
      console.error('Failed to refresh Crew lifecycle state', error);
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }

    advanceLifecycleSnapshotGeneration();
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      events: eventLifecycleSnapshot.events,
      eventApplications: eventLifecycleSnapshot.eventApplications,
      eventCrewAssignments: eventLifecycleSnapshot.eventCrewAssignments,
      grasonEventConfirmations: eventLifecycleSnapshot.grasonEventConfirmations,
      timelogs,
    }));
    applyEventRowIdMap(eventLifecycleSnapshot.eventRowIdByLocalId);
    syncEventQueryCache();
  });

  eventLifecycleRefreshQueue = queuedRefresh.catch(() => undefined);
  return queuedRefresh;
};

const getSupabaseClientRows = async (): Promise<Array<{ id: string; name: string }>> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const result = await supabase
    .from('clients')
    .select('id,name')
    .order('name');

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
};

const getSupabaseProjectRows = async (): Promise<Array<{ id: string; job_number: string; client_id: string | null }>> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const result = await supabase
    .from('projects')
    .select('id,job_number,client_id')
    .order('job_number');

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
};

const getSupabaseEventRows = async (): Promise<Array<{ id: string; date_from: string | null; name: string }>> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const eventRowsQuery = supabase
    .from('events')
    .select('id,date_from,name')
    .order('date_from')
    .order('name');
  const result = typeof eventRowsQuery.order === 'function'
    ? await eventRowsQuery.order('id')
    : await eventRowsQuery;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
};

const getSupabaseEventRowId = async (eventId: EventIdentifier): Promise<string> => {
  if (typeof eventId === 'string') {
    return eventId;
  }

  const event = (getLocalAppState().events ?? []).find((item) => item.id === eventId);
  if (event?.supabaseId) {
    return event.supabaseId;
  }

  const mapped = eventRowIdByLocalId.get(eventId);
  if (mapped) {
    return mapped;
  }

  const eventRows = await getSupabaseEventRows();
  eventRows.forEach((row, index) => {
    eventRowIdByLocalId.set(index + 1, row.id);
  });

  const rowId = eventRowIdByLocalId.get(eventId);
  if (!rowId) {
    throw new Error('Nepodarilo se sparovat akci s databazovym zaznamem.');
  }

  return rowId;
};

const getContractorByProfileId = (profileId: string): Contractor | null => (
  (getLocalAppState().contractors ?? []).find((contractor) => contractor.profileId === profileId) ?? null
);

const ensureSupabaseProjectRowId = async (event: Event): Promise<string | null> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const [projectRows, clientRows] = await Promise.all([
    getSupabaseProjectRows(),
    getSupabaseClientRows(),
  ]);
  const existingProject = projectRows.find((project) => project.job_number === event.job);
  if (existingProject) {
    return existingProject.id;
  }

  const matchingClient = clientRows.find((client) => client.name === event.client);
  const projectInsert = await supabase
    .from('projects')
    .insert({
      job_number: event.job,
      name: event.name || event.job,
      client_id: matchingClient?.id ?? null,
      note: '',
    })
    .select('id')
    .single();

  if (projectInsert.error) {
    throw new Error(projectInsert.error.message);
  }

  return projectInsert.data?.id ?? null;
};

const toSupabaseEventPayload = async (event: Event) => ({
  name: event.name,
  project_id: await ensureSupabaseProjectRowId(event),
  job_number: event.job,
  client_name: event.client,
  date_from: event.startDate,
  date_to: event.endDate,
  time_from: event.startTime ?? null,
  time_to: event.endTime ?? null,
  city: event.city,
  address: event.address ?? null,
  place_id: event.placeId ?? null,
  location_lat: event.locationLat ?? null,
  location_lng: event.locationLng ?? null,
  crew_needed: event.needed,
  crew_filled: event.filled,
  status: event.status,
  description: event.description ?? null,
  contact_person: event.contactPerson ?? null,
  dresscode: event.dresscode ?? null,
  meeting_point: event.meetingLocation ?? null,
  show_day_types: event.showDayTypes ?? false,
  allow_crew_time_proposal: event.allowCrewTimeProposal ?? false,
  day_types: event.dayTypes ?? null,
  phase_times: event.phaseTimes ?? null,
  phase_schedules: event.phaseSchedules ?? null,
});

export const getEvents = (search = ''): Event[] => {
  ensureSupabaseEventsLoaded();
  const { events } = getLocalAppState();
  const query = search.trim().toLowerCase();
  const safeEvents = events ?? [];

  if (!query) return safeEvents;

  return safeEvents.filter((event) => (
    event.name.toLowerCase().includes(query) || event.job.toLowerCase().includes(query)
  ));
};

export const getEventById = (id: EventIdentifier | null): Event | null => {
  ensureSupabaseEventsLoaded();
  if (id == null) return null;
  return (getLocalAppState().events ?? []).find((event) => matchesEventIdentifier(event, id)) ?? null;
};

export const getEventDetailData = (eventId: EventIdentifier | null): {
  event: Event | null;
  timelogs: Timelog[];
  contractors: Contractor[];
  receipts: ReceiptItem[];
  grasonConfirmations: GrasonEventConfirmation[];
  applications: EventApplication[];
  crewAssignments: EventCrewAssignment[];
} => {
  ensureSupabaseEventsLoaded();
  requestSupabaseTimelogsHydration();
  const snapshot = getLocalAppState();
  const event = eventId == null ? null : (snapshot.events ?? []).find((item) => matchesEventIdentifier(item, eventId)) ?? null;

  if (!event) {
    return {
      event: null,
      timelogs: [],
      contractors: snapshot.contractors ?? [],
      receipts: [],
      grasonConfirmations: [],
      applications: [],
      crewAssignments: [],
    };
  }

  const eventTimelogs = (snapshot.timelogs ?? []).filter((timelog) => timelog.eid === event.id);
  const grasonConfirmations = getGrasonConfirmationsForEvent(event, snapshot.grasonEventConfirmations ?? []);
  const assignedCrewCount = getAssignedProfileIdsForEvent(
    event,
    eventTimelogs,
    snapshot.eventCrewAssignments ?? [],
  ).size;
  const eventReceipts = appDataSource === 'supabase' && event.supabaseId
    ? (snapshot.receipts ?? []).filter((receipt) => receipt.eventSupabaseId === event.supabaseId)
    : (snapshot.receipts ?? []).filter((receipt) => receipt.eid === event.id);
  const storedCrewAssignments = (snapshot.eventCrewAssignments ?? [])
    .filter((assignment) => assignmentMatchesEvent(assignment, event));
  const crewAssignments = storedCrewAssignments.length > 0
    ? storedCrewAssignments
    : eventTimelogs.reduce<EventCrewAssignment[]>((assignments, timelog) => {
        if (!timelog.contractorProfileId || assignments.some((item) => item.contractorProfileId === timelog.contractorProfileId)) {
          return assignments;
        }
        const contractor = (snapshot.contractors ?? []).find((item) => item.profileId === timelog.contractorProfileId);
        return contractor
          ? [...assignments, {
              eventId: event.id,
              eventSupabaseId: event.supabaseId,
              contractorProfileId: timelog.contractorProfileId,
              name: contractor.name,
            }]
          : assignments;
      }, []);

  return {
    event: {
      ...event,
      filled: assignedCrewCount > 0 ? assignedCrewCount : event.filled,
    },
    timelogs: eventTimelogs,
    contractors: snapshot.contractors ?? [],
    receipts: eventReceipts,
    grasonConfirmations,
    applications: (snapshot.eventApplications ?? []).filter((application) => application.eventId === event.id),
    crewAssignments,
  };
};

export const getPendingEventApplications = (eventId?: EventIdentifier | null): EventApplication[] => {
  ensureSupabaseEventsLoaded();
  const snapshot = getLocalAppState();
  const applications = snapshot.eventApplications ?? [];
  if (eventId == null) return applications.filter((application) => application.status === 'pending');

  const event = (snapshot.events ?? []).find((item) => matchesEventIdentifier(item, eventId));
  if (!event) return [];
  return applications.filter((application) => application.eventId === event.id && application.status === 'pending');
};

export const applyForEvent = async (
  eventId: EventIdentifier,
  contractorProfileId: string,
  plannedTimes?: { from?: string; to?: string },
): Promise<EventApplication> => {
  const snapshot = getLocalAppState();
  const event = (snapshot.events ?? []).find((item) => matchesEventIdentifier(item, eventId));
  if (!event) {
    throw new Error('Akce nebyla nalezena.');
  }

  if (!contractorProfileId) {
    throw new Error('Nepodarilo se dohledat prihlaseneho clena crew.');
  }

  const isAlreadyAssigned = (snapshot.timelogs ?? []).some((timelog) => (
    timelog.eid === event.id && timelog.contractorProfileId === contractorProfileId
  ));
  if (isAlreadyAssigned) {
    throw new Error('Na tuto akci uz jste prirazeny.');
  }

  const existingApplication = (snapshot.eventApplications ?? []).find((application) => (
    application.eventId === event.id && application.contractorProfileId === contractorProfileId
  ));
  if (existingApplication?.status === 'pending') {
    return existingApplication;
  }
  if (existingApplication?.status === 'approved' || existingApplication?.status === 'withdrawal_requested') {
    throw new Error('Na tuto akci uz jste prirazeny.');
  }

  const plannedFrom = event.allowCrewTimeProposal ? (plannedTimes?.from || null) : null;
  const plannedTo = event.allowCrewTimeProposal ? (plannedTimes?.to || null) : null;

  let nextApplication: EventApplication = {
    id: existingApplication?.id ?? Math.max(0, ...(snapshot.eventApplications ?? []).map((item) => item.id)) + 1,
    supabaseId: existingApplication?.supabaseId,
    eventId: event.id,
    eventSupabaseId: event.supabaseId,
    contractorProfileId,
    status: 'pending',
    note: existingApplication?.note ?? '',
    plannedFrom,
    plannedTo,
    createdAt: existingApplication?.createdAt ?? new Date().toISOString(),
  };

  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && supabase) {
    if (!event.supabaseId) {
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }
    const eventRowId = event.supabaseId;
    const applicationResult = await supabase
      .from('event_applications')
      .upsert({
        event_id: eventRowId,
        profile_id: contractorProfileId,
        status: 'pending',
        note: null,
        planned_from: plannedFrom,
        planned_to: plannedTo,
      }, { onConflict: 'event_id,profile_id' })
      .select('*')
      .single();

    if (applicationResult.error) {
      throw toCrewApplicationLifecycleMutationError(
        applicationResult.error,
        EVENT_APPLICATION_STATUS_CONFLICT_MESSAGE,
      );
    }

    const applicationRow = requireEventApplicationMutationRow(
      applicationResult.data,
      eventRowId,
      contractorProfileId,
      'pending',
    );
    nextApplication = mapEventApplicationMutationRow(applicationRow, nextApplication);
    advanceLifecycleSnapshotGeneration();
  }

  updateLocalAppState((currentSnapshot) => {
    if (persistsToSupabase) {
      const reconciled = reconcilePersistedEventApplication(
        currentSnapshot.eventApplications ?? [],
        currentSnapshot.events ?? [],
        nextApplication,
      );
      nextApplication = reconciled.application;
      return {
        ...currentSnapshot,
        eventApplications: reconciled.applications,
      };
    }

    const otherApplications = (currentSnapshot.eventApplications ?? []).filter((application) => !(
      application.eventId === event.id && application.contractorProfileId === contractorProfileId
    ));

    return {
      ...currentSnapshot,
      eventApplications: [...otherApplications, nextApplication],
    };
  });

  invalidateEventQueries();
  return nextApplication;
};

export const updateEventApplicationStatus = async (
  applicationId: number,
  status: EventApplicationStatus,
  expectedStatus?: EventApplicationStatus,
): Promise<EventApplication | null> => {
  const snapshot = getLocalAppState();
  const application = (snapshot.eventApplications ?? []).find((item) => item.id === applicationId);
  const conflictMessage = EVENT_APPLICATION_STATUS_CONFLICT_MESSAGE;
  if (!application) {
    throw new Error('Prihlaska nebyla nalezena.');
  }
  if (expectedStatus && application.status !== expectedStatus) {
    throw new Error(conflictMessage);
  }

  let nextApplication = { ...application, status };
  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && supabase) {
    if (!application.supabaseId) {
      throw new Error('Prihlaska nema UUID zaznam v Supabase.');
    }

    const updateById = supabase
      .from('event_applications')
      .update({ status })
      .eq('id', application.supabaseId);
    const conditionalUpdate = expectedStatus
      ? updateById.eq('status', expectedStatus)
      : updateById;
    const updateResult = await conditionalUpdate.select('*');

    if (updateResult.error) {
      throw toCrewApplicationLifecycleMutationError(updateResult.error, conflictMessage);
    }
    if (updateResult.data?.length === 0) {
      throw new Error(conflictMessage);
    }

    const updatedRow = updateResult.data?.[0];
    if (
      updateResult.data?.length !== 1
      || !application.eventSupabaseId
    ) {
      console.error('Unexpected Crew application lifecycle mutation response', updateResult.data);
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }

    const applicationRow = requireEventApplicationMutationRow(
      updatedRow,
      application.eventSupabaseId,
      application.contractorProfileId,
      status,
    );
    if (applicationRow.id !== application.supabaseId) {
      console.error('Unexpected Crew application lifecycle mutation response', updateResult.data);
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }
    nextApplication = mapEventApplicationMutationRow(applicationRow, application);
    advanceLifecycleSnapshotGeneration();
  }

  updateLocalAppState((currentSnapshot) => {
    if (persistsToSupabase) {
      const reconciled = reconcilePersistedEventApplication(
        currentSnapshot.eventApplications ?? [],
        currentSnapshot.events ?? [],
        nextApplication,
      );
      nextApplication = reconciled.application;
      return {
        ...currentSnapshot,
        eventApplications: reconciled.applications,
      };
    }

    return {
      ...currentSnapshot,
      eventApplications: (currentSnapshot.eventApplications ?? []).map((item) => (
        item.id === applicationId ? nextApplication : item
      )),
    };
  });

  invalidateEventQueries();
  return nextApplication;
};

export const withdrawEventApplication = async (
  eventId: EventIdentifier,
  contractorProfileId: string,
): Promise<EventApplication | null> => {
  const snapshot = getLocalAppState();
  const event = (snapshot.events ?? []).find((item) => matchesEventIdentifier(item, eventId));
  if (!event) {
    throw new Error('Akce nebyla nalezena.');
  }

  const application = (snapshot.eventApplications ?? []).find((item) => (
    item.eventId === event.id && item.contractorProfileId === contractorProfileId
  ));
  if (!application || application.status !== 'pending') {
    throw new Error('Odhlasit se lze primo jen pred schvalenim prihlasky.');
  }

  return updateEventApplicationStatus(application.id, 'withdrawn', 'pending');
};

export const requestEventWithdrawal = async (
  eventId: EventIdentifier,
  contractorProfileId: string,
): Promise<EventApplication> => {
  const snapshot = getLocalAppState();
  const event = (snapshot.events ?? []).find((item) => matchesEventIdentifier(item, eventId));
  if (!event) {
    throw new Error('Akce nebyla nalezena.');
  }

  const isAssigned = (snapshot.timelogs ?? []).some((timelog) => (
    timelog.eid === event.id && timelog.contractorProfileId === contractorProfileId
  ));
  if (!isAssigned) {
    throw new Error('O odhlaseni lze pozadat az po schvaleni na akci.');
  }

  const existingApplication = (snapshot.eventApplications ?? []).find((application) => (
    application.eventId === event.id && application.contractorProfileId === contractorProfileId
  ));
  if (existingApplication?.status === 'withdrawal_requested') {
    return existingApplication;
  }

  let nextApplication: EventApplication = {
    id: existingApplication?.id ?? Math.max(0, ...(snapshot.eventApplications ?? []).map((item) => item.id)) + 1,
    supabaseId: existingApplication?.supabaseId,
    eventId: event.id,
    eventSupabaseId: event.supabaseId,
    contractorProfileId,
    status: 'withdrawal_requested',
    note: existingApplication?.note ?? '',
    plannedFrom: existingApplication?.plannedFrom ?? null,
    plannedTo: existingApplication?.plannedTo ?? null,
    createdAt: existingApplication?.createdAt ?? new Date().toISOString(),
  };

  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && supabase) {
    if (!event.supabaseId) {
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }
    const eventRowId = event.supabaseId;
    const applicationResult = await supabase
      .from('event_applications')
      .upsert({
        event_id: eventRowId,
        profile_id: contractorProfileId,
        status: 'withdrawal_requested',
        note: existingApplication?.note ?? null,
        planned_from: existingApplication?.plannedFrom ?? null,
        planned_to: existingApplication?.plannedTo ?? null,
      }, { onConflict: 'event_id,profile_id' })
      .select('*')
      .single();

    if (applicationResult.error) {
      throw toCrewApplicationLifecycleMutationError(
        applicationResult.error,
        EVENT_WITHDRAWAL_STATUS_CONFLICT_MESSAGE,
      );
    }

    const applicationRow = requireEventApplicationMutationRow(
      applicationResult.data,
      eventRowId,
      contractorProfileId,
      'withdrawal_requested',
    );
    nextApplication = mapEventApplicationMutationRow(applicationRow, nextApplication);
    advanceLifecycleSnapshotGeneration();
  }

  updateLocalAppState((currentSnapshot) => {
    if (persistsToSupabase) {
      const reconciled = reconcilePersistedEventApplication(
        currentSnapshot.eventApplications ?? [],
        currentSnapshot.events ?? [],
        nextApplication,
      );
      nextApplication = reconciled.application;
      return {
        ...currentSnapshot,
        eventApplications: reconciled.applications,
      };
    }

    const otherApplications = (currentSnapshot.eventApplications ?? []).filter((application) => !(
      application.eventId === event.id && application.contractorProfileId === contractorProfileId
    ));

    return {
      ...currentSnapshot,
      eventApplications: [...otherApplications, nextApplication],
    };
  });

  invalidateEventQueries();
  return nextApplication;
};

export const approveEventApplication = async (applicationId: number): Promise<void> => {
  const snapshot = getLocalAppState();
  const application = (snapshot.eventApplications ?? []).find((item) => item.id === applicationId);
  if (!application) {
    throw new Error('Prihlaska nebyla nalezena.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured && !application.supabaseId) {
    throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
  }

  const event = (snapshot.events ?? []).find((item) => item.id === application.eventId);
  await assignCrewToEvent(
    application.eventId,
    application.contractorProfileId,
    application.supabaseId ?? null,
    event?.showDayTypes ? ['all'] : undefined,
  );
};

export const approveEventWithdrawal = async (applicationId: number): Promise<void> => {
  const snapshot = getLocalAppState();
  const application = (snapshot.eventApplications ?? []).find((item) => item.id === applicationId);
  if (!application) {
    throw new Error('Zadost o odhlaseni nebyla nalezena.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const event = (snapshot.events ?? []).find((item) => item.id === application.eventId);
    if (
      !application.supabaseId
      || !application.eventSupabaseId
      || !event?.supabaseId
      || event.supabaseId !== application.eventSupabaseId
    ) {
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }

    const rpc = await approveEventWithdrawalRpc(
      application.eventSupabaseId,
      application.contractorProfileId,
      application.supabaseId,
    );
    if (
      rpc.event_id !== application.eventSupabaseId
      || rpc.profile_id !== application.contractorProfileId
      || rpc.application_id !== application.supabaseId
    ) {
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }

    await refreshEventLifecycleState();
    const refreshed = getLocalAppState();
    const refreshedApplication = (refreshed.eventApplications ?? []).find((item) => (
      item.supabaseId === application.supabaseId
    ));
    const timelogStillExists = (refreshed.timelogs ?? []).some((item) => (
      item.eventSupabaseId === application.eventSupabaseId
      && item.contractorProfileId === application.contractorProfileId
    ));
    if (!refreshedApplication || refreshedApplication.status !== 'withdrawn' || timelogStillExists) {
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }
    return;
  }

  if (application.status !== 'withdrawal_requested') {
    throw new Error('Stav žádosti o odhlášení se mezitím změnil. Obnovte detail akce a zkuste to znovu.');
  }

  await removeContractorFromEvent(application.eventId, application.contractorProfileId);
};

export const getEventFormOptions = (): { projects: Project[]; clients: Client[] } => {
  ensureSupabaseEventsLoaded();
  const snapshot = getLocalAppState();
  return {
    projects: snapshot.projects ?? [],
    clients: snapshot.clients ?? [],
  };
};

export const createEmptyEvent = (): Event => {
  const { events } = getLocalAppState();

  return {
    id: Math.max(0, ...events.map((event) => event.id)) + 1,
    name: '',
    job: '',
    startDate: '',
    endDate: '',
    startTime: DEFAULT_TIME_FROM,
    endTime: DEFAULT_TIME_TO,
    city: '',
    needed: 1,
    filled: 0,
    status: 'upcoming',
    client: '',
    showDayTypes: false,
    allowCrewTimeProposal: false,
  };
};

export const createEventCopy = (event: Event): Event => {
  const { events } = getLocalAppState();
  const newStartDate = event.endDate ? addDaysToDateKey(event.endDate, 1) : event.startDate;
  const eventDurationDays = event.startDate && event.endDate
    ? getDaysBetweenDateKeys(event.startDate, event.endDate)
    : 0;
  const newEndDate = newStartDate ? addDaysToDateKey(newStartDate, eventDurationDays) : event.endDate;
  const dateShift = event.startDate && newStartDate
    ? getDaysBetweenDateKeys(event.startDate, newStartDate)
    : 0;

  return {
    ...event,
    id: Math.max(0, ...events.map((item) => item.id)) + 1,
    supabaseId: undefined,
    startDate: newStartDate,
    endDate: newEndDate,
    filled: 0,
    status: 'upcoming',
    dayTypes: shiftDateRecordKeys(event.dayTypes, dateShift),
    phaseSchedules: shiftPhaseSchedules(event.phaseSchedules, dateShift),
  };
};

export const getReferenceDate = (events: Event[]) => {
  if (events.length === 0) return new Date();

  const today = new Date().toISOString().split('T')[0];
  const upcoming = [...events]
    .filter((event) => event.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (upcoming.length > 0) {
    const nextDate = new Date(upcoming[0].startDate);
    return Number.isNaN(nextDate.getTime()) ? new Date() : nextDate;
  }

  const latestPast = [...events].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const fallbackDate = new Date(latestPast[0].startDate);
  return Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate;
};

export const getEventsWithDerivedStatus = (events: Event[]): EventWithDerivedStatus[] => (
  events.map((event) => ({
    ...event,
    derivedStatus: getEventStatus(event),
  }))
);

export const filterEventsByStatus = (
  events: EventWithDerivedStatus[],
  filter: EventFilter,
): EventWithDerivedStatus[] => events.filter((event) => {
  if (filter === 'all') return true;
  if (filter === 'past') return event.derivedStatus === 'past';
  return event.derivedStatus !== 'past';
});

export const createDefaultPhaseTimes = (from: string, to: string) => ({
  instal: { from, to },
  provoz: { from, to },
  deinstal: { from, to },
});

const createEmptySchedules = (from: string, to: string) => ({
  instal: [{ id: createSlotId(), from, to, dates: [] }],
  provoz: [{ id: createSlotId(), from, to, dates: [] }],
  deinstal: [{ id: createSlotId(), from, to, dates: [] }],
});

export const normalizeEventSchedules = (event: Event) => {
  if (event.phaseSchedules) return event.phaseSchedules;

  const defaultFrom = event.startTime || DEFAULT_TIME_FROM;
  const defaultTo = event.endTime || DEFAULT_TIME_TO;
  const phaseTimes = event.phaseTimes || createDefaultPhaseTimes(defaultFrom, defaultTo);
  const schedules = createEmptySchedules(defaultFrom, defaultTo);
  const dates = event.startDate && event.endDate ? getDatesBetween(event.startDate, event.endDate) : [];

  EVENT_PHASE_TYPES.forEach((phaseType) => {
    schedules[phaseType] = [{
      id: createSlotId(),
      from: phaseTimes[phaseType]?.from || defaultFrom,
      to: phaseTimes[phaseType]?.to || defaultTo,
      dates: dates.filter((date) => event.dayTypes?.[date] === phaseType),
    }];
  });

  return schedules;
};

export const syncDayTypesFromSchedules = (event: Event) => {
  const nextDayTypes: Record<string, TimelogType> = {};

  EVENT_PHASE_TYPES.forEach((phaseType) => {
    (event.phaseSchedules?.[phaseType] || []).forEach((slot) => {
      slot.dates.forEach((date) => {
        nextDayTypes[date] = nextDayTypes[date] || phaseType;
      });
    });
  });

  return nextDayTypes;
};

export const applyEventDraft = (event: Event): Event => ({
  ...event,
  dayTypes: syncDayTypesFromSchedules(event),
});

const validateEvent = (event: Event) => {
  if (!event.job.trim()) {
    throw new Error('Vyplnte Job Number.');
  }
};

const normalizeEvent = (event: Event): Event => ({
  ...event,
  job: event.job.trim().toUpperCase(),
  name: event.name.trim(),
  client: event.client.trim(),
  city: (event.address?.trim() || event.city.trim()),
  address: event.address?.trim() || event.city.trim() || undefined,
  placeId: event.placeId?.trim() || undefined,
  locationLat: typeof event.locationLat === 'number' && Number.isFinite(event.locationLat) ? event.locationLat : null,
  locationLng: typeof event.locationLng === 'number' && Number.isFinite(event.locationLng) ? event.locationLng : null,
  allowCrewTimeProposal: event.allowCrewTimeProposal ?? false,
});

export const ensureProjectForEvent = (projects: Project[], event: Event): Project[] => {
  const exists = projects.some((project) => project.id === event.job);
  if (exists) return projects;

  return [
    ...projects,
    {
      id: event.job,
      name: event.name || event.job,
      client: event.client,
      createdAt: new Date().toISOString().split('T')[0],
      note: '',
    },
  ];
};

export const getScheduledEventDay = (event: Event, day: Timelog['days'][number]) => {
  if (!event.showDayTypes) {
    return {
      ...day,
      type: 'instal' as const,
      f: event.startTime || day.f,
      t: event.endTime || day.t,
    };
  }

  const phaseSlot = event.phaseSchedules?.[day.type]?.find((slot) => slot.dates.includes(day.d));
  const fallbackType = event.dayTypes?.[day.d];
  const fallbackSlot = fallbackType ? event.phaseSchedules?.[fallbackType]?.find((slot) => slot.dates.includes(day.d)) : undefined;
  const resolvedType = phaseSlot ? day.type : (fallbackType || day.type);
  const resolvedSlot = phaseSlot || fallbackSlot;

  return {
    ...day,
    type: resolvedType,
    f: resolvedSlot?.from ?? event.phaseTimes?.[resolvedType]?.from ?? event.startTime ?? day.f,
    t: resolvedSlot?.to ?? event.phaseTimes?.[resolvedType]?.to ?? event.endTime ?? day.t,
  };
};

export const syncEventTimelogs = (timelogs: Timelog[], event: Event): Timelog[] => (
  timelogs.map((timelog) => {
    if (timelog.eid !== event.id) return timelog;

    return {
      ...timelog,
      days: [...timelog.days.map((day) => getScheduledEventDay(event, day))]
        .sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`)),
    };
  })
);

export const saveEvent = async (event: Event): Promise<Event> => {
  const normalized = normalizeEvent(event);
  validateEvent(normalized);

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    try {
      const exists = (getLocalAppState().events ?? []).some((item) => item.id === normalized.id);
      const payload = await toSupabaseEventPayload(normalized);

      if (exists) {
        const eventRowId = await getSupabaseEventRowId(normalized.id);
        const eventUpdate = await supabase
          .from('events')
          .update(payload)
          .eq('id', eventRowId);

        if (eventUpdate.error) {
          throw eventUpdate.error;
        }
      } else {
        const eventInsert = await supabase
          .from('events')
          .insert(payload)
          .select('id')
          .single();

        if (eventInsert.error) {
          throw eventInsert.error;
        }

        if (eventInsert.data?.id) {
          eventRowIdByLocalId.set(normalized.id, eventInsert.data.id);
        }
      }
    } catch (error) {
      console.error('Failed to save event to Supabase', error);
      throw new Error(EVENT_SAVE_ERROR_MESSAGE);
    }
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.events.some((item) => item.id === normalized.id);
    const nextEvents = exists
      ? snapshot.events.map((item) => item.id === normalized.id ? normalized : item)
      : [...snapshot.events, normalized];

    return {
      ...snapshot,
      events: nextEvents,
      projects: ensureProjectForEvent(snapshot.projects, normalized),
    };
  });

  invalidateEventQueries();
  return normalized;
};

const removeEventRowIdMapping = (eventId: EventIdentifier) => {
  if (typeof eventId === 'number') {
    eventRowIdByLocalId.delete(eventId);
    return;
  }

  for (const [localId, rowId] of eventRowIdByLocalId.entries()) {
    if (rowId === eventId) {
      eventRowIdByLocalId.delete(localId);
      return;
    }
  }
};

export const deleteEvent = async (eventId: EventIdentifier): Promise<{ id: EventIdentifier }> => {
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    try {
      const eventRowId = await getSupabaseEventRowId(eventId);
      const receiptDelete = await supabase
        .from('receipts')
        .delete()
        .eq('event_id', eventRowId);

      if (receiptDelete.error) {
        throw receiptDelete.error;
      }

      const eventDelete = await supabase
        .from('events')
        .delete()
        .eq('id', eventRowId);

      if (eventDelete.error) {
        throw eventDelete.error;
      }

      removeEventRowIdMapping(eventId);
    } catch (error) {
      console.error('Failed to delete event from Supabase', error);
      throw new Error(EVENT_DELETE_ERROR_MESSAGE);
    }
  }

  updateLocalAppState((snapshot) => {
    const deletedEvent = typeof eventId === 'string'
      ? snapshot.events.find((event) => event.supabaseId === eventId)
      : snapshot.events.find((event) => event.id === eventId);
    const deletedLocalId = deletedEvent?.id ?? (typeof eventId === 'number' ? eventId : null);
    const nextEvents = typeof eventId === 'string'
      ? snapshot.events.filter((event) => event.supabaseId !== eventId)
      : snapshot.events.filter((event) => event.id !== eventId);
    const hasRemainingWithSameLocalId = deletedLocalId != null
      && nextEvents.some((event) => event.id === deletedLocalId);

    return {
      ...snapshot,
      events: nextEvents,
      timelogs: deletedLocalId != null && !hasRemainingWithSameLocalId
        ? snapshot.timelogs.filter((timelog) => timelog.eid !== deletedLocalId)
        : snapshot.timelogs,
      receipts: deletedLocalId != null && !hasRemainingWithSameLocalId
        ? snapshot.receipts.filter((receipt) => receipt.eid !== deletedLocalId)
        : snapshot.receipts,
    };
  });

  invalidateEventQueries();
  return { id: eventId };
};

export const getEventCrew = (eventId: number): Contractor[] => {
  ensureSupabaseEventsLoaded();
  requestSupabaseTimelogsHydration();
  const snapshot = getLocalAppState();
  const event = (snapshot.events ?? []).find((item) => item.id === eventId);
  if (!event) return [];

  const assignedProfileIds = getAssignedProfileIdsForEvent(
    event,
    snapshot.timelogs ?? [],
    snapshot.eventCrewAssignments ?? [],
  );

  const assignmentsByProfileId = new Map(
    (snapshot.eventCrewAssignments ?? [])
      .filter((assignment) => assignmentMatchesEvent(assignment, event))
      .map((assignment) => [assignment.contractorProfileId, assignment]),
  );
  const contractorsByProfileId = new Map(
    (snapshot.contractors ?? [])
      .filter((contractor) => contractor.profileId)
      .map((contractor) => [contractor.profileId as string, contractor]),
  );

  return [...assignedProfileIds]
    .map((profileId) => {
      const contractor = contractorsByProfileId.get(profileId);
      if (contractor) return contractor;

      const assignment = assignmentsByProfileId.get(profileId);
      if (!assignment) return null;

      return {
        id: Number.NaN,
        profileId: assignment.contractorProfileId,
        name: assignment.name,
        ii: assignment.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'C',
        bg: '#E6F1FB',
        fg: '#185FA5',
        tags: [],
        events: 0,
        rate: 0,
        phone: '',
        email: '',
        ico: '',
        dic: '',
        bank: '',
        city: '',
        reliable: true,
        note: '',
      } satisfies Contractor;
    })
    .filter((contractor): contractor is Contractor => Boolean(contractor));
};

export const removeContractorFromEvent = async (eventId: number, contractorProfileId: string) => {
  const currentSnapshot = getLocalAppState();
  const currentEvent = (currentSnapshot.events ?? []).find((item) => item.id === eventId);
  if (!currentEvent) {
    throw new Error('Akce nebyla nalezena.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(eventId);
    const rpc = await removeEventCrewRpc(eventRowId, contractorProfileId);
    if (rpc.event_id !== eventRowId || rpc.profile_id !== contractorProfileId) {
      console.error('Failed to validate refreshed Crew removal lifecycle state', {
        requestedEventId: eventRowId,
        requestedProfileId: contractorProfileId,
        rpcEventId: rpc.event_id,
        rpcProfileId: rpc.profile_id,
      });
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }
    await refreshEventLifecycleState();

    const refreshed = getLocalAppState();
    const refreshedEvent = (refreshed.events ?? []).find((item) => item.supabaseId === rpc.event_id);
    if (!refreshedEvent) {
      console.error('Failed to validate refreshed Crew removal lifecycle state', {
        requestedEventId: eventRowId,
        requestedProfileId: contractorProfileId,
        rpcEventId: rpc.event_id,
        rpcProfileId: rpc.profile_id,
      });
      throw new Error(CREW_LIFECYCLE_ERROR_MESSAGE);
    }

    return {
      event: refreshedEvent,
      timelogs: refreshed.timelogs ?? [],
    };
  }

  const matchingTimelogs = (currentSnapshot.timelogs ?? []).filter((timelog) => (
    timelog.eid === eventId && timelog.contractorProfileId === contractorProfileId
  ));
  if (matchingTimelogs.some((timelog) => !isDisposableTimelogStatus(timelog.status))) {
    throw new Error('Crew nelze odebrat, protože výkaz už byl odeslán ke kontrole.');
  }

  let nextEvent: Event | null = null;
  let nextTimelogs: Timelog[] = [];
  updateLocalAppState((snapshot) => {
    const event = snapshot.events.find((item) => item.id === eventId);
    if (!event) {
      throw new Error('Akce nebyla nalezena.');
    }

    nextTimelogs = snapshot.timelogs.filter((timelog) => !(
      timelog.eid === eventId
      && timelog.contractorProfileId === contractorProfileId
    ));
    const nextEventCrewAssignments = (snapshot.eventCrewAssignments ?? []).filter((assignment) => !(
      assignment.contractorProfileId === contractorProfileId
      && assignmentMatchesEvent(assignment, event)
    ));
    nextEvent = {
      ...event,
      filled: countAssignedCrewForEvent(nextTimelogs, eventId, nextEventCrewAssignments, event),
    };

    return {
      ...snapshot,
      events: snapshot.events.map((item) => item.id === eventId ? nextEvent as Event : item),
      timelogs: nextTimelogs,
      eventCrewAssignments: nextEventCrewAssignments,
      eventApplications: (snapshot.eventApplications ?? []).map((application) => (
        application.eventId === eventId && application.contractorProfileId === contractorProfileId
          ? { ...application, status: 'withdrawn' as const }
          : application
      )),
    };
  });

  invalidateEventQueries();
  return {
    event: nextEvent as Event,
    timelogs: nextTimelogs,
  };
};

export const getContractorConflictsForEvent = (
  event: Event,
  contractors = getLocalAppState().contractors,
) => {
  const snapshot = getLocalAppState();
  const eventDates = getDatesBetween(event.startDate, event.endDate);
  const eventDateSet = new Set(eventDates);

  return new Map<number, EventConflictDetail[]>(
    contractors.map((contractor) => {
      const overlappingTimelogs = snapshot.timelogs.filter((timelog) => (
        timelog.contractorProfileId === contractor.profileId
        && timelog.eid !== event.id
        && timelog.days.some((day) => eventDateSet.has(day.d))
      ));

      const conflictDetails = overlappingTimelogs.map((timelog) => {
        const relatedEvent = snapshot.events.find((item) => item.id === timelog.eid);
        const overlappingDates = [...new Set(
          timelog.days.map((day) => day.d).filter((date) => eventDateSet.has(date)),
        )].sort();

        return {
          eventName: relatedEvent?.name || `Akce #${timelog.eid}`,
          eventJob: relatedEvent?.job || '',
          startDate: overlappingDates[0],
          endDate: overlappingDates[overlappingDates.length - 1],
        };
      });

      return [contractor.id, conflictDetails] as const;
    }),
  );
};

export const buildTimelogDaysForEvent = (
  event: Event,
  phaseChoices?: Array<TimelogType | 'all'>,
): Timelog['days'][] => {
  const eventDates = getDatesBetween(event.startDate, event.endDate);
  const defaultFrom = event.startTime || DEFAULT_TIME_FROM;
  const defaultTo = event.endTime || DEFAULT_TIME_TO;
  const phaseSchedules = event.phaseSchedules || {};

  if (!event.showDayTypes) {
    return eventDates.map((date) => ({
      d: date,
      f: defaultFrom,
      t: defaultTo,
      type: 'instal' as TimelogType,
    }));
  }

  const dayTypes = event.dayTypes || {};
  if (!phaseChoices || phaseChoices.length === 0) return [];

  const includesAll = phaseChoices.includes('all');
  const selectedTypes = phaseChoices.filter((choice): choice is TimelogType => choice !== 'all');
  const activeTypes = includesAll ? EVENT_PHASE_TYPES : selectedTypes;

  return activeTypes
    .flatMap((phaseType) => {
      const slots = phaseSchedules[phaseType] || [];

      if (slots.length === 0) {
        return eventDates
          .filter((date) => dayTypes[date] === phaseType)
          .map((date) => ({
            d: date,
            f: event.phaseTimes?.[phaseType]?.from || defaultFrom,
            t: event.phaseTimes?.[phaseType]?.to || defaultTo,
            type: phaseType,
          }));
      }

      return slots.flatMap((slot: EventPhaseSlot) => slot.dates.map((date) => ({
        d: date,
        f: slot.from || defaultFrom,
        t: slot.to || defaultTo,
        type: phaseType,
      })));
    })
    .filter((day) => eventDates.includes(day.d))
    .sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`));
};

export const assignCrewToEvent = async (
  eventId: number,
  contractorProfileId: string,
  applicationSupabaseIdOrPhaseChoices?: string | null | Array<TimelogType | 'all'>,
  explicitPhaseChoices?: Array<TimelogType | 'all'>,
): Promise<EventAssignmentResult> => {
  const snapshot = getLocalAppState();
  const event = snapshot.events.find((item) => item.id === eventId);
  const contractor = getContractorByProfileId(contractorProfileId);
  const applicationSupabaseId = Array.isArray(applicationSupabaseIdOrPhaseChoices)
    ? null
    : applicationSupabaseIdOrPhaseChoices ?? null;
  const phaseChoices = Array.isArray(applicationSupabaseIdOrPhaseChoices)
    ? applicationSupabaseIdOrPhaseChoices
    : explicitPhaseChoices;

  if (!event) {
    throw new Error('Akce nebyla nalezena.');
  }

  if (!contractor) {
    throw new Error('Clen crew nebyl nalezen.');
  }

  const initialDays = buildTimelogDaysForEvent(event, phaseChoices);
  if (initialDays.length === 0) {
    throw new Error('Pro vybranou fazi nejsou na akci zadne dny.');
  }

  const hasCollision = snapshot.timelogs.some((timelog) => (
    timelog.contractorProfileId === contractorProfileId
    && timelog.eid !== event.id
    && timelog.days.some((day) => initialDays.some((newDay) => newDay.d === day.d))
  ));

  if (hasCollision) {
    throw new Error('Tento clen crew ma ve stejnem terminu jinou akci.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(event.id);
    const rpc = await assignEventCrewRpc({
      eventId: eventRowId,
      profileId: contractorProfileId,
      applicationId: applicationSupabaseId,
      days: initialDays,
    });
    if (rpc.event_id !== eventRowId || rpc.profile_id !== contractorProfileId) {
      throwAssignmentLifecycleValidationError({
        requestedEventId: eventRowId,
        requestedProfileId: contractorProfileId,
        rpc,
      });
    }
    await refreshEventLifecycleState();

    const refreshed = getLocalAppState();
    const refreshedEvent = (refreshed.events ?? []).find((item) => item.supabaseId === rpc.event_id);
    const canonicalTimelog = (refreshed.timelogs ?? []).find((item) => item.supabaseId === rpc.timelog_id);
    if (
      !refreshedEvent
      || !canonicalTimelog
      || canonicalTimelog.eventSupabaseId !== rpc.event_id
      || canonicalTimelog.contractorProfileId !== rpc.profile_id
      || canonicalTimelog.eid !== refreshedEvent.id
    ) {
      throwAssignmentLifecycleValidationError({
        requestedEventId: eventRowId,
        requestedProfileId: contractorProfileId,
        rpc,
        refreshedEvent,
        refreshedTimelog: canonicalTimelog,
      });
    }

    return {
      event: refreshedEvent,
      timelog: canonicalTimelog,
      rpc,
    };
  }

  const isAlreadyAssigned = snapshot.timelogs.some((timelog) => (
    timelog.eid === event.id && timelog.contractorProfileId === contractorProfileId
  ));

  if (isAlreadyAssigned) {
    throw new Error('Tento clen crew uz je na akci prirazen.');
  }

  const timelog: Timelog = {
    id: Math.max(0, ...snapshot.timelogs.map((item) => item.id)) + 1,
    eid: event.id,
    contractorProfileId,
    days: initialDays,
    km: 0,
    note: '',
    status: 'draft',
  };
  const nextTimelogs = [...snapshot.timelogs, timelog];

  const assignment: EventAssignmentResult = {
    event: {
      ...event,
      filled: countAssignedCrewForEvent(nextTimelogs, event.id, snapshot.eventCrewAssignments ?? [], event),
    },
    timelog,
  };

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    events: currentSnapshot.events.map((item) => item.id === eventId ? assignment.event : item),
    timelogs: [...currentSnapshot.timelogs, assignment.timelog],
    eventApplications: (currentSnapshot.eventApplications ?? []).map((application) => (
      application.eventId === eventId && application.contractorProfileId === contractorProfileId
        ? { ...application, status: 'approved' as const }
        : application
    )),
  }));

  invalidateEventQueries();
  return assignment;
};

export const subscribeToEventChanges = (listener: () => void): (() => void) => (
  (ensureSupabaseEventsLoaded(), subscribeToLocalAppState(() => listener()))
);

export const resetSupabaseEventsHydration = () => {
  eventsHydrationPromise = null;
  eventsLoaded = false;
};

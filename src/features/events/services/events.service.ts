import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapClient, mapEvent } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { getDatesBetween, getEventStatus } from '../../../utils';
import { Client, Contractor, Event, EventCrewAssignment, EventPhaseSlot, GrasonEventConfirmation, Project, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { EventAssignmentResult, EventConflictDetail, EventFilter, EventWithDerivedStatus } from '../types/events.types';

const DEFAULT_TIME_FROM = '08:00';
const DEFAULT_TIME_TO = '17:00';
const EVENT_PHASE_TYPES: TimelogType[] = ['instal', 'provoz', 'deinstal'];
type TimelogAssignmentRow = { event_id: string | null; contractor_id: string | null };
type EventAssignmentRow = { event_id: string | null; profile_id: string | null; assigned_at?: string | null };
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

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let eventsHydrationPromise: Promise<void> | null = null;
let eventsLoaded = false;
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

export const fetchEventsSnapshot = async (): Promise<Event[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().events ?? [];
  }

  const supabaseGrason = supabase as unknown as SupabaseGrasonClient;
  const [eventsResult, projectsResult, clientsResult, timelogsResult, eventAssignmentsResult, grasonConfirmationsResult] = await Promise.all([
    supabase.from('events').select('*').order('date_from').order('name'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('timelogs').select('event_id,contractor_id'),
    supabase.from('event_assignments').select('event_id,profile_id,assigned_at').order('assigned_at'),
    supabaseGrason.from('grason_event_confirmations').select('*').order('shift_date'),
  ]);

  const firstError = eventsResult.error ?? projectsResult.error ?? clientsResult.error ?? timelogsResult.error ?? eventAssignmentsResult.error;
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

  const eventCrewAssignments = eventAssignmentRows
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

  eventRowIdByLocalId.clear();
  eventRows.forEach((row, index) => {
    eventRowIdByLocalId.set(index + 1, row.id);
  });

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    events: supabaseEvents,
    eventCrewAssignments,
    grasonEventConfirmations,
  }));

  return supabaseEvents;
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

const invalidateEventQueries = () => {
  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.events.all, snapshot.events ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
  queryClient.setQueryData(queryKeys.receipts.all, snapshot.receipts ?? []);
  void queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.timelogs.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
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

  const result = await supabase
    .from('events')
    .select('id,date_from,name')
    .order('date_from')
    .order('name');

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
  crew_needed: event.needed,
  crew_filled: event.filled,
  status: event.status,
  description: event.description ?? null,
  contact_person: event.contactPerson ?? null,
  dresscode: event.dresscode ?? null,
  meeting_point: event.meetingLocation ?? null,
  show_day_types: event.showDayTypes ?? false,
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
    };
  }

  const eventTimelogs = (snapshot.timelogs ?? []).filter((timelog) => timelog.eid === event.id);
  const grasonConfirmations = getGrasonConfirmationsForEvent(event, snapshot.grasonEventConfirmations ?? []);
  const assignedCrewCount = getAssignedProfileIdsForEvent(
    event,
    eventTimelogs,
    snapshot.eventCrewAssignments ?? [],
  ).size;

  return {
    event: {
      ...event,
      filled: assignedCrewCount > 0 ? assignedCrewCount : event.filled,
    },
    timelogs: eventTimelogs,
    contractors: snapshot.contractors ?? [],
    receipts: (snapshot.receipts ?? []).filter((receipt) => receipt.eid === event.id),
    grasonConfirmations,
  };
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
    const exists = (getLocalAppState().events ?? []).some((item) => item.id === normalized.id);
    const payload = await toSupabaseEventPayload(normalized);

    if (exists) {
      const eventRowId = await getSupabaseEventRowId(normalized.id);
      const eventUpdate = await supabase
        .from('events')
        .update(payload)
        .eq('id', eventRowId);

      if (eventUpdate.error) {
        throw new Error(eventUpdate.error.message);
      }
    } else {
      const eventInsert = await supabase
        .from('events')
        .insert(payload)
        .select('id')
        .single();

      if (eventInsert.error) {
        throw new Error(eventInsert.error.message);
      }

      if (eventInsert.data?.id) {
        eventRowIdByLocalId.set(normalized.id, eventInsert.data.id);
      }
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
      timelogs: syncEventTimelogs(snapshot.timelogs, normalized),
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
    const eventRowId = await getSupabaseEventRowId(eventId);
    const eventTimelogs = await supabase
      .from('timelogs')
      .select('id')
      .eq('event_id', eventRowId);

    if (eventTimelogs.error) {
      throw new Error(eventTimelogs.error.message);
    }

    const timelogRowIds = (eventTimelogs.data ?? []).map((row) => row.id);

    if (timelogRowIds.length > 0) {
      const timelogDaysDelete = await supabase
        .from('timelog_days')
        .delete()
        .in('timelog_id', timelogRowIds);

      if (timelogDaysDelete.error) {
        throw new Error(timelogDaysDelete.error.message);
      }

      const timelogDelete = await supabase
        .from('timelogs')
        .delete()
        .in('id', timelogRowIds);

      if (timelogDelete.error) {
        throw new Error(timelogDelete.error.message);
      }
    }

    const receiptDelete = await supabase
      .from('receipts')
      .delete()
      .eq('event_id', eventRowId);

    if (receiptDelete.error) {
      throw new Error(receiptDelete.error.message);
    }

    const eventDelete = await supabase
      .from('events')
      .delete()
      .eq('id', eventRowId);

    if (eventDelete.error) {
      throw new Error(eventDelete.error.message);
    }

    removeEventRowIdMapping(eventId);
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

  return (snapshot.contractors ?? []).filter((contractor) => (
    Boolean(contractor.profileId && assignedProfileIds.has(contractor.profileId))
  ));
};

export const removeContractorFromEvent = async (eventId: number, contractorProfileId: string) => {
  let nextEvent: Event | null = null;
  let nextTimelogs: Timelog[] = [];
  let nextEventCrewAssignments: EventCrewAssignment[] = [];
  const currentSnapshot = getLocalAppState();
  const currentEvent = (currentSnapshot.events ?? []).find((item) => item.id === eventId);
  const hasCrewAssignment = Boolean(currentEvent && (currentSnapshot.eventCrewAssignments ?? []).some((assignment) => (
    assignment.contractorProfileId === contractorProfileId
    && assignmentMatchesEvent(assignment, currentEvent)
  )));

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(eventId);

    const timelogRows = await supabase
      .from('timelogs')
      .select('id')
      .eq('event_id', eventRowId)
      .eq('contractor_id', contractorProfileId);

    if (timelogRows.error) {
      throw new Error(timelogRows.error.message);
    }

    const timelogRowIds = (timelogRows.data ?? []).map((row) => row.id);

    if (timelogRowIds.length > 0) {
      const timelogDaysDelete = await supabase
        .from('timelog_days')
        .delete()
        .in('timelog_id', timelogRowIds);

      if (timelogDaysDelete.error) {
        throw new Error(timelogDaysDelete.error.message);
      }

      const timelogDelete = await supabase
        .from('timelogs')
        .delete()
        .in('id', timelogRowIds);

      if (timelogDelete.error) {
        throw new Error(timelogDelete.error.message);
      }
    }

    if (hasCrewAssignment) {
      const assignmentDelete = await supabase
        .from('event_assignments')
        .delete()
        .eq('event_id', eventRowId)
        .eq('profile_id', contractorProfileId);

      if (assignmentDelete.error) {
        throw new Error(assignmentDelete.error.message);
      }
    }
  }

  updateLocalAppState((snapshot) => {
    const event = snapshot.events.find((item) => item.id === eventId);
    if (!event) {
      throw new Error('Akce nebyla nalezena.');
    }

    nextTimelogs = snapshot.timelogs.filter((timelog) => !(
      timelog.eid === eventId
      && timelog.contractorProfileId === contractorProfileId
    ));
    nextEventCrewAssignments = (snapshot.eventCrewAssignments ?? []).filter((assignment) => !(
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
    };
  });

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured && nextEvent) {
    const eventRowId = await getSupabaseEventRowId(eventId);
    const eventUpdate = await supabase
      .from('events')
      .update({ crew_filled: nextEvent.filled })
      .eq('id', eventRowId);

    if (eventUpdate.error) {
      throw new Error(eventUpdate.error.message);
    }
  }

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
  phaseChoices?: Array<TimelogType | 'all'>,
): Promise<EventAssignmentResult> => {
  const snapshot = getLocalAppState();
  const event = snapshot.events.find((item) => item.id === eventId);
  const contractor = getContractorByProfileId(contractorProfileId);

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

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(event.id);

    const timelogInsert = await supabase
      .from('timelogs')
      .insert({
        event_id: eventRowId,
        contractor_id: contractorProfileId,
        km: 0,
        note: '',
        status: 'draft',
      })
      .select('id')
      .single();

    if (timelogInsert.error) {
      throw new Error(timelogInsert.error.message);
    }

    const timelogRowId = timelogInsert.data?.id;
    if (!timelogRowId) {
      throw new Error('Nepodarilo se vytvorit vykaz pro prirazeni crew.');
    }

    const timelogDaysInsert = await supabase
      .from('timelog_days')
      .insert(assignment.timelog.days.map((day) => ({
        timelog_id: timelogRowId,
        date: day.d,
        time_from: day.f,
        time_to: day.t,
        day_type: day.type,
      })));

    if (timelogDaysInsert.error) {
      throw new Error(timelogDaysInsert.error.message);
    }

    const eventUpdate = await supabase
      .from('events')
      .update({ crew_filled: assignment.event.filled })
      .eq('id', eventRowId);

    if (eventUpdate.error) {
      throw new Error(eventUpdate.error.message);
    }
  }

  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    events: currentSnapshot.events.map((item) => item.id === eventId ? assignment.event : item),
    timelogs: [...currentSnapshot.timelogs, assignment.timelog],
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

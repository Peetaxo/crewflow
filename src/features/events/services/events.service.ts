import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapClient, mapEvent } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { getDatesBetween, getEventStatus } from '../../../utils';
import { Client, Contractor, Event, EventApplication, EventApplicationStatus, EventCrewAssignment, EventPhaseSlot, Project, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { EventAssignmentResult, EventConflictDetail, EventFilter, EventWithDerivedStatus } from '../types/events.types';

const DEFAULT_TIME_FROM = '08:00';
const DEFAULT_TIME_TO = '17:00';
const EVENT_PHASE_TYPES: TimelogType[] = ['instal', 'provoz', 'deinstal'];
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
type EventTimelogRow = {
  id: string;
  contractor_id: string | null;
};
type EventIdentifier = number | string;

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
const eventRowIdByLocalId = new Map<number, string>();

const countAssignedCrewForEvent = (timelogs: Timelog[], eventId: number): number => (
  new Set(
    timelogs
      .filter((timelog) => timelog.eid === eventId && timelog.contractorProfileId)
      .map((timelog) => timelog.contractorProfileId as string),
  ).size
);

const matchesEventIdentifier = (event: Event, eventId: EventIdentifier): boolean => (
  typeof eventId === 'string'
    ? event.supabaseId === eventId
    : event.id === eventId
);

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

  const [eventsResult, projectsResult, clientsResult, applicationsResult, crewAssignmentsResult] = await Promise.all([
    supabase.from('events').select('*').order('date_from').order('name'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('event_applications').select('*').order('created_at'),
    supabase.rpc('list_event_crew_assignments'),
  ]);

  const firstError = eventsResult.error ?? projectsResult.error ?? clientsResult.error ?? applicationsResult.error ?? crewAssignmentsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRows = clientsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const eventRows = eventsResult.data ?? [];
  const applicationRows = (applicationsResult.data ?? []) as EventApplicationRow[];
  const crewAssignmentRows = (crewAssignmentsResult.data ?? []) as EventCrewAssignmentRow[];

  const clientsByUuid = new Map(
    clientRows.map((row, index) => [row.id, { ...mapClient(row), id: index + 1 }]),
  );
  const projectRowsByUuid = new Map(projectRows.map((row) => [row.id, row]));
  const supabaseEvents = eventRows.map((row, index) => {
    const project = row.project_id ? projectRowsByUuid.get(row.project_id) : undefined;
    const client = project?.client_id ? clientsByUuid.get(project.client_id) : undefined;

    return {
      ...mapEvent(row),
      id: index + 1,
      job: row.job_number ?? project?.job_number ?? '',
      client: row.client_name ?? client?.name ?? '',
    };
  });

  eventRowIdByLocalId.clear();
  eventRows.forEach((row, index) => {
    eventRowIdByLocalId.set(index + 1, row.id);
  });

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
  const eventCrewAssignments = crewAssignmentRows
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

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    events: supabaseEvents,
    eventApplications,
    eventCrewAssignments,
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
      applications: [],
      crewAssignments: [],
    };
  }

  const eventTimelogs = (snapshot.timelogs ?? []).filter((timelog) => timelog.eid === event.id);
  const eventReceipts = appDataSource === 'supabase' && event.supabaseId
    ? (snapshot.receipts ?? []).filter((receipt) => receipt.eventSupabaseId === event.supabaseId)
    : (snapshot.receipts ?? []).filter((receipt) => receipt.eid === event.id);
  const storedCrewAssignments = (snapshot.eventCrewAssignments ?? []).filter((assignment) => assignment.eventId === event.id);
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
      filled: event.filled,
    },
    timelogs: eventTimelogs,
    contractors: snapshot.contractors ?? [],
    receipts: eventReceipts,
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

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(event.id);
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
      throw new Error(applicationResult.error.message);
    }

    nextApplication = {
      ...nextApplication,
      supabaseId: applicationResult.data.id,
      eventSupabaseId: applicationResult.data.event_id,
      status: applicationResult.data.status,
      note: applicationResult.data.note ?? '',
      plannedFrom: applicationResult.data.planned_from ?? null,
      plannedTo: applicationResult.data.planned_to ?? null,
      createdAt: applicationResult.data.created_at,
    };
  }

  updateLocalAppState((currentSnapshot) => {
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
): Promise<EventApplication | null> => {
  const snapshot = getLocalAppState();
  const application = (snapshot.eventApplications ?? []).find((item) => item.id === applicationId);
  if (!application) {
    throw new Error('Prihlaska nebyla nalezena.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    if (!application.supabaseId) {
      throw new Error('Prihlaska nema UUID zaznam v Supabase.');
    }

    const updateResult = await supabase
      .from('event_applications')
      .update({ status })
      .eq('id', application.supabaseId)
      .select('*')
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  }

  const nextApplication = { ...application, status };
  updateLocalAppState((currentSnapshot) => ({
    ...currentSnapshot,
    eventApplications: (currentSnapshot.eventApplications ?? []).map((item) => (
      item.id === applicationId ? nextApplication : item
    )),
  }));

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

  return updateEventApplicationStatus(application.id, 'withdrawn');
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

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const eventRowId = await getSupabaseEventRowId(event.id);
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
      throw new Error(applicationResult.error.message);
    }

    nextApplication = {
      ...nextApplication,
      supabaseId: applicationResult.data.id,
      eventSupabaseId: applicationResult.data.event_id,
      status: applicationResult.data.status,
      note: applicationResult.data.note ?? '',
      plannedFrom: applicationResult.data.planned_from ?? null,
      plannedTo: applicationResult.data.planned_to ?? null,
      createdAt: applicationResult.data.created_at,
    };
  }

  updateLocalAppState((currentSnapshot) => {
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

  const event = (snapshot.events ?? []).find((item) => item.id === application.eventId);
  await assignCrewToEvent(
    application.eventId,
    application.contractorProfileId,
    event?.showDayTypes ? ['all'] : undefined,
  );
  await updateEventApplicationStatus(applicationId, 'approved');
};

export const approveEventWithdrawal = async (applicationId: number): Promise<void> => {
  const snapshot = getLocalAppState();
  const application = (snapshot.eventApplications ?? []).find((item) => item.id === applicationId);
  if (!application) {
    throw new Error('Zadost o odhlaseni nebyla nalezena.');
  }

  await removeContractorFromEvent(application.eventId, application.contractorProfileId);
  await updateEventApplicationStatus(applicationId, 'withdrawn');
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

const syncSupabaseEventTimelogDays = async (eventRowId: string, timelogs: Timelog[]) => {
  if (!supabase || timelogs.length === 0) return;

  const timelogRowsResult = await supabase
    .from('timelogs')
    .select('id,contractor_id')
    .eq('event_id', eventRowId);

  if (timelogRowsResult.error) {
    throw new Error(timelogRowsResult.error.message);
  }

  const timelogRows = (timelogRowsResult.data ?? []) as EventTimelogRow[];
  const timelogsByContractor = timelogs.reduce((acc, timelog) => {
    if (!timelog.contractorProfileId) return acc;
    const current = acc.get(timelog.contractorProfileId) ?? [];
    current.push(timelog);
    acc.set(timelog.contractorProfileId, current);
    return acc;
  }, new Map<string, Timelog[]>());

  for (const row of timelogRows) {
    if (!row.contractor_id) continue;
    const contractorTimelogs = timelogsByContractor.get(row.contractor_id);
    const timelog = contractorTimelogs?.shift();
    if (!timelog) continue;

    const timelogDaysDelete = await supabase
      .from('timelog_days')
      .delete()
      .eq('timelog_id', row.id);

    if (timelogDaysDelete.error) {
      throw new Error(timelogDaysDelete.error.message);
    }

    if (timelog.days.length === 0) continue;

    const timelogDaysInsert = await supabase
      .from('timelog_days')
      .insert(timelog.days.map((day) => ({
        timelog_id: row.id,
        date: day.d,
        time_from: day.f,
        time_to: day.t,
        day_type: day.type,
      })));

    if (timelogDaysInsert.error) {
      throw new Error(timelogDaysInsert.error.message);
    }
  }
};

export const saveEvent = async (event: Event): Promise<Event> => {
  const normalized = normalizeEvent(event);
  validateEvent(normalized);
  const syncedTimelogs = syncEventTimelogs(getLocalAppState().timelogs ?? [], normalized);

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const exists = (getLocalAppState().events ?? []).some((item) => item.id === normalized.id);
    const payload = await toSupabaseEventPayload(normalized);
    let eventRowId: string | null = null;

    if (exists) {
      eventRowId = await getSupabaseEventRowId(normalized.id);
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
        eventRowId = eventInsert.data.id;
        eventRowIdByLocalId.set(normalized.id, eventRowId);
      }
    }

    if (eventRowId) {
      await syncSupabaseEventTimelogDays(
        eventRowId,
        syncedTimelogs.filter((timelog) => timelog.eid === normalized.id),
      );
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
      timelogs: syncedTimelogs,
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
  const storedAssignments = (snapshot.eventCrewAssignments ?? []).filter((assignment) => assignment.eventId === eventId);
  if (storedAssignments.length > 0) {
    return storedAssignments
      .map((assignment) => (
        (snapshot.contractors ?? []).find((contractor) => contractor.profileId === assignment.contractorProfileId)
        ?? {
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
        }
      ));
  }

  return (snapshot.contractors ?? []).filter((contractor) => (
    (snapshot.timelogs ?? []).some((timelog) => (
      timelog.eid === eventId
      && timelog.contractorProfileId === contractor.profileId
    ))
  ));
};

export const removeContractorFromEvent = async (eventId: number, contractorProfileId: string) => {
  let nextEvent: Event | null = null;
  let nextTimelogs: Timelog[] = [];
  const contractor = getContractorByProfileId(contractorProfileId);

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
    nextEvent = {
      ...event,
      filled: countAssignedCrewForEvent(nextTimelogs, eventId),
    };

    return {
      ...snapshot,
      events: snapshot.events.map((item) => item.id === eventId ? nextEvent as Event : item),
      timelogs: nextTimelogs,
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
      filled: countAssignedCrewForEvent(nextTimelogs, event.id),
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

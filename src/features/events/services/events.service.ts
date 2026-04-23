import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapClient, mapEvent } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { getDatesBetween, getEventStatus } from '../../../utils';
import { Client, Contractor, Event, EventPhaseSlot, Project, ReceiptItem, Timelog, TimelogType } from '../../../types';
import { EventAssignmentResult, EventConflictDetail, EventFilter, EventWithDerivedStatus } from '../types/events.types';

const DEFAULT_TIME_FROM = '08:00';
const DEFAULT_TIME_TO = '17:00';
const EVENT_PHASE_TYPES: TimelogType[] = ['instal', 'provoz', 'deinstal'];

const createSlotId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

let eventsHydrationPromise: Promise<void> | null = null;
let eventsLoaded = false;
const eventRowIdByLocalId = new Map<number, string>();

export const fetchEventsSnapshot = async (): Promise<Event[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().events ?? [];
  }

  const [eventsResult, projectsResult, clientsResult] = await Promise.all([
    supabase.from('events').select('*').order('date_from').order('name'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('clients').select('*').order('name'),
  ]);

  const firstError = eventsResult.error ?? projectsResult.error ?? clientsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRows = clientsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const eventRows = eventsResult.data ?? [];

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

  return supabaseEvents;
};

const hydrateEventsFromSupabase = async (): Promise<void> => {
  const supabaseEvents = await fetchEventsSnapshot();
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    events: supabaseEvents,
  }));
};

const ensureSupabaseEventsLoaded = () => {
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

const getSupabaseEventRowId = async (localEventId: number): Promise<string> => {
  const mapped = eventRowIdByLocalId.get(localEventId);
  if (mapped) {
    return mapped;
  }

  const eventRows = await getSupabaseEventRows();
  eventRows.forEach((row, index) => {
    eventRowIdByLocalId.set(index + 1, row.id);
  });

  const rowId = eventRowIdByLocalId.get(localEventId);
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

export const getEventById = (id: number | null): Event | null => {
  ensureSupabaseEventsLoaded();
  if (id == null) return null;
  return (getLocalAppState().events ?? []).find((event) => event.id === id) ?? null;
};

export const getEventDetailData = (eventId: number | null): {
  event: Event | null;
  timelogs: Timelog[];
  contractors: Contractor[];
  receipts: ReceiptItem[];
} => {
  ensureSupabaseEventsLoaded();
  const snapshot = getLocalAppState();
  const event = eventId == null ? null : (snapshot.events ?? []).find((item) => item.id === eventId) ?? null;

  if (!event) {
    return {
      event: null,
      timelogs: [],
      contractors: snapshot.contractors ?? [],
      receipts: [],
    };
  }

  return {
    event,
    timelogs: (snapshot.timelogs ?? []).filter((timelog) => timelog.eid === event.id),
    contractors: snapshot.contractors ?? [],
    receipts: (snapshot.receipts ?? []).filter((receipt) => receipt.eid === event.id),
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

export const deleteEvent = async (eventId: number): Promise<{ id: number }> => {
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

    eventRowIdByLocalId.delete(eventId);
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    events: snapshot.events.filter((event) => event.id !== eventId),
    timelogs: snapshot.timelogs.filter((timelog) => timelog.eid !== eventId),
    receipts: snapshot.receipts.filter((receipt) => receipt.eid !== eventId),
  }));

  invalidateEventQueries();
  return { id: eventId };
};

export const getEventCrew = (eventId: number): Contractor[] => {
  ensureSupabaseEventsLoaded();
  const snapshot = getLocalAppState();
  return (snapshot.contractors ?? []).filter((contractor) => (
    (snapshot.timelogs ?? []).some((timelog) => (
      timelog.eid === eventId
      && (timelog.contractorProfileId === contractor.profileId || timelog.cid === contractor.id)
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

    nextEvent = {
      ...event,
      filled: Math.max(0, event.filled - 1),
    };
    nextTimelogs = snapshot.timelogs.filter((timelog) => !(
      timelog.eid === eventId
      && (timelog.contractorProfileId === contractorProfileId || (contractor && timelog.cid === contractor.id))
    ));

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
        (timelog.contractorProfileId === contractor.profileId || timelog.cid === contractor.id)
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
    (timelog.contractorProfileId === contractorProfileId || timelog.cid === contractor.id)
    && timelog.eid !== event.id
    && timelog.days.some((day) => initialDays.some((newDay) => newDay.d === day.d))
  ));

  if (hasCollision) {
    throw new Error('Tento clen crew ma ve stejnem terminu jinou akci.');
  }

  const assignment: EventAssignmentResult = {
    event: {
      ...event,
      filled: Math.min(event.needed, event.filled + 1),
    },
    timelog: {
      id: Math.max(0, ...snapshot.timelogs.map((timelog) => timelog.id)) + 1,
      eid: event.id,
      cid: contractor.id,
      contractorProfileId,
      days: initialDays,
      km: 0,
      note: '',
      status: 'draft',
    },
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

import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapTimelog } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Contractor, Event, Timelog, TimelogStatus } from '../../../types';
import { getLifecycleSnapshotGeneration } from '../../event-lifecycle-generation';

type TimelogAction = 'sub' | 'ch' | 'coo' | 'rej';
type PersistedTimelogTarget = {
  localId: number;
  rowId: string;
};
let timelogsHydrationPromise: Promise<void> | null = null;
let timelogsLoaded = false;
let timelogSnapshotGeneration = 0;
const statusMap: Record<TimelogAction, TimelogStatus> = {
  sub: 'pending_ch',
  ch: 'pending_coo',
  coo: 'approved',
  rej: 'rejected',
};

const sortTimelogDays = (days: Timelog['days']) => (
  [...days].sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`))
);

const reconcilePersistedTimelog = (
  timelogs: Timelog[],
  events: Event[],
  persistedTimelog: Timelog,
  fallbackLocalId?: number,
): { timelogs: Timelog[]; timelog: Timelog } => {
  const matchesStableId = (timelog: Timelog) => (
    Boolean(persistedTimelog.supabaseId)
    && timelog.supabaseId === persistedTimelog.supabaseId
  );
  const matchesFallbackId = (timelog: Timelog) => (
    !timelog.supabaseId
    && fallbackLocalId !== undefined
    && timelog.id === fallbackLocalId
  );
  const matchesPersistedTimelog = (timelog: Timelog) => (
    matchesStableId(timelog) || matchesFallbackId(timelog)
  );
  const currentTimelog = timelogs.find(matchesStableId) ?? timelogs.find(matchesFallbackId);
  const currentEvent = persistedTimelog.eventSupabaseId
    ? events.find((event) => event.supabaseId === persistedTimelog.eventSupabaseId)
    : events.find((event) => event.id === persistedTimelog.eid);
  const canonicalTimelog = {
    ...persistedTimelog,
    id: currentTimelog?.id ?? Math.max(0, ...timelogs.map((timelog) => timelog.id)) + 1,
    eid: currentEvent?.id ?? currentTimelog?.eid ?? persistedTimelog.eid,
  };
  let inserted = false;
  const reconciledTimelogs = timelogs.flatMap((timelog) => {
    if (!matchesPersistedTimelog(timelog)) return [timelog];
    if (inserted) return [];
    inserted = true;
    return [canonicalTimelog];
  });

  if (!inserted) {
    reconciledTimelogs.push(canonicalTimelog);
  }

  return { timelogs: reconciledTimelogs, timelog: canonicalTimelog };
};

const matchesPersistedTimelogTarget = (
  timelog: Timelog,
  targets: PersistedTimelogTarget[],
): boolean => {
  if (timelog.supabaseId) {
    return targets.some((target) => target.rowId === timelog.supabaseId);
  }

  return targets.some((target) => target.localId === timelog.id);
};

const matchesSearch = (
  timelog: Timelog,
  query: string,
  contractors: Contractor[],
  events: Event[],
) => {
  if (!query) return true;

  const event = events.find((item) => item.id === timelog.eid);
  const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
  if (!event || !contractor) return false;

  return (
    event.name.toLowerCase().includes(query)
    || event.job.toLowerCase().includes(query)
    || contractor.name.toLowerCase().includes(query)
  );
};

const mapSupabaseTimelogs = (
  timelogRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'timelogs'>>>['data']>,
  timelogDayRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'timelog_days'>>>['data']>,
  profileRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'profiles'>>>['data']>,
  eventRows: NonNullable<Awaited<ReturnType<typeof supabase.from<'events'>>>['data']>,
) => {
  const profileIdMap = new Map(
    profileRows.map((row, index) => [row.id, index + 1]),
  );
  const eventIdMap = new Map(
    eventRows.map((row, index) => [row.id, index + 1]),
  );

  const timelogDayRowsByTimelogId = new Map<string, typeof timelogDayRows>();
  for (const dayRow of timelogDayRows) {
    const current = timelogDayRowsByTimelogId.get(dayRow.timelog_id) ?? [];
    current.push(dayRow);
    timelogDayRowsByTimelogId.set(dayRow.timelog_id, current);
  }

  return timelogRows.map((row, index) => ({
    ...mapTimelog(row, timelogDayRowsByTimelogId.get(row.id) ?? []),
    id: index + 1,
    supabaseId: row.id,
    eid: eventIdMap.get(row.event_id) ?? Number.NaN,
    eventSupabaseId: row.event_id,
    contractorProfileId: row.contractor_id,
  }));
};

export const loadTimelogsSnapshot = async (): Promise<Timelog[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().timelogs ?? [];
  }

  const [timelogsResult, timelogDaysResult, profilesResult, eventsResult] = await Promise.all([
    supabase.from('timelogs').select('*').order('created_at'),
    supabase.from('timelog_days').select('*').order('date'),
    supabase.from('profiles').select('id').order('last_name').order('first_name'),
    supabase.from('events').select('id').order('date_from').order('name').order('id'),
  ]);

  const firstError =
    timelogsResult.error ?? timelogDaysResult.error ?? profilesResult.error ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const supabaseTimelogs = mapSupabaseTimelogs(
    timelogsResult.data ?? [],
    timelogDaysResult.data ?? [],
    profilesResult.data ?? [],
    eventsResult.data ?? [],
  );

  return supabaseTimelogs;
};

export const fetchTimelogsSnapshot = async (): Promise<Timelog[]> => {
  const lifecycleGeneration = getLifecycleSnapshotGeneration();
  const timelogGeneration = timelogSnapshotGeneration;
  const supabaseTimelogs = await loadTimelogsSnapshot();

  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return supabaseTimelogs;
  }

  if (
    lifecycleGeneration !== getLifecycleSnapshotGeneration()
    || timelogGeneration !== timelogSnapshotGeneration
  ) {
    return getLocalAppState().timelogs ?? [];
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: supabaseTimelogs,
  }));

  return supabaseTimelogs;
};

const hydrateTimelogsFromSupabase = async (): Promise<void> => {
  await fetchTimelogsSnapshot();
};

export const ensureSupabaseTimelogsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (timelogsLoaded) {
    return;
  }

  if (timelogsHydrationPromise) {
    return;
  }

  timelogsHydrationPromise = hydrateTimelogsFromSupabase()
    .then(() => {
      timelogsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist timelogy ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      timelogsHydrationPromise = null;
    });
};

const syncTimelogQueryData = (timelogs: Timelog[]) => {
  queryClient.setQueryData(queryKeys.timelogs.all, timelogs);
};

const invalidateTimelogQueries = () => {
  syncTimelogQueryData(getLocalAppState().timelogs ?? []);
  void queryClient.invalidateQueries({ queryKey: queryKeys.timelogs.all });
};

const getSupabaseEventIdMap = async (): Promise<Map<number, string>> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const eventRowsQuery = supabase
    .from('events')
    .select('id')
    .order('date_from')
    .order('name');
  const result = typeof eventRowsQuery.order === 'function'
    ? await eventRowsQuery.order('id')
    : await eventRowsQuery;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return new Map((result.data ?? []).map((row, index) => [index + 1, row.id]));
};

const getSupabaseEventRowId = async ({
  eid,
  eventSupabaseId,
}: Pick<Timelog, 'eid' | 'eventSupabaseId'>): Promise<string | null> => {
  if (eventSupabaseId) {
    return eventSupabaseId;
  }

  const stableEventRowId = (getLocalAppState().events ?? [])
    .find((event) => event.id === eid)?.supabaseId;
  if (stableEventRowId) {
    return stableEventRowId;
  }

  return (await getSupabaseEventIdMap()).get(eid) ?? null;
};

const getSupabaseTimelogRowIds = async (): Promise<string[]> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const timelogRowsQuery = supabase
    .from('timelogs')
    .select('id')
    .order('created_at');
  const result = typeof timelogRowsQuery.order === 'function'
    ? await timelogRowsQuery.order('id')
    : await timelogRowsQuery;

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((row) => row.id);
};

const getSupabaseTimelogRowId = async (
  localTimelogId: number,
  preferredSupabaseId?: string,
): Promise<string> => {
  if (preferredSupabaseId) {
    return preferredSupabaseId;
  }

  const stableRowId = (getLocalAppState().timelogs ?? [])
    .find((timelog) => timelog.id === localTimelogId)?.supabaseId;
  if (stableRowId) {
    return stableRowId;
  }

  const timelogRowIds = await getSupabaseTimelogRowIds();
  const rowId = timelogRowIds[localTimelogId - 1];

  if (!rowId) {
    throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
  }

  return rowId;
};

const persistSupabaseTimelogStatus = async (
  localTimelogIds: number[],
  nextStatus: TimelogStatus,
): Promise<PersistedTimelogTarget[] | null> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return null;
  }

  const timelogsByLocalId = new Map(
    (getLocalAppState().timelogs ?? []).map((timelog) => [timelog.id, timelog]),
  );
  const requiresLegacyLookup = localTimelogIds.some(
    (localId) => !timelogsByLocalId.get(localId)?.supabaseId,
  );
  const timelogRowIds = requiresLegacyLookup ? await getSupabaseTimelogRowIds() : [];
  const targets = localTimelogIds.map((localId) => {
    const rowId = timelogsByLocalId.get(localId)?.supabaseId ?? timelogRowIds[localId - 1];
    if (!rowId) {
      throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
    }
    return { localId, rowId };
  });
  const rowIds = Array.from(new Set(targets.map((target) => target.rowId)));

  await Promise.all(rowIds.map(async (rowId) => {
    const result = await supabase
      .from('timelogs')
      .update({ status: nextStatus })
      .eq('id', rowId)
      .select('id');

    if (result.error) {
      throw new Error(result.error.message);
    }

    if ((result.data ?? []).length === 0) {
      throw new Error('Nepodarilo se aktualizovat vykaz v databazi.');
    }
  }));

  timelogSnapshotGeneration += 1;
  return targets;
};

export const getTimelogs = (search = ''): Timelog[] => {
  ensureSupabaseTimelogsLoaded();
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();
  const safeTimelogs = snapshot.timelogs ?? [];
  const safeContractors = snapshot.contractors ?? [];
  const safeEvents = snapshot.events ?? [];

  if (!query) return safeTimelogs;

  return safeTimelogs.filter((timelog) => (
    matchesSearch(timelog, query, safeContractors, safeEvents)
  ));
};

export const getTimelogById = (id: number | null): Timelog | null => {
  ensureSupabaseTimelogsLoaded();
  if (id == null) return null;
  return (getLocalAppState().timelogs ?? []).find((timelog) => timelog.id === id) ?? null;
};

export const getTimelogDependencies = (): { contractors: Contractor[]; events: Event[] } => {
  ensureSupabaseTimelogsLoaded();
  const snapshot = getLocalAppState();
  return {
    contractors: snapshot.contractors ?? [],
    events: snapshot.events ?? [],
  };
};

export const updateTimelogStatus = async (id: number, action: TimelogAction): Promise<Timelog> => {
  const nextStatus = statusMap[action];
  const persistedTargets = await persistSupabaseTimelogStatus([id], nextStatus);
  let updatedTimelog: Timelog | null = null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: (snapshot.timelogs ?? []).map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : timelog.id === id;
      if (!isTarget) return timelog;

      updatedTimelog = {
        ...timelog,
        status: nextStatus,
      };

      return updatedTimelog;
    }),
  }));

  if (!updatedTimelog) {
    throw new Error('Vykaz nebyl nalezen.');
  }

  invalidateTimelogQueries();
  return updatedTimelog;
};

export const approveAllTimelogsForEvent = async (eventId: number): Promise<Timelog[]> => {
  const approvedTimelogs: Timelog[] = [];
  const safeTimelogs = getLocalAppState().timelogs ?? [];
  const localTimelogIds = safeTimelogs
    .filter((timelog) => timelog.eid === eventId && timelog.status === 'pending_coo')
    .map((timelog) => timelog.id);

  if (localTimelogIds.length === 0) {
    return approvedTimelogs;
  }

  const persistedTargets = await persistSupabaseTimelogStatus(localTimelogIds, 'approved');

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: (snapshot.timelogs ?? []).map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : localTimelogIds.includes(timelog.id);
      if (!isTarget) return timelog;

      const approvedTimelog = {
        ...timelog,
        status: 'approved' as const,
      };

      approvedTimelogs.push(approvedTimelog);
      return approvedTimelog;
    }),
  }));

  invalidateTimelogQueries();
  return approvedTimelogs;
};

export const createTimelog = async (timelog: Omit<Timelog, 'id'>): Promise<Timelog> => {
  const normalizedTimelog: Timelog = {
    ...timelog,
    id: Math.max(0, ...(getLocalAppState().timelogs ?? []).map((item) => item.id)) + 1,
    days: sortTimelogDays(timelog.days),
  };
  let persistedTimelog = normalizedTimelog;

  if (normalizedTimelog.days.length === 0) {
    throw new Error('Vykaz musi obsahovat alespon jeden den.');
  }

  if (!normalizedTimelog.contractorProfileId) {
    throw new Error('Nepodarilo se dohledat UUID identitu clena crew.');
  }

  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && supabase) {
    const eventRowId = normalizedTimelog.eventSupabaseId;
    const currentEvent = (getLocalAppState().events ?? [])
      .find((event) => event.supabaseId === eventRowId);

    if (!eventRowId || !currentEvent) {
      throw new Error('Nepodarilo se sparovat akci s databazovym zaznamem.');
    }

    const timelogInsert = await supabase
      .from('timelogs')
      .insert({
        event_id: eventRowId,
        contractor_id: normalizedTimelog.contractorProfileId,
        km: normalizedTimelog.km,
        note: normalizedTimelog.note,
        status: normalizedTimelog.status,
      })
      .select('id')
      .single();

    if (timelogInsert.error) {
      throw new Error(timelogInsert.error.message);
    }

    const timelogRowId = timelogInsert.data?.id;
    if (!timelogRowId) {
      throw new Error('Nepodarilo se vytvorit vykaz v databazi.');
    }

    persistedTimelog = {
      ...normalizedTimelog,
      eid: currentEvent.id,
      supabaseId: timelogRowId,
      eventSupabaseId: eventRowId,
    };

    const timelogDaysInsert = await supabase
      .from('timelog_days')
      .insert(normalizedTimelog.days.map((day) => ({
        timelog_id: timelogRowId,
        date: day.d,
        time_from: day.f,
        time_to: day.t,
        day_type: day.type,
        note: day.note?.trim() || null,
      })));

    if (timelogDaysInsert.error) {
      throw new Error(timelogDaysInsert.error.message);
    }

    timelogSnapshotGeneration += 1;
  }

  updateLocalAppState((snapshot) => {
    if (persistsToSupabase) {
      const reconciled = reconcilePersistedTimelog(
        snapshot.timelogs ?? [],
        snapshot.events ?? [],
        persistedTimelog,
      );
      persistedTimelog = reconciled.timelog;
      return {
        ...snapshot,
        timelogs: reconciled.timelogs,
      };
    }

    return {
      ...snapshot,
      timelogs: [...(snapshot.timelogs ?? []), persistedTimelog],
    };
  });

  invalidateTimelogQueries();
  return persistedTimelog;
};

export const saveTimelog = async (updated: Timelog): Promise<Timelog> => {
  const snapshot = getLocalAppState();
  const safeTimelogs = snapshot.timelogs ?? [];
  const existingTimelog = updated.supabaseId
    ? safeTimelogs.find((timelog) => timelog.supabaseId === updated.supabaseId)
    : safeTimelogs.find((timelog) => timelog.id === updated.id);
  const snapshotEvent = existingTimelog
    ? (snapshot.events ?? []).find((event) => event.id === existingTimelog.eid)
    : undefined;
  const preferredEventSupabaseId = updated.eventSupabaseId
    ?? snapshotEvent?.supabaseId
    ?? existingTimelog?.eventSupabaseId;
  const canonicalEvent = preferredEventSupabaseId
    ? (snapshot.events ?? []).find((event) => event.supabaseId === preferredEventSupabaseId)
    : snapshotEvent;
  const normalizedTimelog = {
    ...updated,
    id: existingTimelog?.id ?? updated.id,
    eid: canonicalEvent?.id ?? existingTimelog?.eid ?? updated.eid,
    eventSupabaseId: preferredEventSupabaseId,
    days: sortTimelogDays(updated.days),
  };
  let persistedTimelog = normalizedTimelog;

  if (!existingTimelog) {
    const { id: _unsavedId, ...timelogToCreate } = normalizedTimelog;
    return createTimelog(timelogToCreate);
  }

  if (normalizedTimelog.days.length === 0) {
    await deleteTimelog(existingTimelog.id);
    return normalizedTimelog;
  }

  if (!normalizedTimelog.contractorProfileId) {
    throw new Error('Nepodarilo se dohledat UUID identitu clena crew.');
  }

  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && supabase) {
    const [timelogRowId, eventRowId] = await Promise.all([
      getSupabaseTimelogRowId(
        existingTimelog.id,
        updated.supabaseId ?? existingTimelog.supabaseId,
      ),
      getSupabaseEventRowId(normalizedTimelog),
    ]);
    const contractorRowId = normalizedTimelog.contractorProfileId;

    if (!contractorRowId || !eventRowId) {
      throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
    }

    const timelogUpdate = await supabase
      .from('timelogs')
      .update({
        event_id: eventRowId,
        contractor_id: contractorRowId,
        km: normalizedTimelog.km,
        note: normalizedTimelog.note,
        status: normalizedTimelog.status,
      })
      .eq('id', timelogRowId);

    if (timelogUpdate.error) {
      throw new Error(timelogUpdate.error.message);
    }

    const timelogDaysDelete = await supabase
      .from('timelog_days')
      .delete()
      .eq('timelog_id', timelogRowId);

    if (timelogDaysDelete.error) {
      throw new Error(timelogDaysDelete.error.message);
    }

    if (normalizedTimelog.days.length > 0) {
      const timelogDaysInsert = await supabase
        .from('timelog_days')
        .insert(normalizedTimelog.days.map((day) => ({
          timelog_id: timelogRowId,
          date: day.d,
          time_from: day.f,
          time_to: day.t,
          day_type: day.type,
          note: day.note?.trim() || null,
        })));

      if (timelogDaysInsert.error) {
        throw new Error(timelogDaysInsert.error.message);
      }
    }

    persistedTimelog = {
      ...normalizedTimelog,
      eid: (getLocalAppState().events ?? [])
        .find((event) => event.supabaseId === eventRowId)?.id ?? normalizedTimelog.eid,
      supabaseId: timelogRowId,
      eventSupabaseId: eventRowId,
    };

    timelogSnapshotGeneration += 1;
  }

  updateLocalAppState((snapshot) => {
    if (persistsToSupabase) {
      const reconciled = reconcilePersistedTimelog(
        snapshot.timelogs ?? [],
        snapshot.events ?? [],
        persistedTimelog,
        existingTimelog.id,
      );
      persistedTimelog = reconciled.timelog;
      return {
        ...snapshot,
        timelogs: reconciled.timelogs,
      };
    }

    return {
      ...snapshot,
      timelogs: snapshot.timelogs.map((timelog) => (
        timelog.id === existingTimelog.id ? persistedTimelog : timelog
      )),
    };
  });

  invalidateTimelogQueries();
  return persistedTimelog;
};

export const deleteTimelog = async (id: number): Promise<{ id: number }> => {
  let persistedTarget: PersistedTimelogTarget | null = null;
  let deletedLocalId = id;
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const timelogRowId = await getSupabaseTimelogRowId(id);
    persistedTarget = { localId: id, rowId: timelogRowId };

    const timelogDaysDelete = await supabase
      .from('timelog_days')
      .delete()
      .eq('timelog_id', timelogRowId);

    if (timelogDaysDelete.error) {
      throw new Error(timelogDaysDelete.error.message);
    }

    const timelogDelete = await supabase
      .from('timelogs')
      .delete()
      .eq('id', timelogRowId);

    if (timelogDelete.error) {
      throw new Error(timelogDelete.error.message);
    }

    timelogSnapshotGeneration += 1;
  }

  updateLocalAppState((snapshot) => {
    const deletedTimelog = persistedTarget
      ? snapshot.timelogs.find((timelog) => matchesPersistedTimelogTarget(timelog, [persistedTarget]))
      : snapshot.timelogs.find((timelog) => timelog.id === id);
    deletedLocalId = deletedTimelog?.id ?? id;

    return {
      ...snapshot,
      timelogs: snapshot.timelogs.filter((timelog) => (
        persistedTarget
          ? !matchesPersistedTimelogTarget(timelog, [persistedTarget])
          : timelog.id !== id
      )),
    };
  });

  invalidateTimelogQueries();
  return { id: deletedLocalId };
};

export const markApprovedTimelogsAsInvoiced = async (): Promise<Timelog[]> => {
  const updatedTimelogs: Timelog[] = [];
  const localTimelogIds = (getLocalAppState().timelogs ?? [])
    .filter((timelog) => timelog.status === 'approved')
    .map((timelog) => timelog.id);
  const persistedTargets = localTimelogIds.length > 0
    ? await persistSupabaseTimelogStatus(localTimelogIds, 'invoiced')
    : null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : localTimelogIds.includes(timelog.id);
      if (!isTarget) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'invoiced' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  invalidateTimelogQueries();
  return updatedTimelogs;
};

export const markTimelogsAsInvoiced = async (timelogIds: number[]): Promise<Timelog[]> => {
  const idSet = new Set(timelogIds);
  const updatedTimelogs: Timelog[] = [];

  const persistedTargets = timelogIds.length > 0
    ? await persistSupabaseTimelogStatus(timelogIds, 'invoiced')
    : null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : idSet.has(timelog.id);
      if (!isTarget) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'invoiced' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  invalidateTimelogQueries();
  return updatedTimelogs;
};

export const markTimelogsAsPaidForInvoice = async (
  eventId: number,
  contractorProfileId: string,
): Promise<Timelog[]> => {
  const updatedTimelogs: Timelog[] = [];
  const localTimelogIds = (getLocalAppState().timelogs ?? [])
    .filter((timelog) => timelog.eid === eventId && timelog.contractorProfileId === contractorProfileId && timelog.status === 'invoiced')
    .map((timelog) => timelog.id);

  const persistedTargets = localTimelogIds.length > 0
    ? await persistSupabaseTimelogStatus(localTimelogIds, 'paid')
    : null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : localTimelogIds.includes(timelog.id);
      if (!isTarget) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'paid' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  invalidateTimelogQueries();
  return updatedTimelogs;
};

export const markTimelogsAsPaid = async (timelogIds: number[]): Promise<Timelog[]> => {
  const idSet = new Set(timelogIds);
  const updatedTimelogs: Timelog[] = [];

  const persistedTargets = timelogIds.length > 0
    ? await persistSupabaseTimelogStatus(timelogIds, 'paid')
    : null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      const isTarget = persistedTargets
        ? matchesPersistedTimelogTarget(timelog, persistedTargets)
        : idSet.has(timelog.id);
      if (!isTarget) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'paid' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  invalidateTimelogQueries();
  return updatedTimelogs;
};

export const subscribeToTimelogChanges = (listener: () => void): (() => void) => {
  ensureSupabaseTimelogsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseTimelogsHydration = () => {
  timelogsHydrationPromise = null;
  timelogsLoaded = false;
};

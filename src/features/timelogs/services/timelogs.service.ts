import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { queryClient } from '../../../lib/query-client';
import { queryKeys } from '../../../lib/query-keys';
import { mapTimelog } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Contractor, Event, Timelog, TimelogStatus } from '../../../types';
import { getLifecycleSnapshotGeneration, runLifecycleDataMutation } from '../../event-lifecycle-generation';
import {
  deleteTimelogAtomicRpc,
  importApprovedTimelogAtomicRpc,
  saveTimelogAtomicRpc,
  transitionTimelogStatusesAtomicRpc,
} from './timelog-mutation-rpc.service';

type TimelogAction = 'sub' | 'ch' | 'coo' | 'rej';
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

const reloadAuthoritativeTimelogsAfterMutationFailure = async (): Promise<void> => {
  while (true) {
    const generationAtLoadStart = timelogSnapshotGeneration;
    const authoritativeTimelogs = await loadTimelogsSnapshot();

    if (generationAtLoadStart !== timelogSnapshotGeneration) {
      continue;
    }

    updateLocalAppState((snapshot) => ({
      ...snapshot,
      timelogs: authoritativeTimelogs,
    }));
    syncTimelogQueryData(authoritativeTimelogs);
    return;
  }
};

const runTimelogMutation = async <T,>(
  requestedKeys: string[],
  mutation: () => Promise<T>,
): Promise<T> => runLifecycleDataMutation(
  requestedKeys.map((key) => `timelog:${key}`),
  async () => {
    timelogSnapshotGeneration += 1;
    try {
      return await mutation();
    } catch (error) {
      if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
        try {
          await reloadAuthoritativeTimelogsAfterMutationFailure();
        } catch (reloadError) {
          console.error('Authoritative timelog reload failed after mutation error', reloadError);
        }
      }
      throw error;
    }
  },
);

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
    console.error('Unable to resolve legacy event identity for timelog mutation', result.error);
    throw new Error('Nepodařilo se spárovat výkaz s databázovým záznamem.');
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

const commitAuthoritativeTimelogSnapshot = (timelogs: Timelog[]) => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs,
  }));
  syncTimelogQueryData(timelogs);
};

const findTimelogForMutation = (
  localId: number,
  preferredSupabaseId?: string,
): Timelog | undefined => {
  const timelogs = getLocalAppState().timelogs ?? [];
  return preferredSupabaseId
    ? timelogs.find((timelog) => timelog.supabaseId === preferredSupabaseId)
    : timelogs.find((timelog) => timelog.id === localId);
};

const findTimelogForIdentity = (
  localId: number,
  preferredSupabaseId?: string,
  identityHint?: Pick<Timelog, 'eventSupabaseId' | 'contractorProfileId'>,
): Timelog | undefined => {
  if (preferredSupabaseId) {
    return findTimelogForMutation(localId, preferredSupabaseId);
  }

  const timelogs = getLocalAppState().timelogs ?? [];
  const localMatch = timelogs.find((timelog) => timelog.id === localId);
  const eventSupabaseId = identityHint?.eventSupabaseId;
  const contractorProfileId = identityHint?.contractorProfileId;
  if (!eventSupabaseId || !contractorProfileId) {
    return localMatch;
  }

  if (
    localMatch?.eventSupabaseId === eventSupabaseId
    && localMatch.contractorProfileId === contractorProfileId
  ) {
    return localMatch;
  }

  return timelogs.find((timelog) => (
    timelog.eventSupabaseId === eventSupabaseId
    && timelog.contractorProfileId === contractorProfileId
  ));
};

const getTimelogMutationKeys = (localId: number, supabaseId?: string): string[] => [
  `local:${localId}`,
  ...(supabaseId ? [`timelog:${supabaseId}`] : []),
];

const resolvePersistedTimelog = async (
  localId: number,
  preferredSupabaseId?: string,
  identityHint?: Pick<Timelog, 'eventSupabaseId' | 'contractorProfileId'>,
): Promise<Timelog> => {
  let timelog = findTimelogForIdentity(localId, preferredSupabaseId, identityHint);
  if (timelog?.supabaseId && timelog.updatedAt) {
    return timelog;
  }

  try {
    commitAuthoritativeTimelogSnapshot(await loadTimelogsSnapshot());
  } catch (error) {
    console.error('Unable to refresh timelog identity before mutation', error);
    throw new Error('Výkaz se nepodařilo načíst. Obnovte data a zkuste to znovu.');
  }

  timelog = findTimelogForIdentity(localId, preferredSupabaseId, identityHint ?? timelog);
  if (!timelog?.supabaseId || !timelog.updatedAt) {
    throw new Error('Výkaz už neexistuje nebo k němu nemáte přístup.');
  }

  return timelog;
};

const persistSupabaseTimelogStatus = async (
  localTimelogIds: number[],
  nextStatus: TimelogStatus,
): Promise<Timelog[] | null> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return null;
  }

  const initialTargets = localTimelogIds.map((localId) => ({
    localId,
    timelog: findTimelogForMutation(localId),
  }));
  const keys = initialTargets.flatMap(({ localId, timelog }) => (
    getTimelogMutationKeys(localId, timelog?.supabaseId)
  ));

  return runTimelogMutation(keys, async () => {
    const missingIdentity = initialTargets.find(({ timelog }) => (
      !timelog?.supabaseId || !timelog.updatedAt
    ));
    if (missingIdentity) {
      await resolvePersistedTimelog(
        missingIdentity.localId,
        missingIdentity.timelog?.supabaseId,
        missingIdentity.timelog,
      );
    }

    const targets = initialTargets.map(({ localId, timelog: initialTimelog }) => {
      const timelog = findTimelogForIdentity(
        localId,
        initialTimelog?.supabaseId,
        initialTimelog,
      );
      if (!timelog?.supabaseId || !timelog.updatedAt) {
        throw new Error('Výkaz už neexistuje nebo k němu nemáte přístup.');
      }
      return { localId, timelog };
    });
    const expectedStatuses = new Set(targets.map(({ timelog }) => timelog.status));
    if (expectedStatuses.size !== 1) {
      throw new Error('Vybrané výkazy nejsou ve stejném stavu. Obnovte data a zkuste to znovu.');
    }
    const expectedStatus = targets[0]?.timelog.status;
    if (!expectedStatus) {
      return [];
    }

    const results = await transitionTimelogStatusesAtomicRpc({
      targets: targets
        .map(({ timelog }) => ({
          id: timelog.supabaseId as string,
          expectedUpdatedAt: timelog.updatedAt as string,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      expectedStatus,
      nextStatus,
    });
    const resultsById = new Map(results.map((result) => [result.id, result]));
    if (resultsById.size !== targets.length) {
      throw new Error('Operaci s výkazy se nepodařilo dokončit.');
    }

    const persistedTargets = targets.map(({ localId, timelog }) => {
      const result = resultsById.get(timelog.supabaseId as string);
      if (!result) {
        throw new Error('Operaci s výkazy se nepodařilo dokončit.');
      }
      return {
        localId,
        rowId: result.id,
        status: result.status,
        updatedAt: result.updated_at,
      };
    });

    const updatedTimelogs: Timelog[] = [];
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      timelogs: (snapshot.timelogs ?? []).map((timelog) => {
        const persistedTarget = persistedTargets.find((target) => (
          target.rowId === timelog.supabaseId
          || (!timelog.supabaseId && target.localId === timelog.id)
        ));
        if (!persistedTarget) return timelog;

        const updatedTimelog = {
          ...timelog,
          status: persistedTarget.status,
          updatedAt: persistedTarget.updatedAt,
        };
        updatedTimelogs.push(updatedTimelog);
        return updatedTimelog;
      }),
    }));

    if (updatedTimelogs.length !== new Set(localTimelogIds).size) {
      throw new Error('Výkaz nebyl nalezen.');
    }

    invalidateTimelogQueries();
    return updatedTimelogs;
  });
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

const updateTimelogStatusesTo = async (
  ids: number[],
  nextStatus: TimelogStatus,
): Promise<Timelog[]> => {
  if (ids.length === 0) return [];

  const persistedTimelogs = await persistSupabaseTimelogStatus(ids, nextStatus);
  if (persistedTimelogs) {
    return persistedTimelogs;
  }

  return runTimelogMutation(ids.map((id) => `local:${id}`), async () => {
    const updatedTimelogs: Timelog[] = [];
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      timelogs: (snapshot.timelogs ?? []).map((timelog) => {
        if (!ids.includes(timelog.id)) return timelog;
        const updatedTimelog = { ...timelog, status: nextStatus };
        updatedTimelogs.push(updatedTimelog);
        return updatedTimelog;
      }),
    }));

    if (updatedTimelogs.length !== new Set(ids).size) {
      throw new Error('Výkaz nebyl nalezen.');
    }

    invalidateTimelogQueries();
    return updatedTimelogs;
  });
};

export const updateTimelogStatuses = async (
  ids: number[],
  action: TimelogAction,
): Promise<Timelog[]> => updateTimelogStatusesTo(ids, statusMap[action]);

export const updateTimelogStatus = async (id: number, action: TimelogAction): Promise<Timelog> => {
  const [updatedTimelog] = await updateTimelogStatuses([id], action);
  if (!updatedTimelog) {
    throw new Error('Výkaz nebyl nalezen.');
  }
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

  approvedTimelogs.push(...await updateTimelogStatusesTo(localTimelogIds, 'approved'));
  return approvedTimelogs;
};

export const createTimelog = async (timelog: Omit<Timelog, 'id'>): Promise<Timelog> => {
  const normalizedDays = sortTimelogDays(timelog.days);
  if (normalizedDays.length === 0) {
    throw new Error('Vykaz musi obsahovat alespon jeden den.');
  }

  if (!timelog.contractorProfileId) {
    throw new Error('Nepodarilo se dohledat UUID identitu clena crew.');
  }

  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (persistsToSupabase && !timelog.eventSupabaseId) {
    throw new Error('Nepodarilo se sparovat akci s databazovym zaznamem.');
  }
  const mutationKey = persistsToSupabase
    ? `create:${timelog.eventSupabaseId}:${timelog.contractorProfileId}`
    : 'local:create';

  return runTimelogMutation([mutationKey], async () => {
    const normalizedTimelog: Timelog = {
      ...timelog,
      id: Math.max(0, ...(getLocalAppState().timelogs ?? []).map((item) => item.id)) + 1,
      days: normalizedDays,
    };
    let persistedTimelog = normalizedTimelog;

    if (persistsToSupabase && supabase) {
      const eventRowId = normalizedTimelog.eventSupabaseId;
      const contractorProfileId = normalizedTimelog.contractorProfileId;
      if (!eventRowId || !contractorProfileId) {
        throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
      }
    const currentEvent = (getLocalAppState().events ?? [])
      .find((event) => event.supabaseId === eventRowId);

      if (!currentEvent) {
        throw new Error('Nepodarilo se sparovat akci s databazovym zaznamem.');
      }

      const result = await saveTimelogAtomicRpc({
        timelogId: null,
        eventId: eventRowId,
        contractorId: contractorProfileId,
        expectedUpdatedAt: null,
        expectedStatus: null,
        km: normalizedTimelog.km,
        note: normalizedTimelog.note,
        status: normalizedTimelog.status,
        days: normalizedTimelog.days,
      });

      persistedTimelog = {
        ...normalizedTimelog,
        eid: currentEvent.id,
        supabaseId: result.id,
        eventSupabaseId: eventRowId,
        updatedAt: result.updated_at,
        status: result.status,
      };
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
  });
};

type ApprovedTimelogImport = Omit<Timelog, 'id'> & { id?: number };

export const importApprovedTimelog = async (
  imported: ApprovedTimelogImport,
): Promise<Timelog> => {
  const normalizedDays = sortTimelogDays(imported.days);
  if (normalizedDays.length === 0) {
    throw new Error('Vykaz musi obsahovat alespon jeden den.');
  }
  if (!imported.eventSupabaseId || !imported.contractorProfileId) {
    throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
  }

  const initialSnapshot = getLocalAppState();
  const initialTimelog = imported.supabaseId
    ? (initialSnapshot.timelogs ?? []).find((timelog) => timelog.supabaseId === imported.supabaseId)
    : (initialSnapshot.timelogs ?? []).find((timelog) => (
      (imported.id !== undefined && timelog.id === imported.id)
      || (
        timelog.eventSupabaseId === imported.eventSupabaseId
        && timelog.contractorProfileId === imported.contractorProfileId
      )
    ));
  const normalizedImport: ApprovedTimelogImport = {
    ...imported,
    id: initialTimelog?.id ?? imported.id,
    eid: initialTimelog?.eid ?? imported.eid,
    days: normalizedDays,
    status: 'approved',
  };
  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  if (!persistsToSupabase) {
    if (initialTimelog) {
      return saveTimelog({
        ...initialTimelog,
        ...normalizedImport,
        id: initialTimelog.id,
      });
    }
    const { id: _unusedId, ...newTimelog } = normalizedImport;
    return createTimelog(newTimelog);
  }

  const mutationKeys = initialTimelog
    ? getTimelogMutationKeys(initialTimelog.id, initialTimelog.supabaseId)
    : [`create:${imported.eventSupabaseId}:${imported.contractorProfileId}`];

  return runTimelogMutation(mutationKeys, async () => {
    let currentTimelog = initialTimelog
      ? findTimelogForIdentity(
        initialTimelog.id,
        initialTimelog.supabaseId,
        initialTimelog,
      )
      : (getLocalAppState().timelogs ?? []).find((timelog) => (
        timelog.eventSupabaseId === imported.eventSupabaseId
        && timelog.contractorProfileId === imported.contractorProfileId
      ));
    if (currentTimelog && (!currentTimelog.supabaseId || !currentTimelog.updatedAt)) {
      currentTimelog = await resolvePersistedTimelog(
        currentTimelog.id,
        currentTimelog.supabaseId,
        currentTimelog,
      );
    }

    const result = await importApprovedTimelogAtomicRpc({
      timelogId: currentTimelog?.supabaseId ?? null,
      eventId: imported.eventSupabaseId,
      contractorId: imported.contractorProfileId,
      expectedUpdatedAt: currentTimelog?.updatedAt ?? null,
      expectedStatus: currentTimelog?.status ?? null,
      km: normalizedImport.km,
      note: normalizedImport.note,
      days: normalizedDays,
    });
    const currentEvent = (getLocalAppState().events ?? [])
      .find((event) => event.supabaseId === imported.eventSupabaseId);
    let persistedTimelog: Timelog = {
      ...normalizedImport,
      id: currentTimelog?.id
        ?? normalizedImport.id
        ?? Math.max(0, ...(getLocalAppState().timelogs ?? []).map((timelog) => timelog.id)) + 1,
      eid: currentEvent?.id ?? currentTimelog?.eid ?? normalizedImport.eid,
      supabaseId: result.id,
      eventSupabaseId: imported.eventSupabaseId,
      contractorProfileId: imported.contractorProfileId,
      updatedAt: result.updated_at,
      status: result.status,
    };

    updateLocalAppState((snapshot) => {
      const reconciled = reconcilePersistedTimelog(
        snapshot.timelogs ?? [],
        snapshot.events ?? [],
        persistedTimelog,
        currentTimelog?.id ?? normalizedImport.id,
      );
      persistedTimelog = reconciled.timelog;
      return { ...snapshot, timelogs: reconciled.timelogs };
    });
    invalidateTimelogQueries();
    return persistedTimelog;
  });
};

export const saveTimelog = async (updated: Timelog): Promise<Timelog> => {
  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  const findExistingTimelog = (timelogs: Timelog[]) => {
    if (updated.supabaseId) {
      return timelogs.find((timelog) => timelog.supabaseId === updated.supabaseId);
    }
    if (updated.eventSupabaseId && updated.contractorProfileId) {
      return timelogs.find((timelog) => (
        timelog.eventSupabaseId === updated.eventSupabaseId
        && timelog.contractorProfileId === updated.contractorProfileId
      ));
    }
    return timelogs.find((timelog) => timelog.id === updated.id);
  };

  let snapshot = getLocalAppState();
  let existingTimelog = findExistingTimelog(snapshot.timelogs ?? []);
  if (
    !existingTimelog
    && persistsToSupabase
    && updated.eventSupabaseId
    && updated.contractorProfileId
  ) {
    try {
      commitAuthoritativeTimelogSnapshot(await loadTimelogsSnapshot());
    } catch (error) {
      console.error('Unable to refresh timelog identity before save', error);
      throw new Error('Výkaz se nepodařilo načíst. Obnovte data a zkuste to znovu.');
    }
    snapshot = getLocalAppState();
    existingTimelog = findExistingTimelog(snapshot.timelogs ?? []);
  }
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

  const mutationKeys = getTimelogMutationKeys(existingTimelog.id, existingTimelog.supabaseId);

  return runTimelogMutation(mutationKeys, async () => {
    let currentTimelog = existingTimelog.supabaseId
      ? findTimelogForMutation(existingTimelog.id, existingTimelog.supabaseId)
      : findTimelogForMutation(existingTimelog.id);
    if (persistsToSupabase && (!currentTimelog?.supabaseId || !currentTimelog.updatedAt)) {
      currentTimelog = await resolvePersistedTimelog(
        existingTimelog.id,
        updated.supabaseId ?? existingTimelog.supabaseId,
        existingTimelog,
      );
    }
    if (!currentTimelog) {
      throw new Error('Výkaz už neexistuje nebo k němu nemáte přístup.');
    }

    let persistedTimelog: Timelog = {
      ...normalizedTimelog,
      id: currentTimelog.id,
      eid: currentTimelog.eid,
      supabaseId: currentTimelog.supabaseId,
      eventSupabaseId: normalizedTimelog.eventSupabaseId ?? currentTimelog.eventSupabaseId,
      contractorProfileId: normalizedTimelog.contractorProfileId
        ?? currentTimelog.contractorProfileId,
    };

    if (persistsToSupabase) {
      const timelogRowId = currentTimelog.supabaseId;
      const expectedUpdatedAt = currentTimelog.updatedAt;
      const eventRowId = await getSupabaseEventRowId(persistedTimelog);
      const contractorRowId = persistedTimelog.contractorProfileId;
      if (!timelogRowId || !expectedUpdatedAt || !contractorRowId || !eventRowId) {
        throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
      }

      const result = await saveTimelogAtomicRpc({
        timelogId: timelogRowId,
        eventId: eventRowId,
        contractorId: contractorRowId,
        expectedUpdatedAt,
        expectedStatus: currentTimelog.status,
        km: persistedTimelog.km,
        note: persistedTimelog.note,
        status: persistedTimelog.status,
        days: persistedTimelog.days,
      });

      persistedTimelog = {
        ...persistedTimelog,
        eid: (getLocalAppState().events ?? [])
          .find((event) => event.supabaseId === eventRowId)?.id ?? persistedTimelog.eid,
        supabaseId: result.id,
        eventSupabaseId: eventRowId,
        updatedAt: result.updated_at,
        status: result.status,
      };
    }

    updateLocalAppState((currentSnapshot) => {
      if (persistsToSupabase) {
        const reconciled = reconcilePersistedTimelog(
          currentSnapshot.timelogs ?? [],
          currentSnapshot.events ?? [],
          persistedTimelog,
          currentTimelog.id,
        );
        persistedTimelog = reconciled.timelog;
        return { ...currentSnapshot, timelogs: reconciled.timelogs };
      }

      return {
        ...currentSnapshot,
        timelogs: currentSnapshot.timelogs.map((timelog) => (
          timelog.id === currentTimelog.id ? persistedTimelog : timelog
        )),
      };
    });

    invalidateTimelogQueries();
    return persistedTimelog;
  });
};

export const deleteTimelog = async (id: number): Promise<{ id: number }> => {
  const persistsToSupabase = appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;
  const initialTimelog = findTimelogForMutation(id);
  if (!initialTimelog) {
    throw new Error('Výkaz nebyl nalezen.');
  }
  const mutationKeys = getTimelogMutationKeys(initialTimelog.id, initialTimelog.supabaseId);

  return runTimelogMutation(mutationKeys, async () => {
    let currentTimelog = initialTimelog.supabaseId
      ? findTimelogForMutation(initialTimelog.id, initialTimelog.supabaseId)
      : findTimelogForMutation(initialTimelog.id);
    if (persistsToSupabase && (!currentTimelog?.supabaseId || !currentTimelog.updatedAt)) {
      currentTimelog = await resolvePersistedTimelog(
        initialTimelog.id,
        initialTimelog.supabaseId,
        initialTimelog,
      );
    }
    if (!currentTimelog) {
      throw new Error('Výkaz už neexistuje nebo k němu nemáte přístup.');
    }

    if (persistsToSupabase) {
      if (!currentTimelog.supabaseId || !currentTimelog.updatedAt) {
        throw new Error('Výkaz už neexistuje nebo k němu nemáte přístup.');
      }
      await deleteTimelogAtomicRpc({
        id: currentTimelog.supabaseId,
        expectedUpdatedAt: currentTimelog.updatedAt,
        expectedStatus: currentTimelog.status,
      });
    }

    updateLocalAppState((snapshot) => ({
      ...snapshot,
      timelogs: snapshot.timelogs.filter((timelog) => (
        currentTimelog.supabaseId
          ? timelog.supabaseId !== currentTimelog.supabaseId
          : timelog.id !== currentTimelog.id
      )),
    }));
    invalidateTimelogQueries();
    return { id: currentTimelog.id };
  });
};

export const markApprovedTimelogsAsInvoiced = async (): Promise<Timelog[]> => {
  const localTimelogIds = (getLocalAppState().timelogs ?? [])
    .filter((timelog) => timelog.status === 'approved')
    .map((timelog) => timelog.id);
  return updateTimelogStatusesTo(localTimelogIds, 'invoiced');
};

export const markTimelogsAsInvoiced = async (timelogIds: number[]): Promise<Timelog[]> => {
  return updateTimelogStatusesTo(timelogIds, 'invoiced');
};

export const markTimelogsAsApproved = async (timelogIds: number[]): Promise<Timelog[]> => {
  return updateTimelogStatusesTo(timelogIds, 'approved');
};

export const markTimelogsAsPaidForInvoice = async (
  eventId: number,
  contractorProfileId: string,
): Promise<Timelog[]> => {
  const localTimelogIds = (getLocalAppState().timelogs ?? [])
    .filter((timelog) => timelog.eid === eventId && timelog.contractorProfileId === contractorProfileId && timelog.status === 'invoiced')
    .map((timelog) => timelog.id);

  return updateTimelogStatusesTo(localTimelogIds, 'paid');
};

export const markTimelogsAsPaid = async (timelogIds: number[]): Promise<Timelog[]> => {
  return updateTimelogStatusesTo(timelogIds, 'paid');
};

export const subscribeToTimelogChanges = (listener: () => void): (() => void) => {
  ensureSupabaseTimelogsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseTimelogsHydration = () => {
  timelogsHydrationPromise = null;
  timelogsLoaded = false;
};

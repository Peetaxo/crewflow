import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapTimelog } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Contractor, Event, Timelog, TimelogStatus } from '../../../types';

type TimelogAction = 'sub' | 'ch' | 'coo' | 'rej';
let timelogsHydrationPromise: Promise<void> | null = null;
let timelogsLoaded = false;
const statusMap: Record<TimelogAction, TimelogStatus> = {
  sub: 'pending_ch',
  ch: 'pending_coo',
  coo: 'approved',
  rej: 'rejected',
};

const sortTimelogDays = (days: Timelog['days']) => (
  [...days].sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`))
);

const matchesSearch = (
  timelog: Timelog,
  query: string,
  contractors: Contractor[],
  events: Event[],
) => {
  if (!query) return true;

  const event = events.find((item) => item.id === timelog.eid);
  const contractor = contractors.find((item) => item.id === timelog.cid);
  if (!event || !contractor) return false;

  return (
    event.name.toLowerCase().includes(query)
    || event.job.toLowerCase().includes(query)
    || contractor.name.toLowerCase().includes(query)
  );
};

const hydrateTimelogsFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const [timelogsResult, timelogDaysResult, profilesResult, eventsResult] = await Promise.all([
    supabase.from('timelogs').select('*').order('created_at'),
    supabase.from('timelog_days').select('*').order('date'),
    supabase.from('profiles').select('id').order('last_name').order('first_name'),
    supabase.from('events').select('id').order('date_from').order('name'),
  ]);

  const firstError =
    timelogsResult.error ?? timelogDaysResult.error ?? profilesResult.error ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const profileIdMap = new Map(
    (profilesResult.data ?? []).map((row, index) => [row.id, index + 1]),
  );
  const eventIdMap = new Map(
    (eventsResult.data ?? []).map((row, index) => [row.id, index + 1]),
  );

  const timelogDayRowsByTimelogId = new Map<string, typeof timelogDaysResult.data>();
  for (const dayRow of timelogDaysResult.data ?? []) {
    const current = timelogDayRowsByTimelogId.get(dayRow.timelog_id) ?? [];
    current.push(dayRow);
    timelogDayRowsByTimelogId.set(dayRow.timelog_id, current);
  }

  const supabaseTimelogs = (timelogsResult.data ?? []).map((row, index) => ({
    ...mapTimelog(row, timelogDayRowsByTimelogId.get(row.id) ?? []),
    id: index + 1,
    eid: eventIdMap.get(row.event_id) ?? Number.NaN,
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
  }));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: supabaseTimelogs,
  }));
};

const ensureSupabaseTimelogsLoaded = () => {
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

const getSupabaseTimelogRowIds = async (): Promise<string[]> => {
  if (!supabase) {
    throw new Error('Supabase klient neni dostupny.');
  }

  const result = await supabase
    .from('timelogs')
    .select('id')
    .order('created_at');

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []).map((row) => row.id);
};

const persistSupabaseTimelogStatus = async (
  localTimelogIds: number[],
  nextStatus: TimelogStatus,
): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const timelogRowIds = await getSupabaseTimelogRowIds();
  const rowIds = Array.from(new Set(localTimelogIds.map((localId) => {
    const rowId = timelogRowIds[localId - 1];
    if (!rowId) {
      throw new Error('Nepodarilo se sparovat vykaz s databazovym zaznamem.');
    }
    return rowId;
  })));

  await Promise.all(rowIds.map(async (rowId) => {
    const result = await supabase
      .from('timelogs')
      .update({ status: nextStatus })
      .eq('id', rowId);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }));
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
  await persistSupabaseTimelogStatus([id], nextStatus);
  let updatedTimelog: Timelog | null = null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: (snapshot.timelogs ?? []).map((timelog) => {
      if (timelog.id !== id) return timelog;

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

  await persistSupabaseTimelogStatus(localTimelogIds, 'approved');

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: (snapshot.timelogs ?? []).map((timelog) => {
      if (timelog.eid !== eventId || timelog.status !== 'pending_coo') return timelog;

      const approvedTimelog = {
        ...timelog,
        status: 'approved' as const,
      };

      approvedTimelogs.push(approvedTimelog);
      return approvedTimelog;
    }),
  }));

  return approvedTimelogs;
};

export const saveTimelog = (updated: Timelog): Timelog => {
  const normalizedTimelog = {
    ...updated,
    days: sortTimelogDays(updated.days),
  };

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => (
      timelog.id === updated.id ? normalizedTimelog : timelog
    )),
  }));

  return normalizedTimelog;
};

export const deleteTimelog = (id: number): { id: number } => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.filter((timelog) => timelog.id !== id),
  }));

  return { id };
};

export const markApprovedTimelogsAsInvoiced = (): Timelog[] => {
  const updatedTimelogs: Timelog[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      if (timelog.status !== 'approved') return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'invoiced' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  return updatedTimelogs;
};

export const markTimelogsAsInvoiced = (timelogIds: number[]): Timelog[] => {
  const idSet = new Set(timelogIds);
  const updatedTimelogs: Timelog[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      if (!idSet.has(timelog.id)) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'invoiced' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  return updatedTimelogs;
};

export const markTimelogsAsPaidForInvoice = (eventId: number, contractorId: number): Timelog[] => {
  const updatedTimelogs: Timelog[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      if (timelog.eid !== eventId || timelog.cid !== contractorId || timelog.status !== 'invoiced') return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'paid' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

  return updatedTimelogs;
};

export const markTimelogsAsPaid = (timelogIds: number[]): Timelog[] => {
  const idSet = new Set(timelogIds);
  const updatedTimelogs: Timelog[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      if (!idSet.has(timelog.id)) return timelog;

      const updatedTimelog = {
        ...timelog,
        status: 'paid' as const,
      };

      updatedTimelogs.push(updatedTimelog);
      return updatedTimelog;
    }),
  }));

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

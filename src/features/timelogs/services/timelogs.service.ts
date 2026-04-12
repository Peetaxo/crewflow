import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { Contractor, Event, Timelog, TimelogStatus } from '../../../types';

type TimelogAction = 'sub' | 'ch' | 'coo' | 'rej';

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

export const getTimelogs = (search = ''): Timelog[] => {
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();

  if (!query) return snapshot.timelogs;

  return snapshot.timelogs.filter((timelog) => (
    matchesSearch(timelog, query, snapshot.contractors, snapshot.events)
  ));
};

export const getTimelogById = (id: number | null): Timelog | null => {
  if (id == null) return null;
  return getLocalAppState().timelogs.find((timelog) => timelog.id === id) ?? null;
};

export const getTimelogDependencies = (): { contractors: Contractor[]; events: Event[] } => {
  const snapshot = getLocalAppState();
  return {
    contractors: snapshot.contractors,
    events: snapshot.events,
  };
};

export const updateTimelogStatus = (id: number, action: TimelogAction): Timelog => {
  const statusMap: Record<TimelogAction, TimelogStatus> = {
    sub: 'pending_ch',
    ch: 'pending_coo',
    coo: 'approved',
    rej: 'rejected',
  };

  let updatedTimelog: Timelog | null = null;

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
      if (timelog.id !== id) return timelog;

      updatedTimelog = {
        ...timelog,
        status: statusMap[action],
      };

      return updatedTimelog;
    }),
  }));

  if (!updatedTimelog) {
    throw new Error('Vykaz nebyl nalezen.');
  }

  return updatedTimelog;
};

export const approveAllTimelogsForEvent = (eventId: number): Timelog[] => {
  const approvedTimelogs: Timelog[] = [];

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    timelogs: snapshot.timelogs.map((timelog) => {
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

export const subscribeToTimelogChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);

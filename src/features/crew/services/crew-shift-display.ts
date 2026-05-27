import type { Event, Project, Timelog } from '../../../types';

export const resolveShiftProject = (event: Event | undefined, projects: Project[]): Project | null => {
  if (!event) return null;

  const project = projects.find((item) => (
    item.id === event.job || (event.projectId != null && item.supabaseId === event.projectId)
  ));

  if (project) return project;

  return {
    id: event.job || 'Bez projektu',
    name: event.job || event.name,
    client: event.client || 'Bez klienta',
    createdAt: event.startDate,
    note: '',
  };
};

const isPastEvent = (event: Event | undefined, today = new Date().toISOString().split('T')[0]) => (
  !event || event.endDate < today
);

export const categorizeCrewTimelogs = (timelogs: Timelog[], events: Event[]) => {
  const eventById = new Map(events.map((event) => [event.id, event]));

  return {
    upcoming: timelogs.filter((timelog) => (
      timelog.status === 'draft' && !isPastEvent(eventById.get(timelog.eid))
    )),
    processing: timelogs.filter((timelog) => (
      timelog.status === 'pending_ch'
      || timelog.status === 'pending_coo'
      || (timelog.status === 'draft' && isPastEvent(eventById.get(timelog.eid)))
    )),
    invoiced: timelogs.filter((timelog) => (
      timelog.status === 'approved'
      || timelog.status === 'invoiced'
      || timelog.status === 'paid'
    )),
  };
};

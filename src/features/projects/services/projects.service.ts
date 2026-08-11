import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapClient, mapProject } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { Client, Contractor, Event, Invoice, Project, Timelog } from '../../../types';
import { calculateMealAllowance, calculateTotalHours, getEventStatus } from '../../../utils';
import { ensureSupabaseCrewLoaded } from '../../crew/services/crew.service';
import { ensureSupabaseEventsLoaded } from '../../events/services/events.service';
import { ensureSupabaseTimelogsLoaded } from '../../timelogs/services/timelogs.service';

export type ProjectFilter = 'all' | 'upcoming' | 'past';

const normalizeProject = (project: Project): Project => ({
  ...project,
  id: project.id.trim().toUpperCase(),
  name: project.name.trim(),
  client: project.client.trim(),
  note: project.note?.trim() || '',
});

const getSupabaseClientRowIdByName = async (clientName: string): Promise<string | null> => {
  const normalizedClientName = clientName.trim();
  if (!normalizedClientName) {
    return null;
  }

  const existingClient = (getLocalAppState().clients ?? []).find((client) => client.name === normalizedClientName);
  if (existingClient?.supabaseId) {
    return existingClient.supabaseId;
  }

  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const clientLookup = await supabase
    .from('clients')
    .select('id')
    .eq('name', normalizedClientName)
    .limit(1)
    .maybeSingle();

  if (clientLookup.error) {
    throw new Error(clientLookup.error.message);
  }

  return clientLookup.data?.id ?? null;
};

const getSupabaseProjectRowId = async (project: Project): Promise<string> => {
  if (project.supabaseId) {
    return project.supabaseId;
  }

  const existingProject = (getLocalAppState().projects ?? []).find((item) => item.id === project.id);
  if (existingProject?.supabaseId) {
    return existingProject.supabaseId;
  }

  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const projectLookup = await supabase
    .from('projects')
    .select('id')
    .eq('job_number', project.id)
    .limit(1)
    .maybeSingle();

  if (projectLookup.error) {
    throw new Error(projectLookup.error.message);
  }

  if (!projectLookup.data?.id) {
    throw new Error('Nepodarilo se sparovat projekt s databazovym zaznamem.');
  }

  return projectLookup.data.id;
};

let projectsHydrationPromise: Promise<void> | null = null;
let projectsLoaded = false;

const hydrateProjectsFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const [projectsResult, clientsResult] = await Promise.all([
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('clients').select('*').order('name'),
  ]);

  const firstError = projectsResult.error ?? clientsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRows = clientsResult.data ?? [];
  const clientsByUuid = new Map(
    clientRows.map((row, index) => [row.id, { ...mapClient(row), id: index + 1 }]),
  );

  const supabaseProjects = (projectsResult.data ?? []).map((row) => normalizeProject(
    mapProject(row, row.client_id ? clientsByUuid.get(row.client_id)?.name : ''),
  ));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    projects: supabaseProjects,
  }));
};

const ensureSupabaseProjectsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (projectsLoaded) {
    return;
  }

  if (projectsHydrationPromise) {
    return;
  }

  projectsHydrationPromise = hydrateProjectsFromSupabase()
    .then(() => {
      projectsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist projekty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      projectsHydrationPromise = null;
    });
};

const ensureSupabaseProjectDependenciesLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  ensureSupabaseEventsLoaded();
  ensureSupabaseTimelogsLoaded();
  ensureSupabaseCrewLoaded();
};

const calculateProjectCrewCost = (
  projectEvents: Event[],
  timelogs: Timelog[],
  contractors: Contractor[],
) => {
  const projectEventIds = new Set(
    projectEvents.flatMap((event) => [event.id, event.supabaseId].filter(Boolean)),
  );

  return timelogs
    .filter((timelog) => projectEventIds.has(timelog.eid))
    .reduce((sum, timelog) => {
      const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId);
      const event = projectEvents.find((item) => item.id === timelog.eid || item.supabaseId === timelog.eid);
      return sum + (
        contractor
          ? calculateTotalHours(timelog.days) * contractor.rate + calculateMealAllowance(timelog.days, { enabled: Boolean(event?.mealAllowanceEnabled) })
          : 0
      );
    }, 0);
};

export const getProjects = (search = '', filter: ProjectFilter = 'all'): Project[] => {
  ensureSupabaseProjectsLoaded();
  ensureSupabaseProjectDependenciesLoaded();
  const snapshot = getLocalAppState();
  let projects = snapshot.projects ?? [];

  const query = search.trim().toLowerCase();
  if (query) {
    projects = projects.filter((project) => (
      project.id.toLowerCase().includes(query)
      || project.name.toLowerCase().includes(query)
      || project.client.toLowerCase().includes(query)
    ));
  }

  if (filter !== 'all') {
    const now = new Date().toISOString().split('T')[0];
    projects = projects.filter((project) => {
      const projectEvents = snapshot.events.filter((event) => event.job === project.id);
      const isUpcoming = projectEvents.some((event) => event.startDate >= now);
      return filter === 'upcoming' ? isUpcoming : !isUpcoming;
    });
  }

  return projects;
};

export const getProjectById = (id: string | null): Project | null => {
  ensureSupabaseProjectsLoaded();
  ensureSupabaseProjectDependenciesLoaded();
  if (!id) return null;
  return (getLocalAppState().projects ?? []).find((project) => project.id === id) ?? null;
};

export const getProjectDependencies = (): { projects: Project[]; events: Event[]; invoices: Invoice[]; clients: Client[] } => {
  ensureSupabaseProjectsLoaded();
  ensureSupabaseProjectDependenciesLoaded();
  const snapshot = getLocalAppState();
  return {
    projects: snapshot.projects ?? [],
    events: snapshot.events ?? [],
    invoices: snapshot.invoices ?? [],
    clients: snapshot.clients ?? [],
  };
};

export const createEmptyProject = (): Project => ({
  id: '',
  name: '',
  client: '',
  note: '',
  createdAt: new Date().toISOString().split('T')[0],
});

export const saveProject = async (project: Project): Promise<Project> => {
  let normalizedProject = normalizeProject(project);
  if (!normalizedProject.id || !normalizedProject.name) {
    throw new Error('Vyplnte Job Number a nazev projektu.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = (getLocalAppState().projects ?? []).some((item) => item.id === normalizedProject.id);
    const clientRowId = await getSupabaseClientRowIdByName(normalizedProject.client);
    const payload = {
      job_number: normalizedProject.id,
      name: normalizedProject.name,
      client_id: clientRowId,
      note: normalizedProject.note || null,
    };

    if (existing) {
      const projectRowId = await getSupabaseProjectRowId(normalizedProject);
      const projectUpdate = await supabase
        .from('projects')
        .update(payload)
        .eq('id', projectRowId);

      if (projectUpdate.error) {
        throw new Error(projectUpdate.error.message);
      }

      normalizedProject = {
        ...normalizedProject,
        supabaseId: projectRowId,
      };
    } else {
      const projectInsert = await supabase
        .from('projects')
        .insert(payload)
        .select('id')
        .single();

      if (projectInsert.error || !projectInsert.data?.id) {
        throw new Error(projectInsert.error?.message ?? 'Nepodarilo se vytvorit projekt v databazi.');
      }

      normalizedProject = {
        ...normalizedProject,
        supabaseId: projectInsert.data.id,
      };
    }
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.projects.some((item) => item.id === normalizedProject.id);
    return {
      ...snapshot,
      projects: exists
        ? snapshot.projects.map((item) => item.id === normalizedProject.id ? normalizedProject : item)
        : [...snapshot.projects, normalizedProject],
    };
  });

  return normalizedProject;
};

export const deleteProject = async (id: string): Promise<{ id: string }> => {
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = getLocalAppState().projects.find((project) => project.id === id);
    if (!existing) {
      throw new Error('Projekt nebyl nalezen.');
    }

    const projectRowId = await getSupabaseProjectRowId(existing);
    const projectDelete = await supabase
      .from('projects')
      .delete()
      .eq('id', projectRowId);

    if (projectDelete.error) {
      throw new Error(projectDelete.error.message);
    }
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    projects: snapshot.projects.filter((project) => project.id !== id),
  }));

  return { id };
};

export const getProjectRows = (search = '', filter: ProjectFilter = 'all') => {
  ensureSupabaseProjectsLoaded();
  const snapshot = getLocalAppState();
  const projects = getProjects(search, filter);
  const events = snapshot.events ?? [];
  const timelogs = snapshot.timelogs ?? [];
  const contractors = snapshot.contractors ?? [];

  return projects
    .map((project) => {
      const projectEvents = events.filter((event) => event.job === project.id);

      const status: 'upcoming' | 'full' | 'past' | 'empty' = projectEvents.length === 0
        ? 'empty'
        : projectEvents.some((event) => getEventStatus(event) === 'upcoming')
          ? 'upcoming'
          : projectEvents.some((event) => getEventStatus(event) === 'full')
            ? 'full'
            : 'past';

      return {
        id: project.id,
        name: project.name,
        client: project.client,
        status,
        eventCount: projectEvents.length,
        crewCost: calculateProjectCrewCost(projectEvents, timelogs, contractors),
        createdAt: project.createdAt,
      };
    })
    .sort((a, b) => {
      const statusOrder = { upcoming: 0, full: 1, empty: 2, past: 3 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
      return a.id.localeCompare(b.id);
    });
};

export const subscribeToProjectChanges = (listener: () => void): (() => void) => {
  ensureSupabaseProjectsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseProjectsHydration = () => {
  projectsHydrationPromise = null;
  projectsLoaded = false;
};

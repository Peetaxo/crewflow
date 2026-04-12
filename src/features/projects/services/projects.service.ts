import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { Client, Event, Invoice, Project } from '../../../types';
import { getEventStatus } from '../../../utils';

export type ProjectFilter = 'all' | 'upcoming' | 'past';

const normalizeProject = (project: Project): Project => ({
  ...project,
  id: project.id.trim().toUpperCase(),
  name: project.name.trim(),
  client: project.client.trim(),
  note: project.note?.trim() || '',
});

export const getProjects = (search = '', filter: ProjectFilter = 'all'): Project[] => {
  const snapshot = getLocalAppState();
  let projects = snapshot.projects;

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
  if (!id) return null;
  return getLocalAppState().projects.find((project) => project.id === id) ?? null;
};

export const getProjectDependencies = (): { events: Event[]; invoices: Invoice[]; clients: Client[] } => {
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events,
    invoices: snapshot.invoices,
    clients: snapshot.clients,
  };
};

export const createEmptyProject = (): Project => ({
  id: '',
  name: '',
  client: '',
  note: '',
  createdAt: new Date().toISOString().split('T')[0],
});

export const saveProject = (project: Project): Project => {
  const normalizedProject = normalizeProject(project);
  if (!normalizedProject.id || !normalizedProject.name) {
    throw new Error('Vyplnte Job Number a nazev projektu.');
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

export const deleteProject = (id: string): { id: string } => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    projects: snapshot.projects.filter((project) => project.id !== id),
  }));

  return { id };
};

export const getProjectRows = (search = '', filter: ProjectFilter = 'all') => {
  const snapshot = getLocalAppState();
  const projects = getProjects(search, filter);

  return projects
    .map((project) => {
      const projectEvents = snapshot.events.filter((event) => event.job === project.id);
      const projectInvoices = snapshot.invoices.filter((invoice) => invoice.job === project.id);

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
        crewCost: projectInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
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

export const subscribeToProjectChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);

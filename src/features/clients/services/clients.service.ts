import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { Client, Event, Invoice, Project } from '../../../types';

const normalizeClient = (client: Client): Client => ({
  ...client,
  name: client.name.trim(),
  ico: client.ico?.trim() || '',
  dic: client.dic?.trim() || '',
  street: client.street?.trim() || '',
  zip: client.zip?.trim() || '',
  city: client.city?.trim() || '',
  country: client.country?.trim() || '',
  note: client.note?.trim() || '',
});

export const getClients = (search = ''): Client[] => {
  const snapshot = getLocalAppState();
  const query = search.trim().toLowerCase();

  if (!query) return snapshot.clients;

  return snapshot.clients.filter((client) => (
    client.name.toLowerCase().includes(query) || client.city?.toLowerCase().includes(query)
  ));
};

export const getClientById = (id: number | null): Client | null => {
  if (id == null) return null;
  return getLocalAppState().clients.find((client) => client.id === id) ?? null;
};

export const getClientDependencies = (): { events: Event[]; invoices: Invoice[]; projects: Project[] } => {
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events,
    invoices: snapshot.invoices,
    projects: snapshot.projects,
  };
};

export const createEmptyClient = (): Client => ({
  id: Math.max(0, ...getLocalAppState().clients.map((client) => client.id)) + 1,
  name: '',
});

export const saveClient = (client: Client): Client => {
  const normalizedClient = normalizeClient(client);
  if (!normalizedClient.name) {
    throw new Error('Vyplnte nazev klienta.');
  }

  updateLocalAppState((snapshot) => {
    const exists = snapshot.clients.some((item) => item.id === normalizedClient.id);
    return {
      ...snapshot,
      clients: exists
        ? snapshot.clients.map((item) => item.id === normalizedClient.id ? normalizedClient : item)
        : [...snapshot.clients, normalizedClient],
    };
  });

  return normalizedClient;
};

export const deleteClient = (id: number): { id: number } => {
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    clients: snapshot.clients.filter((client) => client.id !== id),
  }));

  return { id };
};

export const getClientCards = (search = '') => {
  const snapshot = getLocalAppState();
  const clients = getClients(search);

  return clients.map((client) => ({
    ...client,
    eventCount: snapshot.events.filter((event) => event.client === client.name).length,
  }));
};

export const subscribeToClientChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);

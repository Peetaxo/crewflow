import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import { mapClient } from '../../../lib/supabase-mappers';
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

let clientsHydrationPromise: Promise<void> | null = null;
let clientsLoaded = false;

const hydrateClientsFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name');

  if (error) {
    throw new Error(error.message);
  }

  const supabaseClients = (data ?? []).map((row, index) => normalizeClient({
    ...mapClient(row),
    id: index + 1,
  }));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    clients: supabaseClients,
  }));
};

const ensureSupabaseClientsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (clientsLoaded) {
    return;
  }

  if (clientsHydrationPromise) {
    return;
  }

  clientsHydrationPromise = hydrateClientsFromSupabase()
    .then(() => {
      clientsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist klienty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      clientsHydrationPromise = null;
    });
};

export const getClients = (search = ''): Client[] => {
  ensureSupabaseClientsLoaded();
  const snapshot = getLocalAppState();
  const clients = snapshot.clients ?? [];
  const query = search.trim().toLowerCase();

  if (!query) return clients;

  return clients.filter((client) => (
    client.name.toLowerCase().includes(query) || client.city?.toLowerCase().includes(query)
  ));
};

export const getClientById = (id: number | null): Client | null => {
  ensureSupabaseClientsLoaded();
  if (id == null) return null;
  return getLocalAppState().clients.find((client) => client.id === id) ?? null;
};

export const getClientDependencies = (): { events: Event[]; invoices: Invoice[]; projects: Project[] } => {
  const snapshot = getLocalAppState();
  return {
    events: snapshot.events ?? [],
    invoices: snapshot.invoices ?? [],
    projects: snapshot.projects ?? [],
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
  ensureSupabaseClientsLoaded();
  const snapshot = getLocalAppState();
  const clients = getClients(search);
  const events = snapshot.events ?? [];

  return clients.map((client) => ({
    ...client,
    eventCount: events.filter((event) => event.client === client.name).length,
  }));
};

export const subscribeToClientChanges = (listener: () => void): (() => void) => {
  ensureSupabaseClientsLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseClientsHydration = () => {
  clientsHydrationPromise = null;
  clientsLoaded = false;
};

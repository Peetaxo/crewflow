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

const getSupabaseClientRowId = async (client: Client): Promise<string> => {
  if (client.supabaseId) {
    return client.supabaseId;
  }

  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovany.');
  }

  const clientLookup = await supabase
    .from('clients')
    .select('id')
    .eq('name', client.name)
    .limit(1)
    .maybeSingle();

  if (clientLookup.error) {
    throw new Error(clientLookup.error.message);
  }

  if (!clientLookup.data?.id) {
    throw new Error('Nepodarilo se sparovat klienta s databazovym zaznamem.');
  }

  return clientLookup.data.id;
};

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

export const saveClient = async (client: Client): Promise<Client> => {
  let normalizedClient = normalizeClient(client);
  if (!normalizedClient.name) {
    throw new Error('Vyplnte nazev klienta.');
  }

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = (getLocalAppState().clients ?? []).some((item) => item.id === normalizedClient.id);
    const payload = {
      name: normalizedClient.name,
      ico: normalizedClient.ico || null,
      dic: normalizedClient.dic || null,
      street: normalizedClient.street || null,
      zip: normalizedClient.zip || null,
      city: normalizedClient.city || null,
      country: normalizedClient.country || null,
    };

    if (existing) {
      const clientRowId = await getSupabaseClientRowId(normalizedClient);
      const clientUpdate = await supabase
        .from('clients')
        .update(payload)
        .eq('id', clientRowId);

      if (clientUpdate.error) {
        throw new Error(clientUpdate.error.message);
      }

      normalizedClient = {
        ...normalizedClient,
        supabaseId: clientRowId,
      };
    } else {
      const clientInsert = await supabase
        .from('clients')
        .insert(payload);

      if (clientInsert.error) {
        throw new Error(clientInsert.error.message);
      }
    }
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

export const deleteClient = async (id: number): Promise<{ id: number }> => {
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = getLocalAppState().clients.find((client) => client.id === id);
    if (!existing) {
      throw new Error('Klient nebyl nalezen.');
    }

    const clientRowId = await getSupabaseClientRowId(existing);
    const clientDelete = await supabase
      .from('clients')
      .delete()
      .eq('id', clientRowId);

    if (clientDelete.error) {
      throw new Error(clientDelete.error.message);
    }
  }

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

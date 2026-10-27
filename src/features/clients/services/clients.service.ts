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
let clientsHydrationEpoch = 0;

const assertClientsScope = (epoch: number) => {
  if (epoch !== clientsHydrationEpoch) throw new Error('Přístup ke klientům se změnil. Otevřete klienta znovu.');
};

const hydrateClientsFromSupabase = async (epoch: number): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('name');

  if (epoch !== clientsHydrationEpoch) return;

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

  const epoch = clientsHydrationEpoch;
  const request = hydrateClientsFromSupabase(epoch)
    .then(() => {
      if (epoch !== clientsHydrationEpoch) return;
      clientsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist klienty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      if (clientsHydrationPromise === request) clientsHydrationPromise = null;
    });
  clientsHydrationPromise = request;
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
  const epoch = clientsHydrationEpoch;
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
      assertClientsScope(epoch);
      const clientUpdate = await supabase
        .from('clients')
        .update(payload)
        .eq('id', clientRowId);

      assertClientsScope(epoch);
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

      assertClientsScope(epoch);
      if (clientInsert.error) {
        throw new Error(clientInsert.error.message);
      }
    }
  }

  assertClientsScope(epoch);
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
  const epoch = clientsHydrationEpoch;
  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const existing = getLocalAppState().clients.find((client) => client.id === id);
    if (!existing) {
      throw new Error('Klient nebyl nalezen.');
    }

    const clientRowId = await getSupabaseClientRowId(existing);
    assertClientsScope(epoch);
    const clientDelete = await supabase
      .from('clients')
      .delete()
      .eq('id', clientRowId);

    assertClientsScope(epoch);
    if (clientDelete.error) {
      throw new Error(clientDelete.error.message);
    }
  }

  assertClientsScope(epoch);
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
  clientsHydrationEpoch += 1;
  clientsHydrationPromise = null;
  clientsLoaded = false;
};

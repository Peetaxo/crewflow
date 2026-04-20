import {
  INITIAL_CANDIDATES,
  INITIAL_CLIENTS,
  INITIAL_CONTRACTORS,
  INITIAL_EVENTS,
  INITIAL_INVOICES,
  INITIAL_PROJECTS,
  INITIAL_RECEIPTS,
  INITIAL_TIMELOGS,
} from '@/data';
import type {
  Candidate,
  Client,
  Contractor,
  Event,
  Invoice,
  Project,
  ReceiptItem,
  Timelog,
} from '@/types';
import { mapCandidate, mapClient, mapContractor, mapEvent, mapInvoice, mapProject, mapReceipt, mapTimelog } from './supabase-mappers';
import { isSupabaseConfigured, supabase } from './supabase';

export interface AppDataSnapshot {
  events: Event[];
  contractors: Contractor[];
  timelogs: Timelog[];
  invoices: Invoice[];
  receipts: ReceiptItem[];
  candidates: Candidate[];
  projects: Project[];
  clients: Client[];
}

const cloneSnapshot = (snapshot: AppDataSnapshot): AppDataSnapshot => (
  JSON.parse(JSON.stringify(snapshot)) as AppDataSnapshot
);

type AppDataListener = (snapshot: AppDataSnapshot) => void;

let localAppState = cloneSnapshot({
  events: INITIAL_EVENTS,
  contractors: INITIAL_CONTRACTORS,
  timelogs: INITIAL_TIMELOGS,
  invoices: INITIAL_INVOICES,
  receipts: INITIAL_RECEIPTS,
  candidates: INITIAL_CANDIDATES,
  projects: INITIAL_PROJECTS,
  clients: INITIAL_CLIENTS,
});

const localAppListeners = new Set<AppDataListener>();

export function getLocalAppData(): AppDataSnapshot {
  return {
    events: INITIAL_EVENTS,
    contractors: INITIAL_CONTRACTORS,
    timelogs: INITIAL_TIMELOGS,
    invoices: INITIAL_INVOICES,
    receipts: INITIAL_RECEIPTS,
    candidates: INITIAL_CANDIDATES,
    projects: INITIAL_PROJECTS,
    clients: INITIAL_CLIENTS,
  };
}

export function getLocalAppState(): AppDataSnapshot {
  return cloneSnapshot(localAppState);
}

export function updateLocalAppState(
  updater: (snapshot: AppDataSnapshot) => AppDataSnapshot,
): AppDataSnapshot {
  localAppState = cloneSnapshot(updater(cloneSnapshot(localAppState)));
  const nextSnapshot = getLocalAppState();
  localAppListeners.forEach((listener) => listener(nextSnapshot));
  return nextSnapshot;
}

export function subscribeToLocalAppState(listener: AppDataListener): () => void {
  localAppListeners.add(listener);
  return () => {
    localAppListeners.delete(listener);
  };
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, number> {
  return new Map(rows.map((row, index) => [row.id, index + 1]));
}

export async function getSupabaseAppData(): Promise<AppDataSnapshot> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovane.');
  }

  const [
    clientsResult,
    projectsResult,
    profilesResult,
    eventsResult,
    timelogsResult,
    timelogDaysResult,
    invoicesResult,
    receiptsResult,
    candidatesResult,
  ] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('profiles').select('*').order('last_name').order('first_name'),
    supabase.from('events').select('*').order('date_from').order('name'),
    supabase.from('timelogs').select('*').order('created_at'),
    supabase.from('timelog_days').select('*').order('date'),
    supabase.from('invoices').select('*').order('created_at'),
    supabase.from('receipts').select('*').order('created_at'),
    supabase.from('candidates').select('*').order('created_at'),
  ]);

  const results = [
    clientsResult,
    projectsResult,
    profilesResult,
    eventsResult,
    timelogsResult,
    timelogDaysResult,
    invoicesResult,
    receiptsResult,
    candidatesResult,
  ];

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const clientRows = clientsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const profileRows = profilesResult.data ?? [];
  const eventRows = eventsResult.data ?? [];
  const timelogRows = timelogsResult.data ?? [];
  const timelogDayRows = timelogDaysResult.data ?? [];
  const invoiceRows = invoicesResult.data ?? [];
  const receiptRows = receiptsResult.data ?? [];
  const candidateRows = candidatesResult.data ?? [];

  const clients = clientRows.map((row, index) => ({
    ...mapClient(row),
    id: index + 1,
  }));
  const clientsByUuid = new Map(clientRows.map((row, index) => [row.id, clients[index]]));

  const projects = projectRows.map((row) => {
    const client = row.client_id ? clientsByUuid.get(row.client_id) : undefined;
    return mapProject(row, client?.name);
  });

  const profileIdMap = indexById(profileRows);
  const contractors = profileRows.map((row) => ({
    ...mapContractor(row),
    id: profileIdMap.get(row.id) ?? Number.NaN,
    profileId: row.id,
    userId: row.user_id,
  }));

  const eventIdMap = indexById(eventRows);
  const projectByUuid = new Map(projectRows.map((row) => [row.id, row]));
  const events = eventRows.map((row) => {
    const project = row.project_id ? projectByUuid.get(row.project_id) : undefined;
    return {
      ...mapEvent(row),
      id: eventIdMap.get(row.id) ?? Number.NaN,
      job: row.job_number ?? project?.job_number ?? '',
      client: row.client_name ?? '',
    };
  });

  const timelogDayRowsByTimelogId = new Map<string, typeof timelogDayRows>();
  for (const dayRow of timelogDayRows) {
    const current = timelogDayRowsByTimelogId.get(dayRow.timelog_id) ?? [];
    current.push(dayRow);
    timelogDayRowsByTimelogId.set(dayRow.timelog_id, current);
  }

  const timelogIdMap = indexById(timelogRows);
  const timelogs = timelogRows.map((row) => ({
    ...mapTimelog(row, timelogDayRowsByTimelogId.get(row.id) ?? []),
    id: timelogIdMap.get(row.id) ?? Number.NaN,
    eid: eventIdMap.get(row.event_id) ?? Number.NaN,
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
  }));

  const invoices = invoiceRows.map((row) => ({
    ...mapInvoice(row),
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : Number.NaN,
  }));

  const receiptIdMap = indexById(receiptRows);
  const receipts = receiptRows.map((row) => ({
    ...mapReceipt(row),
    id: receiptIdMap.get(row.id) ?? Number.NaN,
    cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : Number.NaN,
  }));

  const candidateIdMap = indexById(candidateRows);
  const candidates = candidateRows.map((row) => ({
    ...mapCandidate(row),
    id: candidateIdMap.get(row.id) ?? Number.NaN,
  }));

  return {
    events,
    contractors,
    timelogs,
    invoices,
    receipts,
    candidates,
    projects,
    clients,
  };
}

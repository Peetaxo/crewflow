import {
  INITIAL_CANDIDATES,
  INITIAL_CLIENTS,
  INITIAL_CONTRACTORS,
  INITIAL_EVENTS,
  INITIAL_BUDGET_ITEMS,
  INITIAL_BUDGET_PACKAGES,
  INITIAL_FLEET_RESERVATIONS,
  INITIAL_FLEET_VEHICLES,
  INITIAL_INVOICES,
  INITIAL_PROJECTS,
  INITIAL_RECEIPTS,
  INITIAL_TIMELOGS,
  INITIAL_WAREHOUSE_ITEMS,
  INITIAL_WAREHOUSE_RESERVATIONS,
} from '@/data';
import type {
  Candidate,
  Client,
  Contractor,
  Event,
  BudgetItem,
  BudgetPackage,
  FleetReservation,
  FleetVehicle,
  Invoice,
  Project,
  ReceiptItem,
  Timelog,
  WarehouseItem,
  WarehouseReservation,
  WarehouseReservationItem,
} from '@/types';
import { mapBudgetItem, mapBudgetPackage, mapCandidate, mapClient, mapContractor, mapEvent, mapFleetReservation, mapFleetVehicle, mapInvoice, mapProject, mapReceipt, mapTimelog } from './supabase-mappers';
import { isSupabaseConfigured, supabase } from './supabase';

export interface AppDataSnapshot {
  events: Event[];
  contractors: Contractor[];
  timelogs: Timelog[];
  invoices: Invoice[];
  receipts: ReceiptItem[];
  budgetPackages: BudgetPackage[];
  budgetItems: BudgetItem[];
  fleetVehicles: FleetVehicle[];
  fleetReservations: FleetReservation[];
  warehouseItems: WarehouseItem[];
  warehouseReservations: WarehouseReservation[];
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
  budgetPackages: INITIAL_BUDGET_PACKAGES,
  budgetItems: INITIAL_BUDGET_ITEMS,
  fleetVehicles: INITIAL_FLEET_VEHICLES,
  fleetReservations: INITIAL_FLEET_RESERVATIONS,
  warehouseItems: INITIAL_WAREHOUSE_ITEMS,
  warehouseReservations: INITIAL_WAREHOUSE_RESERVATIONS,
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
    budgetPackages: INITIAL_BUDGET_PACKAGES,
    budgetItems: INITIAL_BUDGET_ITEMS,
    fleetVehicles: INITIAL_FLEET_VEHICLES,
    fleetReservations: INITIAL_FLEET_RESERVATIONS,
    warehouseItems: INITIAL_WAREHOUSE_ITEMS,
    warehouseReservations: INITIAL_WAREHOUSE_RESERVATIONS,
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

type SupabaseUntypedResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type SupabaseUntyped = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string) => Promise<SupabaseUntypedResult>;
    };
  };
};

interface WarehouseItemRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  currency: string | null;
  price_period_label: string | null;
  quantity_total: number;
  owner_client_id: string | null;
  owner_label: string | null;
  status: WarehouseItem['status'];
  booqable_product_id: string | null;
  booqable_product_path: string | null;
}

interface WarehouseReservationItemRow {
  id: string;
  reservation_id: string;
  warehouse_item_id: string;
  quantity: number;
  unit_price_cents: number;
  price_period_label: string | null;
  line_total_cents: number;
  item_name_snapshot: string;
}

interface WarehouseReservationRow {
  id: string;
  project_id: string | null;
  project_job_number: string;
  event_id: string | null;
  event_local_id: number | null;
  reserved_by_profile_id: string | null;
  starts_at: string;
  ends_at: string;
  status: WarehouseReservation['status'];
  note: string | null;
  total_cents: number;
  currency: string | null;
  booqable_order_id: string | null;
}

function normalizeWarehouseCurrency(currency: string | null): 'CZK' {
  if (currency === 'CZK') {
    return currency;
  }
  return 'CZK';
}

function getWarehouseFallbackData(): Pick<AppDataSnapshot, 'warehouseItems' | 'warehouseReservations'> {
  const snapshot = getLocalAppState();
  return {
    warehouseItems: snapshot.warehouseItems ?? INITIAL_WAREHOUSE_ITEMS,
    warehouseReservations: snapshot.warehouseReservations ?? INITIAL_WAREHOUSE_RESERVATIONS,
  };
}

function mapWarehouseItem(row: WarehouseItemRow): WarehouseItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    imageUrl: row.image_url,
    priceCents: row.price_cents,
    currency: normalizeWarehouseCurrency(row.currency),
    pricePeriodLabel: row.price_period_label,
    quantityTotal: row.quantity_total,
    ownerClientId: row.owner_client_id,
    ownerLabel: row.owner_label,
    status: row.status,
    booqableProductId: row.booqable_product_id,
    booqableProductPath: row.booqable_product_path,
  };
}

function mapWarehouseReservationItem(row: WarehouseReservationItemRow): WarehouseReservationItem {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    warehouseItemId: row.warehouse_item_id,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    pricePeriodLabel: row.price_period_label,
    lineTotalCents: row.line_total_cents,
    itemNameSnapshot: row.item_name_snapshot,
  };
}

function mapWarehouseReservation(
  row: WarehouseReservationRow,
  items: WarehouseReservationItemRow[],
): WarehouseReservation {
  return {
    id: row.id,
    projectId: row.project_id,
    projectJobNumber: row.project_job_number,
    eventId: row.event_id,
    eventLocalId: row.event_local_id,
    reservedByProfileId: row.reserved_by_profile_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    note: row.note ?? '',
    totalCents: row.total_cents,
    currency: normalizeWarehouseCurrency(row.currency),
    booqableOrderId: row.booqable_order_id,
    items: items.map(mapWarehouseReservationItem),
  };
}

export async function getSupabaseAppData(): Promise<AppDataSnapshot> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase neni nakonfigurovane.');
  }

  const supabaseUntyped = supabase as unknown as SupabaseUntyped;

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
    budgetPackagesResult,
    budgetPackageEventsResult,
    budgetItemsResult,
    fleetVehiclesResult,
    fleetReservationsResult,
    warehouseItemsResult,
    warehouseReservationsResult,
    warehouseReservationItemsResult,
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
    supabase.from('budget_packages').select('*').order('created_at'),
    supabase.from('budget_package_events').select('*').order('created_at'),
    supabase.from('budget_items').select('*').order('created_at'),
    supabase.from('fleet_vehicles').select('*').order('name'),
    supabase.from('fleet_reservations').select('*').order('starts_at'),
    supabaseUntyped.from('warehouse_items').select('*').order('name'),
    supabaseUntyped.from('warehouse_reservations').select('*').order('starts_at'),
    supabaseUntyped.from('warehouse_reservation_items').select('*').order('created_at'),
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
    budgetPackagesResult,
    budgetPackageEventsResult,
    budgetItemsResult,
    fleetVehiclesResult,
    fleetReservationsResult,
  ];

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const warehouseResults = [
    warehouseItemsResult,
    warehouseReservationsResult,
    warehouseReservationItemsResult,
  ];
  const useWarehouseFallback = warehouseResults.some((result) => result.error);

  const clientRows = clientsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const profileRows = profilesResult.data ?? [];
  const eventRows = eventsResult.data ?? [];
  const timelogRows = timelogsResult.data ?? [];
  const timelogDayRows = timelogDaysResult.data ?? [];
  const invoiceRows = invoicesResult.data ?? [];
  const receiptRows = receiptsResult.data ?? [];
  const candidateRows = candidatesResult.data ?? [];
  const budgetPackageRows = budgetPackagesResult.data ?? [];
  const budgetPackageEventRows = budgetPackageEventsResult.data ?? [];
  const budgetItemRows = budgetItemsResult.data ?? [];
  const fleetVehicleRows = fleetVehiclesResult.data ?? [];
  const fleetReservationRows = fleetReservationsResult.data ?? [];
  const warehouseItemRows = (warehouseItemsResult.data ?? []) as WarehouseItemRow[];
  const warehouseReservationRows = (warehouseReservationsResult.data ?? []) as WarehouseReservationRow[];
  const warehouseReservationItemRows = (warehouseReservationItemsResult.data ?? []) as WarehouseReservationItemRow[];

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
  const projectJobNumberByUuid = new Map(projectRows.map((row) => [row.id, row.job_number]));
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
    contractorProfileId: row.contractor_id,
  }));

  const invoices = invoiceRows.map((row) => ({
    ...mapInvoice(row),
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : Number.NaN,
  }));

  const receiptIdMap = indexById(receiptRows);
  const receipts = receiptRows.map((row) => ({
    ...mapReceipt(row),
    id: receiptIdMap.get(row.id) ?? Number.NaN,
    contractorProfileId: row.contractor_id,
    eid: row.event_id ? (eventIdMap.get(row.event_id) ?? Number.NaN) : Number.NaN,
  }));

  const candidateIdMap = indexById(candidateRows);
  const candidates = candidateRows.map((row) => ({
    ...mapCandidate(row),
    id: candidateIdMap.get(row.id) ?? Number.NaN,
  }));

  const budgetPackageIdMap = indexById(budgetPackageRows);
  const budgetPackageEventsByPackageId = new Map<string, number[]>();
  for (const row of budgetPackageEventRows) {
    const eventId = eventIdMap.get(row.event_id);
    if (!eventId) {
      continue;
    }
    const current = budgetPackageEventsByPackageId.get(row.budget_package_id) ?? [];
    current.push(eventId);
    budgetPackageEventsByPackageId.set(row.budget_package_id, current);
  }
  const budgetPackages = budgetPackageRows.map((row) => mapBudgetPackage(row, {
    localId: budgetPackageIdMap.get(row.id) ?? Number.NaN,
    projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
    eventIds: budgetPackageEventsByPackageId.get(row.id) ?? [],
  }));
  const budgetItemIdMap = indexById(budgetItemRows);
  const budgetItems = budgetItemRows.map((row) => mapBudgetItem(row, {
    localId: budgetItemIdMap.get(row.id) ?? Number.NaN,
    projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
    budgetPackageId: row.budget_package_id ? (budgetPackageIdMap.get(row.budget_package_id) ?? null) : null,
    eventId: row.event_id ? (eventIdMap.get(row.event_id) ?? null) : null,
  }));

  const fleetVehicles = fleetVehicleRows.map(mapFleetVehicle);
  const fleetVehicleSlugByUuid = new Map(fleetVehicleRows.map((row) => [row.id, row.slug]));
  const fleetReservationIdMap = indexById(fleetReservationRows);
  const fleetReservations = fleetReservationRows
    .map((row) => mapFleetReservation(row, {
      localId: fleetReservationIdMap.get(row.id) ?? Number.NaN,
      vehicleSlug: fleetVehicleSlugByUuid.get(row.vehicle_id) ?? row.vehicle_id,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      eventId: row.event_id ? (eventIdMap.get(row.event_id) ?? null) : null,
    }));

  let warehouseItems: WarehouseItem[];
  let warehouseReservations: WarehouseReservation[];
  if (useWarehouseFallback) {
    ({ warehouseItems, warehouseReservations } = getWarehouseFallbackData());
  } else {
    warehouseItems = warehouseItemRows.map(mapWarehouseItem);
    const warehouseReservationItemsByReservationId = new Map<string, WarehouseReservationItemRow[]>();
    for (const itemRow of warehouseReservationItemRows) {
      const current = warehouseReservationItemsByReservationId.get(itemRow.reservation_id) ?? [];
      current.push(itemRow);
      warehouseReservationItemsByReservationId.set(itemRow.reservation_id, current);
    }
    warehouseReservations = warehouseReservationRows
      .map((row) => mapWarehouseReservation(row, warehouseReservationItemsByReservationId.get(row.id) ?? []));
  }

  return {
    events,
    contractors,
    timelogs,
    invoices,
    receipts,
    budgetPackages,
    budgetItems,
    fleetVehicles,
    fleetReservations,
    warehouseItems,
    warehouseReservations,
    candidates,
    projects,
    clients,
  };
}

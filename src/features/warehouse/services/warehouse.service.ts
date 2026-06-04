import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type {
  Event,
  Project,
  WarehouseItem,
  WarehouseReservation,
  WarehouseReservationDraft,
  WarehouseReservationItem,
} from '../../../types';

export interface WarehouseRange {
  startsAt: string;
  endsAt: string;
}

export interface WarehouseCatalogRow {
  item: WarehouseItem;
  reservedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
}

export interface WarehouseConflict {
  warehouseItemId: string;
  itemName: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface WarehouseDependencies {
  items: WarehouseItem[];
  reservations: WarehouseReservation[];
  projects: Project[];
  events: Event[];
}

type SupabaseInsertClient = {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    insert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
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

const getTime = (value: string) => new Date(value).getTime();

const isValidDateTime = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute] = match.map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute);

  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
    && parsed.getHours() === hour
    && parsed.getMinutes() === minute;
};

const overlaps = (a: WarehouseRange, b: WarehouseRange) => (
  getTime(a.startsAt) < getTime(b.endsAt) && getTime(a.endsAt) > getTime(b.startsAt)
);

const createId = () => crypto.randomUUID();

const getAggregatedDraftItems = (draft: WarehouseReservationDraft) => {
  const quantitiesByItemId = new Map<string, number>();

  draft.items.forEach((item) => {
    quantitiesByItemId.set(
      item.warehouseItemId,
      (quantitiesByItemId.get(item.warehouseItemId) ?? 0) + item.quantity,
    );
  });

  return [...quantitiesByItemId.entries()].map(([warehouseItemId, quantity]) => ({
    warehouseItemId,
    quantity,
  }));
};

export const subscribeToWarehouseChanges = subscribeToLocalAppState;

const normalizeWarehouseCurrency = (currency: string | null): 'CZK' => (
  currency === 'CZK' ? currency : 'CZK'
);

const mapWarehouseItem = (row: WarehouseItemRow): WarehouseItem => ({
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
});

const mapWarehouseReservationItem = (row: WarehouseReservationItemRow): WarehouseReservationItem => ({
  id: row.id,
  reservationId: row.reservation_id,
  warehouseItemId: row.warehouse_item_id,
  quantity: row.quantity,
  unitPriceCents: row.unit_price_cents,
  pricePeriodLabel: row.price_period_label,
  lineTotalCents: row.line_total_cents,
  itemNameSnapshot: row.item_name_snapshot,
});

const mapWarehouseReservation = (
  row: WarehouseReservationRow,
  items: WarehouseReservationItemRow[],
): WarehouseReservation => ({
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
});

let warehouseHydrationPromise: Promise<void> | null = null;
let warehouseLoaded = false;

const hydrateWarehouseFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const supabaseUntyped = supabase as unknown as SupabaseInsertClient;
  const [
    itemsResult,
    reservationsResult,
    reservationItemsResult,
  ] = await Promise.all([
    supabaseUntyped.from('warehouse_items').select('*').order('name'),
    supabaseUntyped.from('warehouse_reservations').select('*').order('starts_at'),
    supabaseUntyped.from('warehouse_reservation_items').select('*').order('created_at'),
  ]);

  const firstError = itemsResult.error ?? reservationsResult.error ?? reservationItemsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const reservationItemRows = (reservationItemsResult.data ?? []) as WarehouseReservationItemRow[];
  const reservationItemsByReservationId = new Map<string, WarehouseReservationItemRow[]>();
  for (const row of reservationItemRows) {
    const current = reservationItemsByReservationId.get(row.reservation_id) ?? [];
    current.push(row);
    reservationItemsByReservationId.set(row.reservation_id, current);
  }

  const warehouseItems = ((itemsResult.data ?? []) as WarehouseItemRow[]).map(mapWarehouseItem);
  const warehouseReservations = ((reservationsResult.data ?? []) as WarehouseReservationRow[])
    .map((row) => mapWarehouseReservation(row, reservationItemsByReservationId.get(row.id) ?? []));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    warehouseItems,
    warehouseReservations,
  }));
};

const ensureSupabaseWarehouseLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (warehouseLoaded || warehouseHydrationPromise) {
    return;
  }

  warehouseHydrationPromise = hydrateWarehouseFromSupabase()
    .then(() => {
      warehouseLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist sklad ze Supabase.', error);
    })
    .finally(() => {
      warehouseHydrationPromise = null;
    });
};

export const resetSupabaseWarehouseHydration = () => {
  warehouseLoaded = false;
  warehouseHydrationPromise = null;
};

export const getWarehouseDependencies = (): WarehouseDependencies => {
  ensureSupabaseWarehouseLoaded();

  const snapshot = getLocalAppState();

  return {
    items: snapshot.warehouseItems ?? [],
    reservations: snapshot.warehouseReservations ?? [],
    projects: snapshot.projects ?? [],
    events: snapshot.events ?? [],
  };
};

export const getWarehouseCatalogRows = (range?: WarehouseRange): WarehouseCatalogRow[] => {
  const { items, reservations } = getWarehouseDependencies();

  return items
    .filter((item) => item.status === 'active')
    .map((item) => {
      const reservedQuantity = range
        ? reservations
          .filter((reservation) => reservation.status !== 'cancelled' && overlaps(range, reservation))
          .flatMap((reservation) => reservation.items)
          .filter((line) => line.warehouseItemId === item.id)
          .reduce((sum, line) => sum + line.quantity, 0)
        : 0;
      const availableQuantity = Math.max(0, item.quantityTotal - reservedQuantity);

      return {
        item,
        reservedQuantity,
        availableQuantity,
        isAvailable: availableQuantity > 0,
      };
    });
};

export const findWarehouseReservationConflicts = (
  draft: WarehouseReservationDraft,
): WarehouseConflict[] => {
  if (!draft.startsAt || !draft.endsAt) return [];

  const rows = getWarehouseCatalogRows({
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  });

  return getAggregatedDraftItems(draft).flatMap((draftItem) => {
    const row = rows.find((item) => item.item.id === draftItem.warehouseItemId);
    if (!row || draftItem.quantity <= row.availableQuantity) return [];

    return [{
      warehouseItemId: draftItem.warehouseItemId,
      itemName: row.item.name,
      requestedQuantity: draftItem.quantity,
      availableQuantity: row.availableQuantity,
    }];
  });
};

const saveWarehouseReservationToSupabase = async (reservation: WarehouseReservation) => {
  if (!supabase || !isSupabaseConfigured) return;

  const supabaseUntyped = supabase as unknown as SupabaseInsertClient;
  const reservationResult = await supabaseUntyped.from('warehouse_reservations').insert({
    id: reservation.id,
    project_id: reservation.projectId,
    project_job_number: reservation.projectJobNumber,
    event_id: reservation.eventId,
    event_local_id: reservation.eventLocalId,
    reserved_by_profile_id: reservation.reservedByProfileId,
    starts_at: reservation.startsAt,
    ends_at: reservation.endsAt,
    status: reservation.status,
    note: reservation.note,
    total_cents: reservation.totalCents,
    currency: reservation.currency,
    booqable_order_id: reservation.booqableOrderId,
  });

  if (reservationResult.error) throw new Error(reservationResult.error.message);

  const lineResult = await supabaseUntyped.from('warehouse_reservation_items').insert(
    reservation.items.map((line) => ({
      id: line.id,
      reservation_id: line.reservationId,
      warehouse_item_id: line.warehouseItemId,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      price_period_label: line.pricePeriodLabel,
      line_total_cents: line.lineTotalCents,
      item_name_snapshot: line.itemNameSnapshot,
    })),
  );

  if (lineResult.error) {
    const cleanupResult = await supabaseUntyped.from('warehouse_reservations').delete().eq('id', reservation.id);
    if (cleanupResult.error) {
      throw new Error(`${lineResult.error.message} Cleanup failed: ${cleanupResult.error.message}`);
    }
    throw new Error(lineResult.error.message);
  }
};

export const createWarehouseReservation = async (
  draft: WarehouseReservationDraft,
): Promise<WarehouseReservation> => {
  if (!draft.projectJobNumber.trim()) throw new Error('Vyberte projekt.');
  if (!draft.startsAt || !draft.endsAt) throw new Error('Vyplnte zacatek a konec rezervace.');
  if (!isValidDateTime(draft.startsAt) || !isValidDateTime(draft.endsAt)) {
    throw new Error('Vyplnte platny zacatek a konec rezervace.');
  }
  if (getTime(draft.endsAt) <= getTime(draft.startsAt)) throw new Error('Konec rezervace musi byt po zacatku.');
  if (draft.items.length === 0) throw new Error('Kosik je prazdny.');
  if (draft.items.some((item) => item.quantity < 1)) throw new Error('Mnozstvi musi byt alespon 1.');

  const conflicts = findWarehouseReservationConflicts(draft);
  if (conflicts.length > 0) throw new Error('Pozadovane mnozstvi neni dostupne.');

  const snapshot = getLocalAppState();
  const lines: WarehouseReservationItem[] = getAggregatedDraftItems(draft).map((draftItem) => {
    const item = snapshot.warehouseItems.find((candidate) => candidate.id === draftItem.warehouseItemId);
    if (!item) throw new Error('Polozka skladu nebyla nalezena.');
    if (item.status !== 'active') throw new Error('Polozka skladu neni aktivni.');

    return {
      id: createId(),
      reservationId: '',
      warehouseItemId: item.id,
      quantity: draftItem.quantity,
      unitPriceCents: item.priceCents,
      pricePeriodLabel: item.pricePeriodLabel,
      lineTotalCents: item.priceCents * draftItem.quantity,
      itemNameSnapshot: item.name,
    };
  });
  const reservationId = createId();
  const saved: WarehouseReservation = {
    id: reservationId,
    projectId: draft.projectId ?? null,
    projectJobNumber: draft.projectJobNumber.trim(),
    eventId: draft.eventId ?? null,
    eventLocalId: draft.eventLocalId ?? null,
    reservedByProfileId: draft.reservedByProfileId ?? null,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    status: 'reserved',
    note: draft.note.trim(),
    totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    currency: 'CZK',
    booqableOrderId: null,
    items: lines.map((line) => ({ ...line, reservationId })),
  };

  await saveWarehouseReservationToSupabase(saved);

  updateLocalAppState((state) => ({
    ...state,
    warehouseReservations: [...state.warehouseReservations, saved],
  }));

  return saved;
};

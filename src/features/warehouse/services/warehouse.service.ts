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
    insert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
  };
};

const getTime = (value: string) => new Date(value).getTime();

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

export const getWarehouseDependencies = (): WarehouseDependencies => {
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

  if (lineResult.error) throw new Error(lineResult.error.message);
};

export const createWarehouseReservation = async (
  draft: WarehouseReservationDraft,
): Promise<WarehouseReservation> => {
  if (!draft.projectJobNumber.trim()) throw new Error('Vyberte projekt.');
  if (!draft.startsAt || !draft.endsAt) throw new Error('Vyplnte zacatek a konec rezervace.');
  if (getTime(draft.endsAt) <= getTime(draft.startsAt)) throw new Error('Konec rezervace musi byt po zacatku.');
  if (draft.items.length === 0) throw new Error('Kosik je prazdny.');
  if (draft.items.some((item) => item.quantity < 1)) throw new Error('Mnozstvi musi byt alespon 1.');

  const conflicts = findWarehouseReservationConflicts(draft);
  if (conflicts.length > 0) throw new Error('Pozadovane mnozstvi neni dostupne.');

  const snapshot = getLocalAppState();
  const lines: WarehouseReservationItem[] = getAggregatedDraftItems(draft).map((draftItem) => {
    const item = snapshot.warehouseItems.find((candidate) => candidate.id === draftItem.warehouseItemId);
    if (!item) throw new Error('Polozka skladu nebyla nalezena.');

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

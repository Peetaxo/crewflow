import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapFleetReservation, mapFleetVehicle } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type {
  Contractor,
  Event,
  FleetReservation,
  FleetReservationDraft,
  FleetVehicle,
  Project,
} from '../../../types';

export interface FleetInspectionAlert {
  tone: 'warning' | 'danger';
  label: string;
  daysRemaining: number;
}

export interface FleetOverviewRow {
  vehicle: FleetVehicle;
  nextReservation: FleetReservation | null;
  currentReservation: FleetReservation | null;
  inspectionAlert: FleetInspectionAlert | null;
  hasConflict: boolean;
}

export interface FleetVehicleDetail {
  vehicle: FleetVehicle;
  reservations: FleetReservation[];
  upcomingReservations: FleetReservation[];
  historyReservations: FleetReservation[];
  inspectionAlert: FleetInspectionAlert | null;
}

export interface FleetDependencies {
  vehicles: FleetVehicle[];
  reservations: FleetReservation[];
  projects: Project[];
  events: Event[];
  contractors: Contractor[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateOnly = (value: string) => value.split('T')[0];

const getProfileId = (contractor: Contractor) => contractor.profileId ?? `profile-local-${contractor.id}`;

const getTime = (value: string) => new Date(value).getTime();

const getInspectionAlert = (
  vehicle: FleetVehicle,
  referenceDate: string,
): FleetInspectionAlert | null => {
  const daysRemaining = Math.ceil(
    (new Date(`${vehicle.inspectionValidUntil}T00:00`).getTime() - new Date(`${referenceDate}T00:00`).getTime()) / DAY_MS,
  );

  if (daysRemaining < 0) {
    return {
      tone: 'danger',
      label: 'STK propadla',
      daysRemaining,
    };
  }

  if (daysRemaining <= 14) {
    return {
      tone: 'danger',
      label: `STK za ${daysRemaining} dní`,
      daysRemaining,
    };
  }

  if (daysRemaining <= 60) {
    return {
      tone: 'warning',
      label: `STK za ${daysRemaining} dní`,
      daysRemaining,
    };
  }

  return null;
};

const overlaps = (
  a: Pick<FleetReservationDraft, 'startsAt' | 'endsAt'>,
  b: Pick<FleetReservation, 'startsAt' | 'endsAt'>,
) => getTime(a.startsAt) < getTime(b.endsAt) && getTime(a.endsAt) > getTime(b.startsAt);

const getSortedReservations = (reservations: FleetReservation[]) => (
  [...reservations].sort((a, b) => getTime(a.startsAt) - getTime(b.startsAt))
);

const getSupabaseReservationPayload = (
  reservation: FleetReservationDraft,
  hasConflict: boolean,
) => {
  const snapshot = getLocalAppState();
  const vehicle = snapshot.fleetVehicles.find((item) => item.id === reservation.vehicleId);
  const project = snapshot.projects.find((item) => item.id === reservation.projectId);
  const event = reservation.eventId
    ? snapshot.events.find((item) => item.id === reservation.eventId)
    : null;

  if (!vehicle?.supabaseId) {
    throw new Error('Auto neni propojene se Supabase.');
  }

  if (!project?.supabaseId) {
    throw new Error('Projekt neni propojeny se Supabase.');
  }

  if (reservation.eventId && !event?.supabaseId) {
    throw new Error('Akce neni propojena se Supabase.');
  }

  return {
    vehicle_id: vehicle.supabaseId,
    project_id: project.supabaseId,
    event_id: event?.supabaseId ?? null,
    responsible_profile_id: reservation.responsibleProfileId,
    starts_at: reservation.startsAt,
    ends_at: reservation.endsAt,
    note: reservation.note.trim() || null,
    has_conflict: hasConflict,
  };
};

const canPersistReservationToSupabase = (reservation: FleetReservationDraft): boolean => {
  const snapshot = getLocalAppState();
  const vehicle = snapshot.fleetVehicles.find((item) => item.id === reservation.vehicleId);
  const project = snapshot.projects.find((item) => item.id === reservation.projectId);
  const event = reservation.eventId
    ? snapshot.events.find((item) => item.id === reservation.eventId)
    : null;

  return Boolean(
    vehicle?.supabaseId
    && project?.supabaseId
    && (!reservation.eventId || event?.supabaseId),
  );
};

export const subscribeToFleetChanges = subscribeToLocalAppState;

let fleetHydrationPromise: Promise<void> | null = null;
let fleetLoaded = false;

const hydrateFleetFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const [
    vehiclesResult,
    reservationsResult,
    projectsResult,
    eventsResult,
  ] = await Promise.all([
    supabase.from('fleet_vehicles').select('*').order('name'),
    supabase.from('fleet_reservations').select('*').order('starts_at'),
    supabase.from('projects').select('*').order('job_number'),
    supabase.from('events').select('*').order('date_from'),
  ]);

  const firstError = vehiclesResult.error
    ?? reservationsResult.error
    ?? projectsResult.error
    ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const vehicleRows = vehiclesResult.data ?? [];
  const reservationRows = reservationsResult.data ?? [];
  const projectRows = projectsResult.data ?? [];
  const eventRows = eventsResult.data ?? [];
  const vehicleSlugByUuid = new Map(vehicleRows.map((row) => [row.id, row.slug]));
  const projectJobNumberByUuid = new Map(projectRows.map((row) => [row.id, row.job_number]));
  const eventIdByUuid = new Map(eventRows.map((row, index) => [row.id, index + 1]));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    fleetVehicles: vehicleRows.map(mapFleetVehicle),
    fleetReservations: reservationRows.map((row, index) => mapFleetReservation(row, {
      localId: index + 1,
      vehicleSlug: vehicleSlugByUuid.get(row.vehicle_id) ?? row.vehicle_id,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      eventId: row.event_id ? (eventIdByUuid.get(row.event_id) ?? null) : null,
    })),
  }));
};

const ensureSupabaseFleetLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (fleetLoaded || fleetHydrationPromise) {
    return;
  }

  fleetHydrationPromise = hydrateFleetFromSupabase()
    .then(() => {
      fleetLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist flotilu ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      fleetHydrationPromise = null;
    });
};

export const resetSupabaseFleetHydration = () => {
  fleetLoaded = false;
  fleetHydrationPromise = null;
};

const getFleetDependenciesFromState = (loadSupabase: boolean): FleetDependencies => {
  if (loadSupabase) {
    ensureSupabaseFleetLoaded();
  }
  const snapshot = getLocalAppState();

  return {
    vehicles: snapshot.fleetVehicles ?? [],
    reservations: snapshot.fleetReservations ?? [],
    projects: snapshot.projects ?? [],
    events: snapshot.events ?? [],
    contractors: (snapshot.contractors ?? []).map((contractor) => ({
      ...contractor,
      profileId: getProfileId(contractor),
    })),
  };
};

export const getFleetDependencies = (): FleetDependencies => getFleetDependenciesFromState(true);

export const getFleetOverviewRows = (referenceDate = new Date().toISOString().split('T')[0]): FleetOverviewRow[] => {
  const { vehicles, reservations } = getFleetDependencies();
  const referenceStart = getTime(`${referenceDate}T00:00`);
  const referenceEnd = getTime(`${referenceDate}T23:59`);

  return vehicles.map((vehicle) => {
    const vehicleReservations = getSortedReservations(
      reservations.filter((reservation) => reservation.vehicleId === vehicle.id),
    );
    const nextReservation = vehicleReservations.find((reservation) => getTime(reservation.endsAt) >= referenceStart) ?? null;
    const currentReservation = vehicleReservations.find((reservation) => (
      getTime(reservation.startsAt) <= referenceEnd && getTime(reservation.endsAt) >= referenceStart
    )) ?? null;

    return {
      vehicle,
      nextReservation,
      currentReservation,
      inspectionAlert: getInspectionAlert(vehicle, referenceDate),
      hasConflict: vehicleReservations.some((reservation) => reservation.hasConflict && toDateOnly(reservation.endsAt) >= referenceDate),
    };
  });
};

export const getFleetVehicleDetail = (
  vehicleId: string,
  referenceDate = new Date().toISOString().split('T')[0],
): FleetVehicleDetail | null => {
  const { vehicles, reservations } = getFleetDependencies();
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  if (!vehicle) return null;

  const vehicleReservations = getSortedReservations(
    reservations.filter((reservation) => reservation.vehicleId === vehicleId),
  );

  return {
    vehicle,
    reservations: vehicleReservations,
    upcomingReservations: vehicleReservations.filter((reservation) => toDateOnly(reservation.endsAt) >= referenceDate),
    historyReservations: vehicleReservations
      .filter((reservation) => toDateOnly(reservation.endsAt) < referenceDate)
      .sort((a, b) => getTime(b.startsAt) - getTime(a.startsAt)),
    inspectionAlert: getInspectionAlert(vehicle, referenceDate),
  };
};

export const createEmptyFleetReservation = (
  vehicleId: string,
  responsibleProfileId: string,
): FleetReservationDraft => ({
  vehicleId,
  projectId: '',
  eventId: null,
  responsibleProfileId,
  startsAt: '',
  endsAt: '',
  note: '',
});

export const findFleetReservationConflicts = (
  reservation: FleetReservationDraft,
): FleetReservation[] => {
  const { reservations } = getFleetDependenciesFromState(false);

  if (!reservation.vehicleId || !reservation.startsAt || !reservation.endsAt) {
    return [];
  }

  return reservations.filter((item) => (
    item.vehicleId === reservation.vehicleId
    && item.id !== reservation.id
    && overlaps(reservation, item)
  ));
};

export const saveFleetReservation = async (
  reservation: FleetReservationDraft,
): Promise<FleetReservation> => {
  if (!reservation.vehicleId) throw new Error('Vyberte auto.');
  if (!reservation.projectId) throw new Error('Vyberte projekt.');
  if (!reservation.responsibleProfileId) throw new Error('Vyberte odpovědnou osobu.');
  if (!reservation.startsAt || !reservation.endsAt) throw new Error('Vyplňte začátek a konec rezervace.');
  if (getTime(reservation.endsAt) <= getTime(reservation.startsAt)) {
    throw new Error('Konec rezervace musí být po začátku.');
  }

  const conflicts = findFleetReservationConflicts(reservation);
  const snapshot = getLocalAppState();
  const nextId = reservation.id ?? Math.max(0, ...snapshot.fleetReservations.map((item) => item.id)) + 1;
  let supabaseId = reservation.supabaseId;

  if (
    appDataSource === 'supabase'
    && supabase
    && isSupabaseConfigured
    && canPersistReservationToSupabase(reservation)
  ) {
    const payload = getSupabaseReservationPayload(reservation, conflicts.length > 0);

    if (reservation.supabaseId) {
      const updateResult = await supabase
        .from('fleet_reservations')
        .update(payload)
        .eq('id', reservation.supabaseId);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }
    } else {
      const insertResult = await supabase
        .from('fleet_reservations')
        .insert(payload)
        .select('id')
        .single();

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }

      supabaseId = insertResult.data?.id ?? supabaseId;
    }
  }

  const saved: FleetReservation = {
    id: nextId,
    supabaseId,
    vehicleId: reservation.vehicleId,
    projectId: reservation.projectId.trim(),
    eventId: reservation.eventId ?? null,
    responsibleProfileId: reservation.responsibleProfileId,
    startsAt: reservation.startsAt,
    endsAt: reservation.endsAt,
    note: reservation.note.trim(),
    hasConflict: conflicts.length > 0,
  };

  updateLocalAppState((state) => ({
    ...state,
    fleetReservations: [
      ...state.fleetReservations.filter((item) => item.id !== saved.id),
      saved,
    ].sort((a, b) => getTime(a.startsAt) - getTime(b.startsAt)),
  }));

  return saved;
};

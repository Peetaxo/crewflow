import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { CrewRating, CrewRatingSource } from '../../../types';
import type { Database } from '../../../lib/database.types';

type CrewRatingRow = Database['public']['Tables']['crew_ratings']['Row'];

export interface UpsertCrewRatingInput {
  profileId: string;
  eventId?: number | null;
  eventSupabaseId?: string | null;
  source?: CrewRatingSource;
  rating: number;
  note?: string;
  ratedByProfileId?: string | null;
}

let crewRatingsHydrationPromise: Promise<void> | null = null;
let crewRatingsLoaded = false;

export const validateCrewRatingValue = (rating: number): number => {
  if (!Number.isInteger(rating) || rating < 0 || rating > 10) {
    throw new Error('Hodnoceni musi byt cele cislo od 0 do 10.');
  }

  return rating;
};

const getRatingAverage = (ratings: CrewRating[]): number | null => {
  if (ratings.length === 0) return null;

  const average = ratings.reduce((sum, rating) => sum + rating.rating, 0) / ratings.length;
  return Math.round(average * 10) / 10;
};

const getEventSupabaseId = (eventId?: number | null, explicitEventSupabaseId?: string | null): string | null => {
  if (explicitEventSupabaseId) return explicitEventSupabaseId;
  if (eventId == null) return null;

  return getLocalAppState().events.find((event) => event.id === eventId)?.supabaseId ?? null;
};

const getEventLocalId = (eventSupabaseId: string | null, explicitEventId?: number | null): number | null => {
  if (explicitEventId != null) return explicitEventId;
  if (!eventSupabaseId) return null;

  return getLocalAppState().events.find((event) => event.supabaseId === eventSupabaseId)?.id ?? null;
};

const mapCrewRatingRow = (row: CrewRatingRow): CrewRating => ({
  id: row.id,
  profileId: row.profile_id,
  eventId: getEventLocalId(row.event_id),
  eventSupabaseId: row.event_id,
  source: row.source,
  rating: row.rating,
  note: row.note ?? '',
  ratedByProfileId: row.rated_by_profile_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const matchesCrewRating = (
  rating: CrewRating,
  input: Pick<CrewRating, 'profileId' | 'source'> & {
    eventId?: number | null;
    eventSupabaseId?: string | null;
  },
) => {
  if (rating.profileId !== input.profileId || rating.source !== input.source) return false;

  if (input.source === 'initial') {
    return rating.eventId == null && !rating.eventSupabaseId;
  }

  return (
    (input.eventId != null && rating.eventId === input.eventId)
    || (Boolean(input.eventSupabaseId) && rating.eventSupabaseId === input.eventSupabaseId)
  );
};

const withRecalculatedProfileRating = (
  ratings: CrewRating[],
  contractors: ReturnType<typeof getLocalAppState>['contractors'],
  profileId: string,
) => {
  const nextAverage = getRatingAverage(ratings.filter((rating) => rating.profileId === profileId));

  return contractors.map((contractor) => (
    contractor.profileId === profileId
      ? { ...contractor, rating: nextAverage }
      : contractor
  ));
};

const hydrateCrewRatingsFromSupabase = async () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const result = await supabase
    .from('crew_ratings')
    .select('*')
    .order('updated_at');

  if (result.error) {
    throw new Error(result.error.message);
  }

  const crewRatings = (result.data ?? []).map(mapCrewRatingRow);
  updateLocalAppState((snapshot) => ({
    ...snapshot,
    crewRatings,
  }));
};

export const ensureSupabaseCrewRatingsLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (crewRatingsLoaded || crewRatingsHydrationPromise) {
    return;
  }

  crewRatingsHydrationPromise = hydrateCrewRatingsFromSupabase()
    .then(() => {
      crewRatingsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist hodnoceni crew ze Supabase.', error);
    })
    .finally(() => {
      crewRatingsHydrationPromise = null;
    });
};

export const getCrewRatingsForEvent = (eventId: number | null): CrewRating[] => {
  ensureSupabaseCrewRatingsLoaded();
  if (eventId == null) return [];

  const snapshot = getLocalAppState();
  const eventSupabaseId = snapshot.events.find((event) => event.id === eventId)?.supabaseId ?? null;

  return (snapshot.crewRatings ?? []).filter((rating) => (
    rating.source === 'event'
    && (
      rating.eventId === eventId
      || (Boolean(eventSupabaseId) && rating.eventSupabaseId === eventSupabaseId)
    )
  ));
};

export const getCrewRatingsForProfile = (profileId: string): CrewRating[] => {
  ensureSupabaseCrewRatingsLoaded();
  return (getLocalAppState().crewRatings ?? []).filter((rating) => rating.profileId === profileId);
};

const findSupabaseCrewRating = async (
  source: CrewRatingSource,
  profileId: string,
  eventSupabaseId: string | null,
) => {
  if (!supabase) return null;

  const query = supabase
    .from('crew_ratings')
    .select('id')
    .eq('profile_id', profileId)
    .eq('source', source);

  const result = source === 'initial'
    ? await query.is('event_id', null).maybeSingle()
    : await query.eq('event_id', eventSupabaseId).maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data?.id ?? null;
};

const saveCrewRatingToSupabase = async (
  input: UpsertCrewRatingInput,
  source: CrewRatingSource,
  rating: number,
  eventSupabaseId: string | null,
): Promise<CrewRating | null> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return null;
  }

  const existingId = await findSupabaseCrewRating(source, input.profileId, eventSupabaseId);
  const payload = {
    profile_id: input.profileId,
    event_id: eventSupabaseId,
    source,
    rating,
    note: input.note?.trim() || null,
    rated_by_profile_id: input.ratedByProfileId ?? null,
  };

  const result = existingId
    ? await supabase
        .from('crew_ratings')
        .update(payload)
        .eq('id', existingId)
        .select('*')
        .single()
    : await supabase
        .from('crew_ratings')
        .insert(payload)
        .select('*')
        .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ? mapCrewRatingRow(result.data) : null;
};

export const upsertCrewRating = async (input: UpsertCrewRatingInput): Promise<CrewRating> => {
  if (!input.profileId) {
    throw new Error('Nepodarilo se dohledat clena crew pro hodnoceni.');
  }

  const source = input.source ?? (input.eventId == null && !input.eventSupabaseId ? 'initial' : 'event');
  const rating = validateCrewRatingValue(input.rating);
  const eventSupabaseId = source === 'event'
    ? getEventSupabaseId(input.eventId, input.eventSupabaseId)
    : null;

  if (source === 'event' && input.eventId == null && !eventSupabaseId) {
    throw new Error('Hodnoceni z akce musi byt navazane na akci.');
  }

  const supabaseRating = await saveCrewRatingToSupabase(input, source, rating, eventSupabaseId);
  const now = new Date().toISOString();
  let savedRating: CrewRating | null = null;

  updateLocalAppState((snapshot) => {
    const existing = (snapshot.crewRatings ?? []).find((item) => matchesCrewRating(item, {
      profileId: input.profileId,
      source,
      eventId: input.eventId ?? null,
      eventSupabaseId,
    }));
    const nextRating: CrewRating = {
      id: supabaseRating?.id ?? existing?.id ?? `local:${source}:${input.profileId}:${input.eventId ?? 'initial'}`,
      profileId: input.profileId,
      eventId: supabaseRating?.eventId ?? (source === 'event' ? input.eventId ?? getEventLocalId(eventSupabaseId) : null),
      eventSupabaseId: supabaseRating?.eventSupabaseId ?? eventSupabaseId,
      source,
      rating,
      note: input.note?.trim() ?? '',
      ratedByProfileId: input.ratedByProfileId ?? null,
      createdAt: supabaseRating?.createdAt ?? existing?.createdAt ?? now,
      updatedAt: supabaseRating?.updatedAt ?? now,
    };
    const nextRatings = existing
      ? (snapshot.crewRatings ?? []).map((item) => (item.id === existing.id ? nextRating : item))
      : [...(snapshot.crewRatings ?? []), nextRating];

    savedRating = nextRating;

    return {
      ...snapshot,
      crewRatings: nextRatings,
      contractors: withRecalculatedProfileRating(nextRatings, snapshot.contractors ?? [], input.profileId),
    };
  });

  return savedRating as CrewRating;
};

export const subscribeToCrewRatingChanges = (listener: () => void): (() => void) => (
  (ensureSupabaseCrewRatingsLoaded(), subscribeToLocalAppState(() => listener()))
);

export const resetSupabaseCrewRatingsHydration = () => {
  crewRatingsHydrationPromise = null;
  crewRatingsLoaded = false;
};

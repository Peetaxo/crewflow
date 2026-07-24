export interface EventGeocodingCandidate {
  id: string;
  label: string;
  locationLat: number;
  locationLng: number;
  provider: 'nominatim';
}

type EventGeocodingFetcher = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

interface SearchFreeEventLocationsOptions {
  fetcher?: EventGeocodingFetcher;
  cooldownMs?: number;
  now?: () => number;
}

interface NominatimSearchResult {
  osm_type?: string;
  osm_id?: string | number;
  display_name?: string;
  lat?: string | number;
  lon?: string | number;
}

const NOMINATIM_SEARCH_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_PROVIDER_COOLDOWN_MS = 1100;
const EVENT_GEOCODING_RATE_LIMIT_MESSAGE = 'Vyhledávání adres je dostupné za chvíli. Zkuste to prosím znovu.';
const EVENT_GEOCODING_FAILURE_MESSAGE = 'Adresu se nepodařilo najít.';

const cache = new Map<string, EventGeocodingCandidate[]>();
let lastProviderCallAt: number | null = null;

export class EventGeocodingRateLimitError extends Error {
  constructor() {
    super(EVENT_GEOCODING_RATE_LIMIT_MESSAGE);
    this.name = 'EventGeocodingRateLimitError';
  }
}

export const buildNominatimSearchUrl = (query: string) => (
  `${NOMINATIM_SEARCH_BASE_URL}?format=jsonv2&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=cs&countrycodes=cz`
);

const normalizeQuery = (query: string) => query.trim().toLocaleLowerCase('cs-CZ');

const getFetcher = (fetcher?: EventGeocodingFetcher): EventGeocodingFetcher => {
  if (fetcher) {
    return fetcher;
  }

  return globalThis.fetch as EventGeocodingFetcher;
};

const normalizeNominatimResults = (items: unknown): EventGeocodingCandidate[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.reduce<EventGeocodingCandidate[]>((candidates, item, index) => {
    const result = item as NominatimSearchResult;
    const label = typeof result.display_name === 'string' ? result.display_name.trim() : '';
    const locationLat = Number(result.lat);
    const locationLng = Number(result.lon);

    if (!label || !Number.isFinite(locationLat) || !Number.isFinite(locationLng)) {
      return candidates;
    }

    candidates.push({
      id: `${result.osm_type || 'result'}-${result.osm_id ?? index}`,
      label,
      locationLat,
      locationLng,
      provider: 'nominatim',
    });

    return candidates;
  }, []);
};

export const searchFreeEventLocations = async (
  query: string,
  options: SearchFreeEventLocationsOptions = {},
): Promise<EventGeocodingCandidate[]> => {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  const normalizedQuery = normalizeQuery(query);
  const cachedCandidates = cache.get(normalizedQuery);

  if (cachedCandidates) {
    return cachedCandidates;
  }

  const cooldownMs = options.cooldownMs ?? DEFAULT_PROVIDER_COOLDOWN_MS;
  const currentTime = options.now?.() ?? Date.now();

  if (lastProviderCallAt !== null && currentTime - lastProviderCallAt < cooldownMs) {
    throw new EventGeocodingRateLimitError();
  }

  lastProviderCallAt = currentTime;

  let response: Awaited<ReturnType<EventGeocodingFetcher>>;

  try {
    response = await getFetcher(options.fetcher)(buildNominatimSearchUrl(trimmedQuery), {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error(EVENT_GEOCODING_FAILURE_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(EVENT_GEOCODING_FAILURE_MESSAGE);
  }

  let providerItems: unknown;

  try {
    providerItems = await response.json();
  } catch {
    throw new Error(EVENT_GEOCODING_FAILURE_MESSAGE);
  }

  const candidates = normalizeNominatimResults(providerItems);
  cache.set(normalizedQuery, candidates);

  return candidates;
};

export const __resetEventGeocodingStateForTests = () => {
  cache.clear();
  lastProviderCallAt = null;
};

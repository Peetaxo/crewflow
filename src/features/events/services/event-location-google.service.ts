import { getManualAddressSelection, type EventAddressSelection } from './event-location.service';

export { getManualAddressSelection, type EventAddressSelection };

export interface EventAddressSuggestion {
  id: string;
  label: string;
  placeId?: string;
  raw?: unknown;
}

interface GooglePlacesLibrary {
  AutocompleteSessionToken?: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: Record<string, unknown>) => Promise<{ suggestions?: unknown[] }>;
  };
}

interface GoogleAddressServiceOptions {
  apiKey?: string;
  placesLibrary?: GooglePlacesLibrary;
}

const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-js-api';
const MIN_AUTOCOMPLETE_CHARS = 3;

let googleMapsScriptPromise: Promise<void> | null = null;

const clean = (value: string | null | undefined) => value?.trim() ?? '';

const getConfiguredGoogleMapsApiKey = () => clean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

export const isGooglePlacesConfigured = (apiKey = getConfiguredGoogleMapsApiKey()) => clean(apiKey).length > 0;

const getString = (value: unknown): string => (
  typeof value === 'string' ? value : value?.toString?.() ?? ''
);

const getNumber = (value: unknown): number | null => {
  const maybeNumber = typeof value === 'function' ? value() : value;
  return typeof maybeNumber === 'number' && Number.isFinite(maybeNumber) ? maybeNumber : null;
};

const loadGoogleMapsScript = async (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Maps can be loaded only in a browser.');
  }

  const currentGoogle = (window as unknown as { google?: { maps?: unknown } }).google;
  if (currentGoogle?.maps) return;

  if (googleMapsScriptPromise) return googleMapsScriptPromise;

  googleMapsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Google Maps script failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places&v=weekly`;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Google Maps script failed to load.')), { once: true });
    document.head.appendChild(script);
  });

  return googleMapsScriptPromise;
};

const loadGooglePlacesLibrary = async (apiKey: string): Promise<GooglePlacesLibrary> => {
  await loadGoogleMapsScript(apiKey);
  const googleMaps = (window as unknown as {
    google?: { maps?: { importLibrary?: (library: string) => Promise<unknown> } };
  }).google?.maps;

  if (!googleMaps?.importLibrary) {
    throw new Error('Google Maps importLibrary is unavailable.');
  }

  return googleMaps.importLibrary('places') as Promise<GooglePlacesLibrary>;
};

const toSuggestion = (rawSuggestion: unknown, index: number): EventAddressSuggestion | null => {
  const placePrediction = (rawSuggestion as { placePrediction?: unknown } | null)?.placePrediction as
    | { placeId?: string; text?: unknown }
    | undefined;

  if (!placePrediction) return null;

  const label = clean(getString(placePrediction.text));
  if (!label) return null;

  return {
    id: placePrediction.placeId || `${label}-${index}`,
    label,
    placeId: placePrediction.placeId,
    raw: rawSuggestion,
  };
};

export const fetchGoogleAddressSuggestions = async (
  input: string,
  options: GoogleAddressServiceOptions = {},
): Promise<EventAddressSuggestion[]> => {
  const query = clean(input);
  const apiKey = options.apiKey ?? getConfiguredGoogleMapsApiKey();

  if (query.length < MIN_AUTOCOMPLETE_CHARS || !isGooglePlacesConfigured(apiKey)) {
    return [];
  }

  const placesLibrary = options.placesLibrary ?? await loadGooglePlacesLibrary(apiKey);
  const sessionToken = placesLibrary.AutocompleteSessionToken
    ? new placesLibrary.AutocompleteSessionToken()
    : undefined;
  const { suggestions = [] } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    language: 'cs',
    region: 'cz',
    sessionToken,
  });

  return suggestions
    .map((suggestion, index) => toSuggestion(suggestion, index))
    .filter((suggestion): suggestion is EventAddressSuggestion => Boolean(suggestion));
};

export const resolveGoogleAddressSuggestion = async (
  suggestion: EventAddressSuggestion,
): Promise<EventAddressSelection> => {
  const placePrediction = (suggestion.raw as { placePrediction?: unknown } | null)?.placePrediction as
    | { toPlace?: () => unknown }
    | undefined;
  const place = placePrediction?.toPlace?.() as
    | {
        id?: string;
        formattedAddress?: string;
        location?: { lat?: (() => number) | number; lng?: (() => number) | number };
        fetchFields?: (request: { fields: string[] }) => Promise<void>;
      }
    | undefined;

  if (!place) {
    return getManualAddressSelection(suggestion.label);
  }

  await place.fetchFields?.({ fields: ['id', 'formattedAddress', 'location'] });

  return {
    address: clean(place.formattedAddress) || suggestion.label,
    placeId: place.id || suggestion.placeId,
    locationLat: getNumber(place.location?.lat),
    locationLng: getNumber(place.location?.lng),
  };
};

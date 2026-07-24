import type { Event } from '../../../types';

export interface EventLocationInput {
  address?: string | null;
  city?: string | null;
  placeId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

export interface EventAddressSelection {
  address: string;
  placeId?: string;
  locationLat: number | null;
  locationLng: number | null;
}

const EMPTY_LOCATION_LABEL = 'Místo bude doplněno';

const clean = (value: string | null | undefined): string => value?.trim() ?? '';

const hasCoordinatePair = (lat: number | null | undefined, lng: number | null | undefined): lat is number => (
  typeof lat === 'number'
  && Number.isFinite(lat)
  && typeof lng === 'number'
  && Number.isFinite(lng)
);

export const getManualAddressSelection = (address: string): EventAddressSelection => ({
  address: clean(address),
  placeId: undefined,
  locationLat: null,
  locationLng: null,
});

export const hasEventCoordinates = (location: Pick<EventLocationInput, 'locationLat' | 'locationLng'>): boolean => (
  hasCoordinatePair(location.locationLat, location.locationLng)
);

export const getEventAddressLabel = (event: Pick<Event, 'address' | 'city'>): string => (
  clean(event.address) || clean(event.city) || EMPTY_LOCATION_LABEL
);

export const buildGoogleMapsSearchUrl = (location: EventLocationInput): string => {
  const query = hasCoordinatePair(location.locationLat, location.locationLng)
    ? `${location.locationLat},${location.locationLng}`
    : clean(location.address) || clean(location.city);
  const params = [`api=1`, `query=${encodeURIComponent(query || EMPTY_LOCATION_LABEL)}`];
  const placeId = clean(location.placeId);

  if (placeId) {
    params.push(`query_place_id=${encodeURIComponent(placeId)}`);
  }

  return `https://www.google.com/maps/search/?${params.join('&')}`;
};

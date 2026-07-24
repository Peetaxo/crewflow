import { describe, expect, it } from 'vitest';
import type { Event } from '../../../types';
import {
  buildGoogleMapsSearchUrl,
  getEventAddressLabel,
  getManualAddressSelection,
  hasEventCoordinates,
} from './event-location.service';

const baseEvent: Event = {
  id: 1,
  name: 'Akce',
  job: 'AK001',
  startDate: '2026-07-29',
  endDate: '2026-07-29',
  city: '',
  needed: 1,
  filled: 0,
  status: 'upcoming',
  client: 'NEXTLEVEL S.R.O.',
};

describe('event location service', () => {
  it('prefers event address before legacy city when building the display label', () => {
    expect(getEventAddressLabel({
      ...baseEvent,
      address: 'Rohanske nabrezi 678/23, Praha',
      city: 'Praha',
    })).toBe('Rohanske nabrezi 678/23, Praha');
  });

  it('falls back to legacy city and then empty-state text', () => {
    expect(getEventAddressLabel({ ...baseEvent, city: 'Roudnice nad Labem' })).toBe('Roudnice nad Labem');
    expect(getEventAddressLabel(baseEvent)).toBe('Místo bude doplněno');
  });

  it('builds a Google Maps URL from coordinates and place id when available', () => {
    expect(buildGoogleMapsSearchUrl({
      address: 'Rohanske nabrezi 678/23, Praha',
      placeId: 'ChIJ-place-id',
      locationLat: 50.0929,
      locationLng: 14.4502,
    })).toBe('https://www.google.com/maps/search/?api=1&query=50.0929%2C14.4502&query_place_id=ChIJ-place-id');
  });

  it('builds a Google Maps URL from the address fallback', () => {
    expect(buildGoogleMapsSearchUrl({
      address: 'Roudnice nad Labem',
      locationLat: null,
      locationLng: null,
    })).toBe('https://www.google.com/maps/search/?api=1&query=Roudnice%20nad%20Labem');
  });

  it('trims manual address selections and clears precise location metadata', () => {
    expect(getManualAddressSelection('  Rohanske nabrezi 678/23, Praha  ')).toEqual({
      address: 'Rohanske nabrezi 678/23, Praha',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    });
  });

  it('detects coordinates only when a complete finite coordinate pair is present', () => {
    expect(hasEventCoordinates({ locationLat: 50.0929, locationLng: 14.4502 })).toBe(true);

    expect(hasEventCoordinates({ locationLat: 50.0929, locationLng: null })).toBe(false);
    expect(hasEventCoordinates({ locationLat: null, locationLng: 14.4502 })).toBe(false);
    expect(hasEventCoordinates({ locationLat: Number.NaN, locationLng: 14.4502 })).toBe(false);
    expect(hasEventCoordinates({ locationLat: 50.0929, locationLng: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

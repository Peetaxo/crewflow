import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetEventGeocodingStateForTests,
  buildNominatimSearchUrl,
  EventGeocodingRateLimitError,
  searchFreeEventLocations,
} from './event-geocoding.service';

const okResponse = (items: unknown[]) => ({
  ok: true,
  json: vi.fn().mockResolvedValue(items),
});

describe('event geocoding service', () => {
  beforeEach(() => {
    __resetEventGeocodingStateForTests();
  });

  it('returns no candidates and skips the provider for blank or short input', async () => {
    const fetcher = vi.fn();

    await expect(searchFreeEventLocations('   ', { fetcher })).resolves.toEqual([]);
    await expect(searchFreeEventLocations('ab', { fetcher })).resolves.toEqual([]);
    await expect(searchFreeEventLocations('  žď ', { fetcher })).resolves.toEqual([]);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('builds a Czech Nominatim search URL for an address query', () => {
    expect(buildNominatimSearchUrl('Rohanské nábřeží 678/23, Praha')).toBe(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&q=Rohansk%C3%A9%20n%C3%A1b%C5%99e%C5%BE%C3%AD%20678%2F23%2C%20Praha&limit=5&addressdetails=1&accept-language=cs&countrycodes=cz',
    );
  });

  it('normalizes valid Nominatim records into event geocoding candidates', async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse([
      {
        osm_type: 'way',
        osm_id: 123,
        display_name: 'Rohanské nábřeží 678/23, Karlín, Praha',
        lat: '50.0929',
        lon: '14.4502',
      },
    ]));

    await expect(searchFreeEventLocations('Rohanské nábřeží', { fetcher, cooldownMs: 0 })).resolves.toEqual([
      {
        id: 'way-123',
        label: 'Rohanské nábřeží 678/23, Karlín, Praha',
        locationLat: 50.0929,
        locationLng: 14.4502,
        provider: 'nominatim',
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      buildNominatimSearchUrl('Rohanské nábřeží'),
      { headers: { Accept: 'application/json' } },
    );
  });

  it('returns cached candidates for repeated normalized queries without another provider call', async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse([
      {
        osm_type: 'node',
        osm_id: 456,
        display_name: 'Žižkov, Praha',
        lat: '50.0833',
        lon: '14.4667',
      },
    ]));

    const first = await searchFreeEventLocations('  ŽIŽKOV  ', { fetcher, now: () => 1000 });
    const second = await searchFreeEventLocations('žižkov', { fetcher, now: () => 1001 });

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects an uncached second provider query inside the cooldown window', async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse([]));

    await expect(searchFreeEventLocations('Praha centrum', { fetcher, now: () => 1000 })).resolves.toEqual([]);
    await expect(searchFreeEventLocations('Brno centrum', { fetcher, now: () => 1500 })).rejects.toBeInstanceOf(
      EventGeocodingRateLimitError,
    );
    await expect(searchFreeEventLocations('Brno centrum', { fetcher, now: () => 1500 })).rejects.toThrow(
      'Vyhledávání adres je dostupné za chvíli. Zkuste to prosím znovu.',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('filters invalid provider records without labels or finite coordinates', async () => {
    const fetcher = vi.fn().mockResolvedValue(okResponse([
      { osm_type: 'node', osm_id: 1, display_name: '', lat: '50.1', lon: '14.1' },
      { osm_type: 'node', osm_id: 2, display_name: 'Missing latitude', lon: '14.2' },
      { osm_type: 'node', osm_id: 3, display_name: 'Invalid longitude', lat: '50.3', lon: 'Infinity' },
      { osm_id: 4, display_name: 'Fallback result id', lat: '50.4', lon: '14.4' },
      { osm_type: 'relation', display_name: 'Index fallback id', lat: '50.5', lon: '14.5' },
    ]));

    await expect(searchFreeEventLocations('Praha náměstí', { fetcher, cooldownMs: 0 })).resolves.toEqual([
      {
        id: 'result-4',
        label: 'Fallback result id',
        locationLat: 50.4,
        locationLng: 14.4,
        provider: 'nominatim',
      },
      {
        id: 'relation-4',
        label: 'Index fallback id',
        locationLat: 50.5,
        locationLng: 14.5,
        provider: 'nominatim',
      },
    ]);
  });

  it('throws a Czech failure message when the provider responds with a non-ok status', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: vi.fn() });

    await expect(searchFreeEventLocations('Praha Dejvice', { fetcher, cooldownMs: 0 })).rejects.toThrow(
      'Adresu se nepodařilo najít.',
    );
  });

  it('throws a Czech failure message when the provider request rejects', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(searchFreeEventLocations('Praha Dejvice', { fetcher, cooldownMs: 0 })).rejects.toThrow(
      'Adresu se nepodařilo najít.',
    );
  });

  it('throws a Czech failure message when the provider JSON cannot be parsed', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0')),
    });

    await expect(searchFreeEventLocations('Praha Dejvice', { fetcher, cooldownMs: 0 })).rejects.toThrow(
      'Adresu se nepodařilo najít.',
    );
  });
});

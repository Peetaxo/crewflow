import { describe, expect, it, vi } from 'vitest';
import {
  fetchGoogleAddressSuggestions,
  getManualAddressSelection,
  isGooglePlacesConfigured,
  resolveGoogleAddressSuggestion,
} from './event-location-google.service';

describe('event location Google service', () => {
  it('treats Google Places as unavailable without an API key', async () => {
    const fetchAutocompleteSuggestions = vi.fn();

    expect(isGooglePlacesConfigured('')).toBe(false);
    expect(isGooglePlacesConfigured('   ')).toBe(false);
    expect(await fetchGoogleAddressSuggestions('Roh', {
      apiKey: '',
      placesLibrary: { AutocompleteSuggestion: { fetchAutocompleteSuggestions } },
    })).toEqual([]);
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });

  it('keeps manual address text while clearing precise map metadata', () => {
    expect(getManualAddressSelection(' Roudnice nad Labem ')).toEqual({
      address: 'Roudnice nad Labem',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    });
  });

  it('normalizes Google autocomplete suggestions from a mocked Places library', async () => {
    const sessionToken = { token: 'session-1' };
    const AutocompleteSessionToken = vi.fn(function AutocompleteSessionToken() {
      return sessionToken;
    });
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: 'place-1',
            text: { toString: () => 'Rohanské nábřeží 678/23, Praha' },
          },
        },
      ],
    });

    const suggestions = await fetchGoogleAddressSuggestions('Rohan', {
      apiKey: 'google-key',
      placesLibrary: {
        AutocompleteSessionToken,
        AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      },
    });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      input: 'Rohan',
      language: 'cs',
      region: 'cz',
      sessionToken,
    }));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: 'place-1',
      label: 'Rohanské nábřeží 678/23, Praha',
      placeId: 'place-1',
    });
  });

  it('normalizes selected place details into address metadata', async () => {
    const fetchFields = vi.fn().mockResolvedValue(undefined);
    const suggestion = {
      id: 'place-1',
      label: 'Rohanské nábřeží 678/23, Praha',
      placeId: 'place-1',
      raw: {
        placePrediction: {
          toPlace: () => ({
            id: 'place-1',
            formattedAddress: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
            location: {
              lat: () => 50.0929,
              lng: () => 14.4502,
            },
            fetchFields,
          }),
        },
      },
    };

    await expect(resolveGoogleAddressSuggestion(suggestion)).resolves.toEqual({
      address: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
      placeId: 'place-1',
      locationLat: 50.0929,
      locationLng: 14.4502,
    });
    expect(fetchFields).toHaveBeenCalledWith({
      fields: ['id', 'formattedAddress', 'location'],
    });
  });
});

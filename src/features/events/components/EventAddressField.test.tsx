import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EventAddressField from './EventAddressField';
import type { EventGeocodingCandidate } from '../services/event-geocoding.service';

const candidate: EventGeocodingCandidate = {
  id: 'way-123',
  label: 'Rohanské nábřeží 678/23, Praha',
  locationLat: 50.0929,
  locationLng: 14.4502,
  provider: 'nominatim',
};

describe('EventAddressField', () => {
  it('keeps manual address entry editable and clears precise map metadata', () => {
    const onChange = vi.fn();
    const geocodeAddress = vi.fn();

    render(
      <EventAddressField
        value={{ address: 'Praha', city: 'Praha', placeId: 'old-place', locationLat: 50.08, locationLng: 14.42 }}
        onChange={onChange}
        geocodeAddress={geocodeAddress}
      />,
    );

    const addressInput = screen.getByLabelText('Adresa');
    expect(addressInput).toHaveValue('Praha');

    fireEvent.change(addressInput, {
      target: { value: 'Ro' },
    });

    expect(onChange).toHaveBeenCalledWith({
      address: 'Ro',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    });
    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Najít na mapě' })).toBeDisabled();
  });

  it('searches only after clicking Najít na mapě and shows candidates', async () => {
    const geocodeAddress = vi.fn().mockResolvedValue([candidate]);

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: '  Rohanské nábřeží  ' },
    });

    expect(geocodeAddress).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));

    await waitFor(() => expect(geocodeAddress).toHaveBeenCalledWith('Rohanské nábřeží'));
    expect(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).toBeInTheDocument();
  });

  it('stores precise coordinates and clears placeId when selecting a geocoding candidate', async () => {
    const onChange = vi.fn();
    const geocodeAddress = vi.fn().mockResolvedValue([candidate]);

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={onChange}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' }));

    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Rohanské nábřeží 678/23, Praha',
      placeId: undefined,
      locationLat: 50.0929,
      locationLng: 14.4502,
    });
    expect(screen.getByDisplayValue('Rohanské nábřeží 678/23, Praha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).not.toBeInTheDocument();
    expect(screen.getByText('Poloha je vybraná z mapových podkladů.')).toBeInTheDocument();
  });

  it('ignores stale geocode results after the address changes mid-search', async () => {
    let resolveSearch!: (candidates: EventGeocodingCandidate[]) => void;
    const geocodeAddress = vi.fn(() => new Promise<EventGeocodingCandidate[]>((resolve) => {
      resolveSearch = resolve;
    }));

    render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    const searchButton = screen.getByRole('button', { name: 'Najít na mapě' });
    fireEvent.click(searchButton);
    expect(searchButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Nová adresa' },
    });

    await act(async () => {
      resolveSearch([candidate]);
    });

    expect(screen.getByRole('button', { name: 'Najít na mapě' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).not.toBeInTheDocument();
    expect(screen.queryByText('Vyberte správnou polohu z výsledků.')).not.toBeInTheDocument();
  });

  it('shows no-result and provider failure statuses in Czech', async () => {
    const geocodeAddress = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Vyhledávání adres je dostupné za chvíli. Zkuste to prosím znovu.'));

    render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));

    expect(await screen.findByText('Poloha nebyla nalezena. Adresu lze uložit ručně.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));

    expect(await screen.findByText('Vyhledávání adres je dostupné za chvíli. Zkuste to prosím znovu.')).toBeInTheDocument();
  });
});

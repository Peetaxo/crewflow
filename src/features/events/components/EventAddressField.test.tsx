import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventAddressField from './EventAddressField';
import type { EventGeocodingCandidate } from '../services/event-geocoding.service';

const candidate: EventGeocodingCandidate = {
  id: 'way-123',
  label: 'Rohanské nábřeží 678/23, Praha',
  locationLat: 50.0929,
  locationLng: 14.4502,
  provider: 'nominatim',
};

const runAutocomplete = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();
  });
};

describe('EventAddressField', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(screen.queryByRole('button', { name: 'Najít na mapě' })).not.toBeInTheDocument();
  });

  it('searches automatically while typing and shows candidates', async () => {
    vi.useFakeTimers();
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

    await runAutocomplete();

    expect(geocodeAddress).toHaveBeenCalledWith('Rohanské nábřeží');
    expect(screen.getByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).toBeInTheDocument();
  });

  it('stores precise coordinates and clears placeId when selecting a geocoding candidate', async () => {
    vi.useFakeTimers();
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
    await runAutocomplete();
    fireEvent.click(screen.getByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' }));

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
    vi.useFakeTimers();
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

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží 1' },
    });
    await runAutocomplete();
    expect(geocodeAddress).toHaveBeenCalledWith('Rohanské nábřeží 1');

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Nová adresa' },
    });

    await act(async () => {
      resolveSearch([candidate]);
    });

    expect(screen.queryByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).not.toBeInTheDocument();
    expect(screen.queryByText('Vyberte správnou polohu z výsledků.')).not.toBeInTheDocument();
  });

  it('does not apply stale geocode results after value props change mid-search', async () => {
    vi.useFakeTimers();
    let resolveSearch!: (candidates: EventGeocodingCandidate[]) => void;
    const geocodeAddress = vi.fn(() => new Promise<EventGeocodingCandidate[]>((resolve) => {
      resolveSearch = resolve;
    }));
    const { rerender } = render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží 1' },
    });
    await runAutocomplete();

    rerender(
      <EventAddressField
        value={{ address: 'Nová adresa' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    await act(async () => {
      resolveSearch([candidate]);
    });

    expect(screen.getByLabelText('Adresa')).toHaveValue('Nová adresa');
    expect(screen.queryByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).not.toBeInTheDocument();
    expect(screen.queryByText('Vyberte správnou polohu z výsledků.')).not.toBeInTheDocument();
    expect(screen.queryByText('Hledám adresy...')).not.toBeInTheDocument();
  });

  it('shows a safe Czech fallback when geocoding fails with a technical error', async () => {
    vi.useFakeTimers();
    const geocodeAddress = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží 1' },
    });
    await runAutocomplete();

    expect(screen.getByText('Vyhledávání polohy se nepodařilo. Zkuste to prosím znovu.')).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('shows no-result and provider failure statuses in Czech', async () => {
    vi.useFakeTimers();
    const geocodeAddress = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží 1' },
    });
    await runAutocomplete();

    expect(screen.getByText('Poloha nebyla nalezena. Adresu lze uložit ručně.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží 2' },
    });
    await runAutocomplete();

    expect(screen.getByText('Vyhledávání polohy se nepodařilo. Zkuste to prosím znovu.')).toBeInTheDocument();
  });

  it('offers a separate map picker action when provided', () => {
    const onPickMap = vi.fn();

    render(
      <EventAddressField
        value={{ address: 'Rohanské nábřeží' }}
        onChange={vi.fn()}
        onPickMap={onPickMap}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Najít na mapě' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Vybrat na mapě' }));

    expect(onPickMap).toHaveBeenCalledTimes(1);
  });
});

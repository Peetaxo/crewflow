import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EventAddressField from './EventAddressField';
import type { EventAddressSuggestion } from '../services/event-location-google.service';

const selectedSuggestion: EventAddressSuggestion = {
  id: 'place-1',
  label: 'Rohanské nábřeží 678/23, Praha',
  placeId: 'place-1',
};

describe('EventAddressField', () => {
  it('keeps manual address entry available and clears precise map metadata', () => {
    const onChange = vi.fn();

    render(
      <EventAddressField
        value={{ address: 'Praha', city: 'Praha' }}
        onChange={onChange}
        autocompleteEnabled={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Roudnice nad Labem' },
    });

    expect(onChange).toHaveBeenCalledWith({
      address: 'Roudnice nad Labem',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    });
    expect(screen.getByText('Našeptávání adres není nakonfigurované. Adresu lze zadat ručně.')).toBeInTheDocument();
  });

  it('shows mocked suggestions after at least three typed characters', async () => {
    const fetchSuggestions = vi.fn().mockResolvedValue([selectedSuggestion]);

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={vi.fn()}
        autocompleteEnabled
        fetchSuggestions={fetchSuggestions}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Ro' },
    });

    expect(fetchSuggestions).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Roh' },
    });

    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledWith('Roh'));
    expect(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).toBeInTheDocument();
  });

  it('stores precise address metadata when selecting a suggestion', async () => {
    const onChange = vi.fn();
    const fetchSuggestions = vi.fn().mockResolvedValue([selectedSuggestion]);
    const resolveSuggestion = vi.fn().mockResolvedValue({
      address: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
      placeId: 'place-1',
      locationLat: 50.0929,
      locationLng: 14.4502,
    });

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={onChange}
        autocompleteEnabled
        fetchSuggestions={fetchSuggestions}
        resolveSuggestion={resolveSuggestion}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Roh' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' }));

    await waitFor(() => expect(resolveSuggestion).toHaveBeenCalledWith(selectedSuggestion));
    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Rohanské nábřeží 678/23, 186 00 Praha 8',
      placeId: 'place-1',
      locationLat: 50.0929,
      locationLng: 14.4502,
    });
    expect(screen.getByDisplayValue('Rohanské nábřeží 678/23, 186 00 Praha 8')).toBeInTheDocument();
  });
});

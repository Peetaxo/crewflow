import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '../../types';

type MockEventAddressSelection = {
  address: string;
  placeId?: string;
  locationLat: number | null;
  locationLng: number | null;
};

type MockEventAddressFieldProps = {
  value: Event;
  onChange: (selection: MockEventAddressSelection) => void;
};

type MockEventMapPreviewProps = {
  address?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  editable?: boolean;
  onLocationChange?: (coords: { locationLat: number; locationLng: number }) => void;
};

const event: Event = {
  id: 1,
  name: 'Ploom PopUp - Metropole Zlicin',
  job: 'JTI001',
  startDate: '2026-04-20',
  endDate: '2026-04-20',
  startTime: '20:00',
  endTime: '01:00',
  city: 'Praha',
  needed: 2,
  filled: 2,
  status: 'upcoming',
  client: 'NextLevel s.r.o.',
};

const mockEventServices = ({
  clients = [{ id: 1, name: 'NextLevel s.r.o.' }],
}: {
  clients?: Array<{ id: number; name: string }>;
} = {}) => {
  vi.doMock('../../features/events/services/events.service', () => ({
    applyEventDraft: (nextEvent: Event) => nextEvent,
    createDefaultPhaseTimes: (from: string, to: string) => ({
      instal: { from, to },
      provoz: { from, to },
      deinstal: { from, to },
    }),
    getEventFormOptions: () => ({
      projects: [{ id: 'JTI001', name: 'JTI', client: 'NextLevel s.r.o.' }],
      clients,
    }),
    normalizeEventSchedules: () => ({}),
    saveEvent: vi.fn(),
  }));
};

const mockLocationComponents = () => {
  vi.doMock('../../features/events/components/EventAddressField', () => ({
    default: ({ value, onChange }: MockEventAddressFieldProps) => (
      <div>
        <label htmlFor="mock-event-address">Adresa</label>
        <input
          id="mock-event-address"
          readOnly
          value={value.address || value.city || ''}
        />
        <button
          type="button"
          onClick={() => onChange({
            address: 'Rohanské nábřeží 678/23, Praha',
            placeId: undefined,
            locationLat: 50.0929,
            locationLng: 14.4502,
          })}
        >
          Select geocoded address
        </button>
      </div>
    ),
  }));

  vi.doMock('../../features/events/components/EventMapPreview', () => ({
    default: ({
      address,
      locationLat,
      locationLng,
      editable,
      onLocationChange,
    }: MockEventMapPreviewProps) => (
      <div
        data-testid="event-map-preview"
        data-address={address || ''}
        data-location-lat={locationLat ?? ''}
        data-location-lng={locationLng ?? ''}
        data-editable={editable ? 'true' : 'false'}
      >
        <button
          type="button"
          onClick={() => onLocationChange?.({
            locationLat: 49.1951,
            locationLng: 16.6068,
          })}
        >
          Move marker
        </button>
      </div>
    ),
  }));
};

describe('EventEditModal', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows the current event client even when client options are not hydrated yet', async () => {
    mockEventServices({ clients: [] });
    mockLocationComponents();

    const { default: EventEditModal } = await import('./EventEditModal');

    const { container } = render(
      <EventEditModal
        editingEvent={event}
        onClose={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    const clientSelect = container.querySelector('select') as HTMLSelectElement;

    expect(clientSelect.value).toBe('NextLevel s.r.o.');
    expect(screen.getByRole('option', { name: 'NextLevel s.r.o.' })).toBeInTheDocument();
  });

  it('updates address, legacy city, placeId, and coordinates when a geocoded address is selected', async () => {
    mockEventServices();
    mockLocationComponents();

    const onChange = vi.fn();
    const { default: EventEditModal } = await import('./EventEditModal');

    render(
      <EventEditModal
        editingEvent={{
          ...event,
          address: 'Rohanske nabrezi 678/23, Praha',
          placeId: 'ChIJ-event-place',
          locationLat: 50.0929,
          locationLng: 14.4502,
        }}
        onClose={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Adresa')).toBeInTheDocument();
    expect(screen.queryByText('Mesto')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select geocoded address' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Rohanské nábřeží 678/23, Praha',
      city: 'Rohanské nábřeží 678/23, Praha',
      placeId: undefined,
      locationLat: 50.0929,
      locationLng: 14.4502,
    }));
  });

  it('renders an editable map and updates only coordinates and placeId when marker moves', async () => {
    mockEventServices();
    mockLocationComponents();

    const onChange = vi.fn();
    const { default: EventEditModal } = await import('./EventEditModal');

    render(
      <EventEditModal
        editingEvent={{
          ...event,
          address: 'Rohanské nábřeží 678/23, Praha',
          city: 'Praha',
          placeId: 'ChIJ-event-place',
          locationLat: 50.0929,
          locationLng: 14.4502,
        }}
        onClose={vi.fn()}
        onChange={onChange}
      />,
    );

    const mapPreview = screen.getByTestId('event-map-preview');

    expect(mapPreview).toHaveAttribute('data-address', 'Rohanské nábřeží 678/23, Praha');
    expect(mapPreview).toHaveAttribute('data-location-lat', '50.0929');
    expect(mapPreview).toHaveAttribute('data-location-lng', '14.4502');
    expect(mapPreview).toHaveAttribute('data-editable', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Move marker' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      address: 'Rohanské nábřeží 678/23, Praha',
      city: 'Praha',
      client: 'NextLevel s.r.o.',
      name: 'Ploom PopUp - Metropole Zlicin',
      placeId: undefined,
      locationLat: 49.1951,
      locationLng: 16.6068,
    }));
  });
});

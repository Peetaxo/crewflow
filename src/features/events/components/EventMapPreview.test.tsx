import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventMapPreview from './EventMapPreview';

type DisableHandle = {
  disable: ReturnType<typeof vi.fn>;
};

type MockMap = {
  boxZoom: DisableHandle;
  doubleClickZoom: DisableHandle;
  dragging: DisableHandle;
  keyboard: DisableHandle;
  remove: ReturnType<typeof vi.fn>;
  scrollWheelZoom: DisableHandle;
  setView: ReturnType<typeof vi.fn>;
  touchZoom: DisableHandle;
};

type MockMarker = {
  addTo: ReturnType<typeof vi.fn>;
  getLatLng: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  setLatLng: ReturnType<typeof vi.fn>;
};

let lastMap: MockMap;
let lastMarker: MockMarker;
let markerEventHandlers: Record<string, () => void>;

const leafletMock = vi.hoisted(() => ({
  divIcon: vi.fn(),
  map: vi.fn(),
  marker: vi.fn(),
  tileLayer: vi.fn(),
}));

const { divIcon: divIconMock, map: mapMock, marker: markerMock, tileLayer: tileLayerMock } = leafletMock;

const createDisableHandle = (): DisableHandle => ({
  disable: vi.fn(),
});

vi.mock('leaflet', () => {
  leafletMock.map.mockImplementation((element: HTMLElement) => {
    lastMap = {
      boxZoom: createDisableHandle(),
      doubleClickZoom: createDisableHandle(),
      dragging: createDisableHandle(),
      keyboard: createDisableHandle(),
      remove: vi.fn(),
      scrollWheelZoom: createDisableHandle(),
      setView: vi.fn().mockReturnThis(),
      touchZoom: createDisableHandle(),
    };

    return lastMap;
  });

  leafletMock.tileLayer.mockImplementation(() => ({
    addTo: vi.fn().mockReturnThis(),
  }));

  leafletMock.marker.mockImplementation(() => {
    markerEventHandlers = {};
    lastMarker = {
      addTo: vi.fn().mockReturnThis(),
      getLatLng: vi.fn(),
      on: vi.fn((eventName: string, handler: () => void) => {
        markerEventHandlers[eventName] = handler;
        return lastMarker;
      }),
      setLatLng: vi.fn(),
    };

    return lastMarker;
  });

  leafletMock.divIcon.mockImplementation((options) => options);

  const leaflet = {
    divIcon: leafletMock.divIcon,
    map: leafletMock.map,
    marker: leafletMock.marker,
    tileLayer: leafletMock.tileLayer,
  };

  return {
    ...leaflet,
    default: leaflet,
  };
});

describe('EventMapPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markerEventHandlers = {};
  });

  it('shows a Czech placeholder when coordinates are missing', () => {
    render(<EventMapPreview address="Rohanské nábřeží 678/23, Praha" locationLat={null} locationLng={14.4502} />);

    expect(screen.getByText('Mapa se zobrazí po nalezení polohy.')).toBeInTheDocument();
    expect(screen.getByText('Rohanské nábřeží 678/23, Praha')).toBeInTheDocument();
    expect(mapMock).not.toHaveBeenCalled();
  });

  it('renders a Google Maps link when href is provided', () => {
    render(
      <EventMapPreview
        address="Praha"
        googleMapsUrl="https://www.google.com/maps/search/?api=1&query=Praha"
        locationLat={50.0929}
        locationLng={14.4502}
      />,
    );

    const link = screen.getByRole('link', { name: 'Otevřít mapu' });
    expect(link).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Praha');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('creates a Leaflet map with OSM tiles and a divIcon marker for valid coordinates', () => {
    render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    expect(mapMock).toHaveBeenCalledTimes(1);
    expect(lastMap.setView).toHaveBeenCalledWith([50.0929, 14.4502], 15);
    expect(tileLayerMock).toHaveBeenCalledWith(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      expect.objectContaining({
        attribution: expect.stringContaining('OpenStreetMap contributors'),
      }),
    );
    expect(divIconMock).toHaveBeenCalledWith(expect.objectContaining({
      className: 'nodu-event-map-marker',
    }));
    expect(markerMock).toHaveBeenCalledWith(
      [50.0929, 14.4502],
      expect.objectContaining({
        draggable: false,
        icon: expect.objectContaining({ className: 'nodu-event-map-marker' }),
      }),
    );
    expect(lastMarker.addTo).toHaveBeenCalledWith(lastMap);
  });

  it('disables map interactions in read-only mode', () => {
    render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    expect(lastMap.dragging.disable).toHaveBeenCalledOnce();
    expect(lastMap.scrollWheelZoom.disable).toHaveBeenCalledOnce();
    expect(lastMap.touchZoom.disable).toHaveBeenCalledOnce();
    expect(lastMap.doubleClickZoom.disable).toHaveBeenCalledOnce();
    expect(lastMap.boxZoom.disable).toHaveBeenCalledOnce();
    expect(lastMap.keyboard.disable).toHaveBeenCalledOnce();
  });

  it('calls onLocationChange with rounded coordinates after editable marker drag', () => {
    const onLocationChange = vi.fn();

    render(
      <EventMapPreview
        editable
        address="Praha"
        locationLat={50.0929}
        locationLng={14.4502}
        onLocationChange={onLocationChange}
      />,
    );

    expect(markerMock).toHaveBeenCalledWith(
      [50.0929, 14.4502],
      expect.objectContaining({ draggable: true }),
    );

    lastMarker.getLatLng.mockReturnValue({ lat: 50.123456789, lng: 14.987654321 });
    markerEventHandlers.dragend();

    expect(onLocationChange).toHaveBeenCalledWith({
      locationLat: 50.123457,
      locationLng: 14.987654,
    });
  });

  it('updates the existing marker position when coordinates change on rerender', () => {
    const { rerender } = render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    rerender(<EventMapPreview address="Brno" locationLat={49.1951} locationLng={16.6068} />);

    expect(markerMock).toHaveBeenCalledTimes(1);
    expect(lastMap.setView).toHaveBeenLastCalledWith([49.1951, 16.6068], 15);
    expect(lastMarker.setLatLng).toHaveBeenCalledWith([49.1951, 16.6068]);
  });
});

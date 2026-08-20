import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventMapPreview from './EventMapPreview';

type MockMap = {
  addControl: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
  jumpTo: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  triggerRepaint: ReturnType<typeof vi.fn>;
};

type MockMarker = {
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setLngLat: ReturnType<typeof vi.fn>;
};

let lastMap: MockMap;
let lastMarker: MockMarker;
let mapContainer: HTMLDivElement;
let mapEventHandlers: Record<string, () => void>;

const maplibreMock = vi.hoisted(() => ({
  Map: vi.fn(),
  Marker: vi.fn(),
  NavigationControl: vi.fn(),
}));

const { Map: mapMock, Marker: markerMock, NavigationControl: navigationControlMock } = maplibreMock;

vi.mock('maplibre-gl', () => {
  maplibreMock.Map.mockImplementation(function MockMapConstructor() {
    mapEventHandlers = {};
    mapContainer = document.createElement('div');
    const attribution = document.createElement('details');
    attribution.className = 'maplibregl-ctrl maplibregl-ctrl-attrib maplibregl-compact maplibregl-compact-show';
    attribution.setAttribute('open', '');
    mapContainer.append(attribution);
    lastMap = {
      addControl: vi.fn().mockReturnThis(),
      getCenter: vi.fn(() => ({ lat: 50.0929, lng: 14.4502 })),
      getContainer: vi.fn(() => mapContainer),
      jumpTo: vi.fn().mockReturnThis(),
      on: vi.fn((eventName: string, handler: () => void) => {
        mapEventHandlers[eventName] = handler;
        return lastMap;
      }),
      remove: vi.fn(),
      resize: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    return lastMap;
  });

  maplibreMock.Marker.mockImplementation(function MockMarkerConstructor() {
    lastMarker = {
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      setLngLat: vi.fn().mockReturnThis(),
    };

    return lastMarker;
  });

  maplibreMock.NavigationControl.mockImplementation(function MockNavigationControlConstructor() {
    return {};
  });

  const maplibre = {
    Map: maplibreMock.Map,
    Marker: maplibreMock.Marker,
    NavigationControl: maplibreMock.NavigationControl,
  };

  return {
    ...maplibre,
    default: maplibre,
  };
});

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('EventMapPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mapEventHandlers = {};
  });

  it('shows a Czech placeholder when coordinates are missing', () => {
    render(<EventMapPreview address="Rohanské nábřeží 678/23, Praha" locationLat={null} locationLng={14.4502} />);

    expect(screen.getByText('Mapa se zobrazí po výběru polohy.')).toBeInTheDocument();
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

  it('creates a MapLibre map with the OpenFreeMap Positron style and a compact upright marker for valid coordinates', () => {
    render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    expect(mapMock).toHaveBeenCalledTimes(1);
    expect(mapMock).toHaveBeenCalledWith(expect.objectContaining({
      attributionControl: { compact: true },
      center: [14.4502, 50.0929],
      canvasContextAttributes: expect.objectContaining({
        contextType: 'webgl',
        powerPreference: 'default',
        preserveDrawingBuffer: false,
      }),
      container: expect.any(HTMLElement),
      interactive: false,
      style: 'https://tiles.openfreemap.org/styles/positron',
      zoom: 15,
    }));
    expect(markerMock).toHaveBeenCalledWith(expect.objectContaining({
      anchor: 'bottom',
      element: expect.any(HTMLDivElement),
    }));
    const markerElement = markerMock.mock.calls[0][0].element as HTMLElement;
    expect(markerElement).toHaveClass('nodu-event-map-marker');
    expect(lastMarker.setLngLat).toHaveBeenCalledWith([14.4502, 50.0929]);
    expect(lastMarker.addTo).toHaveBeenCalledWith(lastMap);
  });

  it('keeps the read-only map non-interactive without adding zoom controls', () => {
    render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    expect(mapMock).toHaveBeenCalledWith(expect.objectContaining({
      interactive: false,
    }));
    expect(navigationControlMock).not.toHaveBeenCalled();
  });

  it('settles and repaints the map after mobile layout and style events', () => {
    vi.useFakeTimers();

    render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    expect(lastMap.resize).not.toHaveBeenCalled();
    expect(lastMap.triggerRepaint).not.toHaveBeenCalled();
    expect(lastMap.on).toHaveBeenCalledWith('load', expect.any(Function));
    expect(lastMap.on).toHaveBeenCalledWith('styledata', expect.any(Function));
    expect(lastMap.on).toHaveBeenCalledWith('idle', expect.any(Function));

    vi.runOnlyPendingTimers();
    expect(lastMap.resize).toHaveBeenCalledTimes(4);
    expect(lastMap.triggerRepaint).toHaveBeenCalledTimes(4);
    expect(mapContainer.querySelector('.maplibregl-compact-show')).toBeNull();
    expect(mapContainer.querySelector('.maplibregl-ctrl-attrib')?.getAttribute('open')).toBeNull();

    const attribution = mapContainer.querySelector('.maplibregl-ctrl-attrib');
    attribution?.classList.add('maplibregl-compact-show');
    attribution?.setAttribute('open', '');

    mapEventHandlers.load();
    mapEventHandlers.styledata();
    mapEventHandlers.idle();
    expect(lastMap.resize).toHaveBeenCalledTimes(7);
    expect(lastMap.triggerRepaint).toHaveBeenCalledTimes(7);
    expect(mapContainer.querySelector('.maplibregl-compact-show')).toBeNull();
    expect(mapContainer.querySelector('.maplibregl-ctrl-attrib')?.getAttribute('open')).toBeNull();
  });

  it('calls onLocationChange with rounded map center after editable map move', () => {
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

    expect(mapMock).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true,
      style: 'https://tiles.openfreemap.org/styles/positron',
    }));
    expect(navigationControlMock).toHaveBeenCalledOnce();
    expect(screen.getByTestId('event-map-fixed-pin')).toBeInTheDocument();
    expect(markerMock).not.toHaveBeenCalled();

    lastMap.getCenter.mockReturnValue({ lat: 50.123456789, lng: 14.987654321 });
    mapEventHandlers.moveend();

    expect(onLocationChange).toHaveBeenCalledWith({
      locationLat: 50.123457,
      locationLng: 14.987654,
    });
  });

  it('does not report location changes when editable map movement keeps the same rounded center', () => {
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

    lastMap.getCenter.mockReturnValue({ lat: 50.0929001, lng: 14.4502001 });
    mapEventHandlers.moveend();

    expect(onLocationChange).not.toHaveBeenCalled();
  });

  it('preserves editable map zoom when external coordinates change', () => {
    const { rerender } = render(
      <EventMapPreview
        editable
        address="Praha"
        locationLat={50.0929}
        locationLng={14.4502}
        onLocationChange={vi.fn()}
      />,
    );

    lastMap.jumpTo.mockClear();

    rerender(
      <EventMapPreview
        editable
        address="Praha"
        locationLat={50.123457}
        locationLng={14.987654}
        onLocationChange={vi.fn()}
      />,
    );

    expect(lastMap.jumpTo).toHaveBeenLastCalledWith({
      center: [14.987654, 50.123457],
    });
  });

  it('updates the existing marker position when coordinates change on rerender', () => {
    const { rerender } = render(<EventMapPreview address="Praha" locationLat={50.0929} locationLng={14.4502} />);

    rerender(<EventMapPreview address="Brno" locationLat={49.1951} locationLng={16.6068} />);

    expect(markerMock).toHaveBeenCalledTimes(1);
    expect(lastMap.jumpTo).toHaveBeenLastCalledWith({
      center: [16.6068, 49.1951],
      zoom: 15,
    });
    expect(lastMarker.setLngLat).toHaveBeenCalledWith([16.6068, 49.1951]);
  });
});

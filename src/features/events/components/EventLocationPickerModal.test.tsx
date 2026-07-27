import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventLocationPickerModal from './EventLocationPickerModal';

type MockMap = {
  addControl: ReturnType<typeof vi.fn>;
  getCenter: ReturnType<typeof vi.fn>;
  getContainer: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  triggerRepaint: ReturnType<typeof vi.fn>;
};

let lastMap: MockMap;
let mapContainer: HTMLDivElement;
let mapEventHandlers: Record<string, () => void>;

const maplibreMock = vi.hoisted(() => ({
  Map: vi.fn(),
  NavigationControl: vi.fn(),
}));

const { Map: mapMock, NavigationControl: navigationControlMock } = maplibreMock;

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

  maplibreMock.NavigationControl.mockImplementation(function MockNavigationControlConstructor() {
    return {};
  });

  const maplibre = {
    Map: maplibreMock.Map,
    NavigationControl: maplibreMock.NavigationControl,
  };

  return {
    ...maplibre,
    default: maplibre,
  };
});

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

describe('EventLocationPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mapEventHandlers = {};
  });

  it('confirms the current MapLibre map center while the compact pin stays fixed', () => {
    const onConfirm = vi.fn();

    render(
      <EventLocationPickerModal
        address="Rohanské nábřeží 678/23, Praha"
        initialLocationLat={50.0929}
        initialLocationLng={14.4502}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

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
      interactive: true,
      style: 'https://tiles.openfreemap.org/styles/positron',
      zoom: 15,
    }));
    expect(navigationControlMock).toHaveBeenCalledOnce();
    const fixedPin = screen.getByTestId('event-location-fixed-pin');
    expect(fixedPin).toBeInTheDocument();
    expect(fixedPin.querySelector('svg')).toBeNull();

    act(() => {
      lastMap.getCenter.mockReturnValue({ lat: 49.1951234, lng: 16.6068767 });
      mapEventHandlers.moveend();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Potvrdit polohu' }));

    expect(onConfirm).toHaveBeenCalledWith({
      locationLat: 49.195123,
      locationLng: 16.606877,
    });
  });

  it('starts from the Czech Republic overview when no coordinates exist yet', () => {
    render(
      <EventLocationPickerModal
        address="Nová adresa"
        initialLocationLat={null}
        initialLocationLng={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(mapMock).toHaveBeenCalledWith(expect.objectContaining({
      center: [15.473, 49.8175],
      zoom: 7,
    }));
  });

  it('settles and repaints the picker map after mobile layout and style events', () => {
    vi.useFakeTimers();

    render(
      <EventLocationPickerModal
        address="Praha"
        initialLocationLat={50.0929}
        initialLocationLng={14.4502}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(lastMap.resize).not.toHaveBeenCalled();
    expect(lastMap.triggerRepaint).not.toHaveBeenCalled();
    expect(lastMap.on).toHaveBeenCalledWith('load', expect.any(Function));
    expect(lastMap.on).toHaveBeenCalledWith('styledata', expect.any(Function));
    expect(lastMap.on).toHaveBeenCalledWith('idle', expect.any(Function));

    vi.runOnlyPendingTimers();
    expect(lastMap.resize).toHaveBeenCalledTimes(4);
    expect(lastMap.triggerRepaint).toHaveBeenCalledTimes(4);

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
});

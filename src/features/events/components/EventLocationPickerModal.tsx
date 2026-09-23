import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X } from 'lucide-react';
import { collapseCompactAttribution, EVENT_MAP_ATTRIBUTION_CONTROL } from './event-map-attribution';
import { EVENT_MAP_CANVAS_CONTEXT_ATTRIBUTES, scheduleEventMapRenderingSettle } from './event-map-rendering';
import { EVENT_MAP_STYLE } from './event-map-style';
import './event-edit-form.css';

interface EventLocationPickerModalProps {
  address?: string | null;
  initialLocationLat?: number | null;
  initialLocationLng?: number | null;
  onCancel: () => void;
  onConfirm: (coords: { locationLat: number; locationLng: number }) => void;
}

const DEFAULT_LOCATION: [number, number] = [49.8175, 15.473];
const DEFAULT_ZOOM = 7;
const PRECISE_ZOOM = 15;

const roundCoordinate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const toMapLibreCoordinates = ([lat, lng]: [number, number]): [number, number] => [lng, lat];

const hasCoordinatePair = (
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number => (
  typeof lat === 'number'
  && Number.isFinite(lat)
  && Math.abs(lat) <= 90
  && typeof lng === 'number'
  && Number.isFinite(lng)
  && Math.abs(lng) <= 180
);

const EventLocationPickerModal = ({
  address,
  initialLocationLat,
  initialLocationLng,
  onCancel,
  onConfirm,
}: EventLocationPickerModalProps) => {
  const [mapElement, setMapElement] = React.useState<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const [mapUnavailable, setMapUnavailable] = React.useState(false);
  const hasInitialLocation = hasCoordinatePair(initialLocationLat, initialLocationLng);
  const initialCenter = React.useMemo<[number, number]>(() => (
    hasInitialLocation
      ? [initialLocationLat as number, initialLocationLng as number]
      : DEFAULT_LOCATION
  ), [hasInitialLocation, initialLocationLat, initialLocationLng]);
  const [selectedLocation, setSelectedLocation] = React.useState({
    locationLat: roundCoordinate(initialCenter[0]),
    locationLng: roundCoordinate(initialCenter[1]),
  });
  const addressLabel = address?.trim() || 'Místo bude doplněno';

  React.useEffect(() => {
    if (!mapElement || mapRef.current) {
      return undefined;
    }

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        attributionControl: EVENT_MAP_ATTRIBUTION_CONTROL,
        center: toMapLibreCoordinates(initialCenter),
        canvasContextAttributes: EVENT_MAP_CANVAS_CONTEXT_ATTRIBUTES,
        container: mapElement,
        interactive: true,
        style: EVENT_MAP_STYLE,
        zoom: hasInitialLocation ? PRECISE_ZOOM : DEFAULT_ZOOM,
      });
    } catch {
      setMapUnavailable(true);
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const updateSelectedLocation = () => {
      const center = map.getCenter();
      if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
        return;
      }

      setSelectedLocation({
        locationLat: roundCoordinate(center.lat),
        locationLng: roundCoordinate(center.lng),
      });
      collapseCompactAttribution(map);
    };

    map.on('moveend', updateSelectedLocation);
    const cancelRenderingSettle = scheduleEventMapRenderingSettle(map);

    return () => {
      cancelRenderingSettle();
      map.remove();
      mapRef.current = null;
    };
  }, [hasInitialLocation, initialCenter, mapElement]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal container={document.querySelector<HTMLElement>('.nodu-app-shell') ?? undefined}>
        <Dialog.Overlay className="event-form-map-overlay" />
        <Dialog.Content className="nodu-event-location-picker-dialog event-form-map-dialog" aria-describedby={undefined} onInteractOutside={(event) => event.preventDefault()}>
          <section className="nodu-event-location-picker-panel">
            <header className="nodu-event-location-picker-header">
              <div className="min-w-0">
                <Dialog.Title>Vybrat polohu</Dialog.Title>
                <p>{addressLabel}</p>
              </div>
              <button type="button" className="nodu-event-location-picker-close" onClick={onCancel} aria-label="Zavřít výběr polohy">
                <X size={18} />
              </button>
            </header>

            <div className="nodu-event-location-picker-map">
              {mapUnavailable ? (
                <p className="nodu-event-location-picker-unavailable">
                  Mapu se na tomto zařízení nepodařilo zobrazit.
                </p>
              ) : (
                <>
                  <div ref={setMapElement} className="nodu-event-location-picker-canvas" />
                  <div className="nodu-event-location-picker-pin" data-testid="event-location-fixed-pin" aria-hidden="true" />
                </>
              )}
            </div>

            <div className="nodu-event-location-picker-footer">
              <div>
                <div className="nodu-event-location-picker-label">Souřadnice</div>
                <div className="nodu-event-location-picker-coordinates">
                  {selectedLocation.locationLat.toFixed(6)}, {selectedLocation.locationLng.toFixed(6)}
                </div>
              </div>
              <div className="nodu-event-location-picker-actions">
                <button type="button" className="nodu-event-location-picker-secondary" onClick={onCancel}>
                  Zrušit
                </button>
                <button type="button" className="nodu-event-location-picker-primary" disabled={mapUnavailable} onClick={() => onConfirm(selectedLocation)}>
                  Potvrdit polohu
                </button>
              </div>
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default EventLocationPickerModal;

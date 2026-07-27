import React from 'react';
import { Map as MapLibreMap, Marker as MapLibreMarker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { hasEventCoordinates } from '../services/event-location.service';
import { EVENT_MAP_ATTRIBUTION_CONTROL } from './event-map-attribution';
import { EVENT_MAP_CANVAS_CONTEXT_ATTRIBUTES, scheduleEventMapRenderingSettle } from './event-map-rendering';
import { EVENT_MAP_STYLE } from './event-map-style';

interface EventMapPreviewProps {
  address?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  editable?: boolean;
  googleMapsUrl?: string;
  onLocationChange?: (coords: { locationLat: number; locationLng: number }) => void;
}

const EVENT_MAP_ZOOM = 15;
const EVENT_MAP_FALLBACK_LABEL = 'Místo bude doplněno';

const roundCoordinate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const toMapLibreCoordinates = ([lat, lng]: [number, number]): [number, number] => [lng, lat];

const EventMapPreview = ({
  address,
  locationLat,
  locationLng,
  editable = false,
  googleMapsUrl,
  onLocationChange,
}: EventMapPreviewProps) => {
  const mapElementRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const markerRef = React.useRef<MapLibreMarker | null>(null);
  const onLocationChangeRef = React.useRef(onLocationChange);
  const hasCoordinates = hasEventCoordinates({ locationLat, locationLng });
  const coordinates: [number, number] | null = hasCoordinates ? [locationLat, locationLng] : null;
  const coordinatesRef = React.useRef<[number, number] | null>(coordinates);
  const addressLabel = address?.trim() || EVENT_MAP_FALLBACK_LABEL;

  onLocationChangeRef.current = onLocationChange;
  coordinatesRef.current = coordinates;

  React.useEffect(() => {
    if (!hasCoordinates || !mapElementRef.current || mapRef.current) {
      return undefined;
    }

    const initialCoordinates = coordinatesRef.current;

    if (!initialCoordinates) {
      return undefined;
    }

    const map = new MapLibreMap({
      attributionControl: EVENT_MAP_ATTRIBUTION_CONTROL,
      center: toMapLibreCoordinates(initialCoordinates),
      canvasContextAttributes: EVENT_MAP_CANVAS_CONTEXT_ATTRIBUTES,
      container: mapElementRef.current,
      interactive: editable,
      style: EVENT_MAP_STYLE,
      zoom: EVENT_MAP_ZOOM,
    });
    mapRef.current = map;
    const cancelRenderingSettle = scheduleEventMapRenderingSettle(map);

    if (editable) {
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    }

    if (editable) {
      map.on('moveend', () => {
        const nextCoordinates = map.getCenter();

        if (!Number.isFinite(nextCoordinates.lat) || !Number.isFinite(nextCoordinates.lng)) {
          return;
        }

        const roundedCoordinates = {
          locationLat: roundCoordinate(nextCoordinates.lat),
          locationLng: roundCoordinate(nextCoordinates.lng),
        };
        const currentCoordinates = coordinatesRef.current;

        if (
          currentCoordinates
          && roundCoordinate(currentCoordinates[0]) === roundedCoordinates.locationLat
          && roundCoordinate(currentCoordinates[1]) === roundedCoordinates.locationLng
        ) {
          return;
        }

        onLocationChangeRef.current?.({
          locationLat: roundedCoordinates.locationLat,
          locationLng: roundedCoordinates.locationLng,
        });
      });
    } else {
      const markerElement = document.createElement('div');
      markerElement.className = 'nodu-event-map-marker';
      const marker = new MapLibreMarker({
        anchor: 'bottom',
        element: markerElement,
      });
      marker.setLngLat(toMapLibreCoordinates(initialCoordinates)).addTo(map);
      markerRef.current = marker;
    }

    return () => {
      cancelRenderingSettle();
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [editable, hasCoordinates]);

  React.useEffect(() => {
    const nextCoordinates = coordinatesRef.current;

    if (!hasCoordinates || !nextCoordinates || !mapRef.current) {
      return;
    }

    const nextCenter = toMapLibreCoordinates(nextCoordinates);
    mapRef.current.jumpTo(editable ? { center: nextCenter } : {
      center: nextCenter,
      zoom: EVENT_MAP_ZOOM,
    });
    markerRef.current?.setLngLat(toMapLibreCoordinates(nextCoordinates));
  }, [editable, hasCoordinates, locationLat, locationLng]);

  const googleMapsLink = googleMapsUrl ? (
    <a
      className="nodu-event-map-preview__link"
      href={googleMapsUrl}
      target="_blank"
      rel="noreferrer"
    >
      Otevřít mapu
    </a>
  ) : null;

  if (!hasCoordinates) {
    return (
      <div className="nodu-event-map-preview nodu-event-map-preview--placeholder">
        <div className="nodu-event-map-preview__placeholder-content">
          <p className="nodu-event-map-preview__placeholder-title">Mapa se zobrazí po výběru polohy.</p>
          <p className="nodu-event-map-preview__placeholder-address">{addressLabel}</p>
        </div>
        {googleMapsLink}
      </div>
    );
  }

  return (
    <div className="nodu-event-map-preview">
      <div
        ref={mapElementRef}
        className="nodu-event-map-preview__canvas"
        role="img"
        aria-label={addressLabel}
      />
      {editable && (
        <div className="nodu-event-map-preview__fixed-pin" data-testid="event-map-fixed-pin" aria-hidden="true" />
      )}
      {googleMapsLink}
    </div>
  );
};

export default EventMapPreview;

import React from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { hasEventCoordinates } from '../services/event-location.service';

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
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const MARKER_ICON_ANCHOR: L.PointExpression = [12, 32];
const MARKER_ICON_SIZE: L.PointExpression = [24, 32];

const roundCoordinate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const disableMapInteractions = (map: L.Map) => {
  map.dragging.disable();
  map.scrollWheelZoom.disable();
  map.touchZoom.disable();
  map.doubleClickZoom.disable();
  map.boxZoom.disable();
  map.keyboard.disable();
};

const EventMapPreview = ({
  address,
  locationLat,
  locationLng,
  editable = false,
  googleMapsUrl,
  onLocationChange,
}: EventMapPreviewProps) => {
  const mapElementRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
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

    const map = L.map(mapElementRef.current, {
      zoomControl: editable,
    });
    mapRef.current = map;
    map.setView(initialCoordinates, EVENT_MAP_ZOOM);

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
    }).addTo(map);

    const markerIcon = L.divIcon({
      className: 'nodu-event-map-marker',
      iconAnchor: MARKER_ICON_ANCHOR,
      iconSize: MARKER_ICON_SIZE,
    });
    const marker = L.marker(initialCoordinates, {
      draggable: editable,
      icon: markerIcon,
    }).addTo(map);
    markerRef.current = marker;

    if (editable) {
      marker.on('dragend', () => {
        const nextCoordinates = marker.getLatLng();

        if (!Number.isFinite(nextCoordinates.lat) || !Number.isFinite(nextCoordinates.lng)) {
          return;
        }

        onLocationChangeRef.current?.({
          locationLat: roundCoordinate(nextCoordinates.lat),
          locationLng: roundCoordinate(nextCoordinates.lng),
        });
      });
    } else {
      disableMapInteractions(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [editable, hasCoordinates]);

  React.useEffect(() => {
    const nextCoordinates = coordinatesRef.current;

    if (!hasCoordinates || !nextCoordinates || !mapRef.current || !markerRef.current) {
      return;
    }

    mapRef.current.setView(nextCoordinates, EVENT_MAP_ZOOM);
    markerRef.current.setLatLng(nextCoordinates);
  }, [hasCoordinates, locationLat, locationLng]);

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
          <p className="nodu-event-map-preview__placeholder-title">Mapa se zobrazí po nalezení polohy.</p>
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
      {googleMapsLink}
    </div>
  );
};

export default EventMapPreview;

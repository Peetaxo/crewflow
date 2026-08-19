import type { Map as MapLibreMap } from 'maplibre-gl';

export const EVENT_MAP_ATTRIBUTION_CONTROL = { compact: true } as const;

export const collapseCompactAttribution = (map: MapLibreMap) => {
  const attribution = map
    .getContainer()
    .querySelector<HTMLElement>('.maplibregl-ctrl-attrib.maplibregl-compact');

  attribution?.classList.remove('maplibregl-compact-show');
  attribution?.removeAttribute('open');
};

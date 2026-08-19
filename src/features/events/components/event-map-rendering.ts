import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl';
import { collapseCompactAttribution } from './event-map-attribution';

export const EVENT_MAP_CANVAS_CONTEXT_ATTRIBUTES = {
  antialias: false,
  contextType: 'webgl',
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'default',
  preserveDrawingBuffer: false,
} satisfies NonNullable<MapOptions['canvasContextAttributes']>;

const EVENT_MAP_SETTLE_DELAYS = [0, 120, 360, 900] as const;

export const scheduleEventMapRenderingSettle = (map: MapLibreMap) => {
  const settleMap = () => {
    map.resize();
    map.triggerRepaint();
    collapseCompactAttribution(map);
  };

  const timers = EVENT_MAP_SETTLE_DELAYS.map((delay) => window.setTimeout(settleMap, delay));
  map.on('load', settleMap);
  map.on('styledata', settleMap);
  map.on('idle', settleMap);

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
  };
};

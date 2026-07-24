# Event Free Map Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Places address flow with a free-only event location workflow: manual address entry, explicit free geocoding, draggable pin, saved coordinates, and Google Maps URL click-through without paid Google APIs.

**Architecture:** Keep event location behavior isolated under `src/features/events`. Move address selection types and pure helpers into `event-location.service.ts`, add `event-geocoding.service.ts` for explicit OSM/Nominatim searches, and add `EventMapPreview.tsx` for Leaflet-based map display and draggable pin behavior. `EventEditModal` composes address input, explicit search, candidate selection, and editable map; mobile `EventDetailView` reuses the map preview in read-only mode and keeps Google Maps only as a plain URL.

**Tech Stack:** React 18, Vite 8, TypeScript, Vitest, Testing Library, Leaflet, OSM raster tiles, Nominatim search API, existing Supabase event address columns.

---

## File Structure

- Modify: `package.json`
  Adds `leaflet`.
- Modify: `package-lock.json`
  Lockfile update from npm install.
- Modify: `.env.example`
  Removes `VITE_GOOGLE_MAPS_API_KEY` because production must not require a Google Maps Platform key.
- Modify: `src/vite-env.d.ts`
  Removes `VITE_GOOGLE_MAPS_API_KEY`.
- Modify: `src/features/events/services/event-location.service.ts`
  Owns shared location types, manual address selection, coordinate validation, map URL construction.
- Modify: `src/features/events/services/event-location.service.test.ts`
  Covers manual selection and Google Maps URL behavior.
- Create: `src/features/events/services/event-geocoding.service.ts`
  Owns Nominatim URL building, response normalization, cache, cooldown, and provider errors.
- Create: `src/features/events/services/event-geocoding.service.test.ts`
  Covers free geocoding without live network calls.
- Modify: `src/features/events/components/EventAddressField.tsx`
  Replaces Google autocomplete with manual input, explicit `Najít na mapě`, candidate list, and non-blocking status states.
- Modify: `src/features/events/components/EventAddressField.test.tsx`
  Replaces Google suggestion tests with explicit free geocoding tests.
- Create: `src/features/events/components/EventMapPreview.tsx`
  Renders placeholder or Leaflet map with optional draggable marker and optional Google Maps link overlay.
- Create: `src/features/events/components/EventMapPreview.test.tsx`
  Mocks Leaflet and verifies placeholder, marker setup, drag callback, and link rendering.
- Modify: `src/components/modals/EventEditModal.tsx`
  Composes `EventAddressField` and editable `EventMapPreview`; saves manual pin coordinates.
- Modify: `src/components/modals/EventEditModal.test.tsx`
  Covers geocoded candidate selection and manual pin movement.
- Modify: `src/views/EventDetailView.tsx`
  Replaces decorative mobile map with read-only `EventMapPreview`.
- Modify: `src/views/EventDetailView.test.tsx`
  Verifies mobile detail still opens Google Maps URL from coordinates.
- Modify: `src/index.css`
  Adds stable dimensions and marker styling for the reusable event map preview.
- Delete: `src/features/events/services/event-location-google.service.ts`
  Removes paid Google Maps Platform integration from production source.
- Delete: `src/features/events/services/event-location-google.service.test.ts`
  Removes tests for the deprecated paid flow.

---

### Task 1: Add Leaflet Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime and type packages**

Run:

```bash
npm install leaflet
npm install -D @types/leaflet
```

Expected:

```text
Command exits 0.
package.json and package-lock.json are updated.
```

- [ ] **Step 2: Verify package entries**

Run:

```bash
rg -n '"leaflet"|"@types/leaflet"' package.json package-lock.json
```

Expected:

```text
package.json contains a dependency entry for "leaflet".
package.json contains a devDependency entry for "@types/leaflet".
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add leaflet for event maps"
```

---

### Task 2: Move Shared Location Types And Manual Selection Helpers

**Files:**
- Modify: `src/features/events/services/event-location.service.ts`
- Modify: `src/features/events/services/event-location.service.test.ts`

- [ ] **Step 1: Add failing tests for manual selection and coordinate checks**

Append to `src/features/events/services/event-location.service.test.ts`:

```ts
import {
  buildGoogleMapsSearchUrl,
  getEventAddressLabel,
  getManualAddressSelection,
  hasEventCoordinates,
} from './event-location.service';

it('clears precise metadata for manual address edits', () => {
  expect(getManualAddressSelection('  H15 Roudnice nad Labem  ')).toEqual({
    address: 'H15 Roudnice nad Labem',
    placeId: undefined,
    locationLat: null,
    locationLng: null,
  });
});

it('recognizes only complete finite coordinate pairs', () => {
  expect(hasEventCoordinates({ locationLat: 50.42, locationLng: 14.26 })).toBe(true);
  expect(hasEventCoordinates({ locationLat: 50.42, locationLng: null })).toBe(false);
  expect(hasEventCoordinates({ locationLat: Number.NaN, locationLng: 14.26 })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/features/events/services/event-location.service.test.ts --reporter verbose
```

Expected: FAIL because `getManualAddressSelection` and `hasEventCoordinates` are not exported yet.

- [ ] **Step 3: Implement shared types and helpers**

Update `src/features/events/services/event-location.service.ts`:

```ts
export interface EventLocationInput {
  address?: string | null;
  city?: string | null;
  placeId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

export interface EventAddressSelection {
  address: string;
  placeId?: string;
  locationLat: number | null;
  locationLng: number | null;
}

const EMPTY_LOCATION_LABEL = 'Místo bude doplněno';

const clean = (value: string | null | undefined): string => value?.trim() ?? '';

export const hasEventCoordinates = (
  location: Pick<EventLocationInput, 'locationLat' | 'locationLng'>,
): location is EventLocationInput & { locationLat: number; locationLng: number } => (
  typeof location.locationLat === 'number'
  && Number.isFinite(location.locationLat)
  && typeof location.locationLng === 'number'
  && Number.isFinite(location.locationLng)
);

export const getManualAddressSelection = (address: string): EventAddressSelection => ({
  address: clean(address),
  placeId: undefined,
  locationLat: null,
  locationLng: null,
});

export const getEventAddressLabel = (event: Pick<Event, 'address' | 'city'>): string => (
  clean(event.address) || clean(event.city) || EMPTY_LOCATION_LABEL
);

export const buildGoogleMapsSearchUrl = (location: EventLocationInput): string => {
  const query = hasEventCoordinates(location)
    ? `${location.locationLat},${location.locationLng}`
    : clean(location.address) || clean(location.city);
  const params = [`api=1`, `query=${encodeURIComponent(query || EMPTY_LOCATION_LABEL)}`];
  const placeId = clean(location.placeId);

  if (placeId) {
    params.push(`query_place_id=${encodeURIComponent(placeId)}`);
  }

  return `https://www.google.com/maps/search/?${params.join('&')}`;
};
```

Keep the existing `import type { Event } from '../../../types';` at the top.

- [ ] **Step 4: Run the tests to verify pass**

Run:

```bash
npm test -- src/features/events/services/event-location.service.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/events/services/event-location.service.ts src/features/events/services/event-location.service.test.ts
git commit -m "feat: add event location coordinate helpers"
```

---

### Task 3: Add Free Geocoding Service

**Files:**
- Create: `src/features/events/services/event-geocoding.service.ts`
- Create: `src/features/events/services/event-geocoding.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/features/events/services/event-geocoding.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EventGeocodingRateLimitError,
  __resetEventGeocodingStateForTests,
  buildNominatimSearchUrl,
  searchFreeEventLocations,
} from './event-geocoding.service';

describe('event geocoding service', () => {
  beforeEach(() => {
    __resetEventGeocodingStateForTests();
  });

  it('does not query free provider for short or blank input', async () => {
    const fetcher = vi.fn();

    await expect(searchFreeEventLocations('  ', { fetcher })).resolves.toEqual([]);
    await expect(searchFreeEventLocations('Ro', { fetcher })).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('builds a bounded Czech Nominatim URL', () => {
    expect(buildNominatimSearchUrl('Rohanské nábřeží 678/23')).toBe(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&q=Rohansk%C3%A9%20n%C3%A1b%C5%99e%C5%BE%C3%AD%20678%2F23&limit=5&addressdetails=1&accept-language=cs&countrycodes=cz',
    );
  });

  it('normalizes Nominatim results into selectable candidates', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          osm_type: 'way',
          osm_id: 123,
          display_name: 'Rohanské nábřeží 678/23, Praha',
          lat: '50.0929',
          lon: '14.4502',
        },
      ]),
    });

    await expect(searchFreeEventLocations('Rohanské nábřeží 678/23', {
      fetcher,
      cooldownMs: 0,
    })).resolves.toEqual([
      {
        id: 'way-123',
        label: 'Rohanské nábřeží 678/23, Praha',
        locationLat: 50.0929,
        locationLng: 14.4502,
        provider: 'nominatim',
      },
    ]);
  });

  it('caches repeated normalized queries', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await searchFreeEventLocations(' Roudnice nad Labem ', { fetcher, cooldownMs: 0 });
    await searchFreeEventLocations('roudnice nad labem', { fetcher, cooldownMs: 0 });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rate-limits uncached provider calls', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await searchFreeEventLocations('Praha', { fetcher, now: () => 10_000, cooldownMs: 1_100 });

    await expect(searchFreeEventLocations('Brno', {
      fetcher,
      now: () => 10_250,
      cooldownMs: 1_100,
    })).rejects.toBeInstanceOf(EventGeocodingRateLimitError);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/features/events/services/event-geocoding.service.test.ts --reporter verbose
```

Expected: FAIL because `event-geocoding.service.ts` does not exist.

- [ ] **Step 3: Implement free geocoding service**

Create `src/features/events/services/event-geocoding.service.ts`:

```ts
export interface EventGeocodingCandidate {
  id: string;
  label: string;
  locationLat: number;
  locationLng: number;
  provider: 'nominatim';
}

interface NominatimResult {
  osm_type?: string;
  osm_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
}

interface SearchFreeEventLocationsOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  cooldownMs?: number;
}

const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_GEOCODING_QUERY_LENGTH = 3;
const DEFAULT_COOLDOWN_MS = 1_100;

const cache = new Map<string, EventGeocodingCandidate[]>();
let lastProviderRequestAt = 0;

export class EventGeocodingRateLimitError extends Error {
  constructor() {
    super('Vyhledávání adres je dostupné za chvíli. Zkuste to prosím znovu.');
    this.name = 'EventGeocodingRateLimitError';
  }
}

const clean = (value: string | null | undefined): string => value?.trim() ?? '';

const normalizeQuery = (query: string): string => clean(query).toLocaleLowerCase('cs-CZ');

const getFiniteNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildNominatimSearchUrl = (query: string): string => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: clean(query),
    limit: '5',
    addressdetails: '1',
    'accept-language': 'cs',
    countrycodes: 'cz',
  });

  return `${NOMINATIM_SEARCH_ENDPOINT}?${params.toString()}`;
};

const toCandidate = (result: NominatimResult, index: number): EventGeocodingCandidate | null => {
  const label = clean(result.display_name);
  const lat = getFiniteNumber(result.lat);
  const lng = getFiniteNumber(result.lon);

  if (!label || lat === null || lng === null) return null;

  return {
    id: `${result.osm_type || 'result'}-${result.osm_id ?? index}`,
    label,
    locationLat: lat,
    locationLng: lng,
    provider: 'nominatim',
  };
};

export const searchFreeEventLocations = async (
  query: string,
  options: SearchFreeEventLocationsOptions = {},
): Promise<EventGeocodingCandidate[]> => {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < MIN_GEOCODING_QUERY_LENGTH) return [];

  const cached = cache.get(normalizedQuery);
  if (cached) return cached;

  const now = options.now ?? Date.now;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const currentTime = now();

  if (lastProviderRequestAt > 0 && currentTime - lastProviderRequestAt < cooldownMs) {
    throw new EventGeocodingRateLimitError();
  }

  lastProviderRequestAt = currentTime;

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(buildNominatimSearchUrl(query), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Adresu se nepodařilo najít.');
  }

  const rawResults = await response.json() as NominatimResult[];
  const candidates = rawResults
    .map((result, index) => toCandidate(result, index))
    .filter((candidate): candidate is EventGeocodingCandidate => Boolean(candidate));

  cache.set(normalizedQuery, candidates);
  return candidates;
};

export const __resetEventGeocodingStateForTests = () => {
  cache.clear();
  lastProviderRequestAt = 0;
};
```

- [ ] **Step 4: Run the tests to verify pass**

Run:

```bash
npm test -- src/features/events/services/event-geocoding.service.test.ts --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/events/services/event-geocoding.service.ts src/features/events/services/event-geocoding.service.test.ts
git commit -m "feat: add free event geocoding service"
```

---

### Task 4: Replace Google Autocomplete With Explicit Free Search

**Files:**
- Modify: `src/features/events/components/EventAddressField.tsx`
- Modify: `src/features/events/components/EventAddressField.test.tsx`

- [ ] **Step 1: Replace field tests with explicit search behavior**

Update `src/features/events/components/EventAddressField.test.tsx` to cover:

```ts
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EventAddressField from './EventAddressField';
import type { EventGeocodingCandidate } from '../services/event-geocoding.service';

const candidate: EventGeocodingCandidate = {
  id: 'way-123',
  label: 'Rohanské nábřeží 678/23, Praha',
  locationLat: 50.0929,
  locationLng: 14.4502,
  provider: 'nominatim',
};

describe('EventAddressField', () => {
  it('keeps manual address entry available and clears precise map metadata', () => {
    const onChange = vi.fn();

    render(<EventAddressField value={{ address: 'Praha', city: 'Praha' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Roudnice nad Labem' },
    });

    expect(onChange).toHaveBeenCalledWith({
      address: 'Roudnice nad Labem',
      placeId: undefined,
      locationLat: null,
      locationLng: null,
    });
    expect(screen.queryByText(/Našeptávání/)).not.toBeInTheDocument();
  });

  it('searches only after clicking Najít na mapě and shows candidates', async () => {
    const geocodeAddress = vi.fn().mockResolvedValue([candidate]);

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={vi.fn()}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží' },
    });

    expect(geocodeAddress).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));

    await waitFor(() => expect(geocodeAddress).toHaveBeenCalledWith('Rohanské nábřeží'));
    expect(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' })).toBeInTheDocument();
  });

  it('stores precise coordinates when selecting a geocoding candidate', async () => {
    const onChange = vi.fn();
    const geocodeAddress = vi.fn().mockResolvedValue([candidate]);

    render(
      <EventAddressField
        value={{ address: '' }}
        onChange={onChange}
        geocodeAddress={geocodeAddress}
      />,
    );

    fireEvent.change(screen.getByLabelText('Adresa'), {
      target: { value: 'Rohanské nábřeží' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Najít na mapě' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rohanské nábřeží 678/23, Praha' }));

    expect(onChange).toHaveBeenLastCalledWith({
      address: 'Rohanské nábřeží 678/23, Praha',
      placeId: undefined,
      locationLat: 50.0929,
      locationLng: 14.4502,
    });
  });
});
```

- [ ] **Step 2: Run the field tests to verify failure**

Run:

```bash
npm test -- src/features/events/components/EventAddressField.test.tsx --reporter verbose
```

Expected: FAIL because the component still expects Google autocomplete props.

- [ ] **Step 3: Implement explicit free search field**

Update `src/features/events/components/EventAddressField.tsx`:

```tsx
import React from 'react';
import { LocateFixed } from 'lucide-react';
import {
  EventGeocodingCandidate,
  searchFreeEventLocations,
} from '../services/event-geocoding.service';
import {
  EventAddressSelection,
  getManualAddressSelection,
} from '../services/event-location.service';

interface EventAddressFieldValue {
  address?: string | null;
  city?: string | null;
  placeId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

interface EventAddressFieldProps {
  value: EventAddressFieldValue;
  onChange: (selection: EventAddressSelection) => void;
  geocodeAddress?: (input: string) => Promise<EventGeocodingCandidate[]>;
}

const fieldLabelClass = 'mb-1 block text-[10px] uppercase tracking-[0.22em] text-[color:var(--nodu-text-soft)]';
const nativeFieldClass = 'w-full rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition-all focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:rgb(var(--nodu-accent-rgb)/0.14)]';
const actionClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--nodu-border)] bg-white px-3 py-2 text-xs font-bold text-[color:var(--nodu-text)] transition-all hover:border-[color:rgb(var(--nodu-accent-rgb)/0.32)] hover:text-[color:var(--nodu-accent)] disabled:cursor-not-allowed disabled:opacity-60';

const clean = (value: string | null | undefined) => value?.trim() ?? '';

const getInitialAddress = (value: EventAddressFieldValue) => clean(value.address) || clean(value.city);

const EventAddressField = ({
  value,
  onChange,
  geocodeAddress = searchFreeEventLocations,
}: EventAddressFieldProps) => {
  const addressFromProps = getInitialAddress(value);
  const [inputValue, setInputValue] = React.useState(addressFromProps);
  const [candidates, setCandidates] = React.useState<EventGeocodingCandidate[]>([]);
  const [status, setStatus] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);

  React.useEffect(() => {
    setInputValue(addressFromProps);
  }, [addressFromProps]);

  const handleManualChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextAddress = event.target.value;
    setInputValue(nextAddress);
    setCandidates([]);
    setStatus('');
    onChange(getManualAddressSelection(nextAddress));
  };

  const handleSearch = async () => {
    const query = inputValue.trim();
    if (query.length < 3) {
      setStatus('Zadejte alespoň 3 znaky a potom polohu najděte.');
      return;
    }

    setIsSearching(true);
    setStatus('Hledám polohu...');

    try {
      const nextCandidates = await geocodeAddress(query);
      setCandidates(nextCandidates);
      setStatus(nextCandidates.length > 0 ? 'Vyberte správnou polohu.' : 'Poloha nebyla nalezena. Adresu lze uložit ručně.');
    } catch (error) {
      setCandidates([]);
      setStatus(error instanceof Error ? error.message : 'Poloha se nepodařila najít.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCandidate = (candidate: EventGeocodingCandidate) => {
    setInputValue(candidate.label);
    setCandidates([]);
    setStatus('Poloha nalezena. Špendlík můžete případně posunout na přesné místo.');
    onChange({
      address: candidate.label,
      placeId: undefined,
      locationLat: candidate.locationLat,
      locationLng: candidate.locationLng,
    });
  };

  return (
    <div className="relative">
      <label htmlFor="event-address" className={fieldLabelClass}>Adresa</label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          id="event-address"
          type="text"
          value={inputValue}
          onChange={handleManualChange}
          className={nativeFieldClass}
          autoComplete="off"
        />
        <button type="button" onClick={handleSearch} className={actionClass} disabled={isSearching}>
          <LocateFixed size={14} />
          Najít na mapě
        </button>
      </div>

      {candidates.length > 0 && (
        <div className="mt-2 rounded-[18px] border border-[color:var(--nodu-border)] bg-white p-1 shadow-[0_18px_42px_rgba(47,38,31,0.14)]">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => handleSelectCandidate(candidate)}
              className="block w-full rounded-[14px] px-3 py-2 text-left text-sm font-semibold text-[color:var(--nodu-text)] transition-colors hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.08)]"
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <p className="mt-1 text-[11px] font-medium text-[color:var(--nodu-text-soft)]">
          {status}
        </p>
      )}
    </div>
  );
};

export default EventAddressField;
```

- [ ] **Step 4: Run the field tests to verify pass**

Run:

```bash
npm test -- src/features/events/components/EventAddressField.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/events/components/EventAddressField.tsx src/features/events/components/EventAddressField.test.tsx
git commit -m "feat: replace event address autocomplete with free search"
```

---

### Task 5: Add Reusable Leaflet Map Preview

**Files:**
- Create: `src/features/events/components/EventMapPreview.tsx`
- Create: `src/features/events/components/EventMapPreview.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing component tests**

Create `src/features/events/components/EventMapPreview.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EventMapPreview from './EventMapPreview';

const markerHandlers = new Map<string, () => void>();
const markerSetLatLng = vi.fn();
const mapSetView = vi.fn();
const removeMap = vi.fn();

vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      setView: mapSetView,
      remove: removeMap,
      dragging: { disable: vi.fn() },
      scrollWheelZoom: { disable: vi.fn() },
      touchZoom: { disable: vi.fn() },
      doubleClickZoom: { disable: vi.fn() },
      boxZoom: { disable: vi.fn() },
      keyboard: { disable: vi.fn() },
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn(() => ({
      addTo: vi.fn(),
      on: vi.fn((eventName: string, handler: () => void) => {
        markerHandlers.set(eventName, handler);
      }),
      getLatLng: vi.fn(() => ({ lat: 50.1, lng: 14.2 })),
      setLatLng: markerSetLatLng,
    })),
  },
}));

describe('EventMapPreview', () => {
  it('shows a placeholder when coordinates are missing', () => {
    render(<EventMapPreview address="H15" locationLat={null} locationLng={null} />);

    expect(screen.getByText('Mapa se zobrazí po nalezení polohy.')).toBeInTheDocument();
  });

  it('renders a Google Maps link overlay when href is provided', () => {
    render(
      <EventMapPreview
        address="Rohanské nábřeží"
        locationLat={50.0929}
        locationLng={14.4502}
        googleMapsUrl="https://www.google.com/maps/search/?api=1&query=50.0929%2C14.4502"
      />,
    );

    expect(screen.getByRole('link', { name: /Otevřít mapu/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=50.0929%2C14.4502',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
npm test -- src/features/events/components/EventMapPreview.test.tsx --reporter verbose
```

Expected: FAIL because `EventMapPreview.tsx` does not exist.

- [ ] **Step 3: Implement map preview**

Create `src/features/events/components/EventMapPreview.tsx`:

```tsx
import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { hasEventCoordinates } from '../services/event-location.service';

interface EventMapPreviewProps {
  address?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  editable?: boolean;
  googleMapsUrl?: string;
  onLocationChange?: (coords: { locationLat: number; locationLng: number }) => void;
}

const EventMapPreview = ({
  address,
  locationLat,
  locationLng,
  editable = false,
  googleMapsUrl,
  onLocationChange,
}: EventMapPreviewProps) => {
  const mapNodeRef = React.useRef<HTMLDivElement | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
  const hasCoordinates = hasEventCoordinates({ locationLat, locationLng });

  React.useEffect(() => {
    if (!mapNodeRef.current || !hasCoordinates) return undefined;

    const map = L.map(mapNodeRef.current, {
      zoomControl: editable,
      attributionControl: true,
    }).setView([locationLat, locationLng], 16);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    if (!editable) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    }

    const marker = L.marker([locationLat, locationLng], {
      draggable: editable,
      icon: L.divIcon({
        className: 'nodu-event-map-marker',
        iconSize: [34, 42],
        iconAnchor: [17, 40],
      }),
    }).addTo(map);

    markerRef.current = marker;

    if (editable) {
      marker.on('dragend', () => {
        const next = marker.getLatLng();
        onLocationChange?.({
          locationLat: Number(next.lat.toFixed(6)),
          locationLng: Number(next.lng.toFixed(6)),
        });
      });
    }

    return () => {
      markerRef.current = null;
      map.remove();
    };
  }, [editable, hasCoordinates, locationLat, locationLng, onLocationChange]);

  React.useEffect(() => {
    if (!hasCoordinates || !markerRef.current) return;
    markerRef.current.setLatLng([locationLat, locationLng]);
  }, [hasCoordinates, locationLat, locationLng]);

  if (!hasCoordinates) {
    return (
      <div className="nodu-event-map-preview nodu-event-map-preview--placeholder">
        <MapPin size={20} />
        <div>
          <p>{address?.trim() || 'Poloha bude doplněna'}</p>
          <span>Mapa se zobrazí po nalezení polohy.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="nodu-event-map-preview">
      <div ref={mapNodeRef} className="nodu-event-map-preview-canvas" />
      {googleMapsUrl && (
        <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="nodu-event-map-preview-link">
          Otevřít mapu
        </a>
      )}
      {editable && (
        <div className="nodu-event-map-preview-help">
          Špendlík můžete posunout na přesné místo.
        </div>
      )}
    </div>
  );
};

export default EventMapPreview;
```

- [ ] **Step 4: Add CSS**

Append to `src/index.css` near the mobile event map styles:

```css
.nodu-event-map-preview {
  position: relative;
  min-height: 10rem;
  overflow: hidden;
  border: 1px solid rgb(var(--nodu-accent-rgb) / 0.18);
  border-radius: 20px;
  background: rgb(var(--nodu-surface-rgb) / 0.9);
  box-shadow: inset 0 0 0 1px rgb(var(--nodu-text-rgb) / 0.04);
}

.nodu-event-map-preview-canvas {
  min-height: 10rem;
  height: 100%;
  width: 100%;
}

.nodu-event-map-preview--placeholder {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  color: var(--nodu-text-soft);
  background:
    linear-gradient(135deg, rgb(106 177 100 / 0.36), transparent 44%),
    linear-gradient(45deg, transparent 45%, rgb(77 138 200 / 0.22) 45%, rgb(77 138 200 / 0.22) 52%, transparent 52%),
    #eef5eb;
}

.nodu-event-map-preview--placeholder p {
  font-size: 0.9rem;
  font-weight: 850;
  color: var(--nodu-text);
}

.nodu-event-map-preview--placeholder span {
  font-size: 0.72rem;
  font-weight: 700;
}

.nodu-event-map-preview-link,
.nodu-event-map-preview-help {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  z-index: 450;
  border-radius: 999px;
  background: rgb(var(--nodu-surface-rgb) / 0.92);
  color: var(--nodu-text);
  padding: 0.45rem 0.7rem;
  font-size: 0.7rem;
  font-weight: 850;
  text-decoration: none;
  box-shadow: 0 8px 22px rgb(var(--nodu-text-rgb) / 0.12);
}

.nodu-event-map-preview-help {
  pointer-events: none;
}

.nodu-event-map-marker {
  position: relative;
}

.nodu-event-map-marker::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 0;
  height: 1.85rem;
  width: 1.85rem;
  transform: translateX(-50%) rotate(-45deg);
  border-radius: 999px 999px 999px 0;
  background: var(--nodu-text);
  box-shadow: 0 0 0 6px rgb(var(--nodu-surface-rgb) / 0.88);
}

.nodu-event-map-marker::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 0.55rem;
  height: 0.72rem;
  width: 0.72rem;
  transform: translateX(-50%);
  border-radius: 999px;
  background: var(--nodu-accent);
}
```

- [ ] **Step 5: Run the map tests**

Run:

```bash
npm test -- src/features/events/components/EventMapPreview.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/events/components/EventMapPreview.tsx src/features/events/components/EventMapPreview.test.tsx src/index.css
git commit -m "feat: add free event map preview"
```

---

### Task 6: Integrate Free Location Workflow Into Event Edit Modal

**Files:**
- Modify: `src/components/modals/EventEditModal.tsx`
- Modify: `src/components/modals/EventEditModal.test.tsx`

- [ ] **Step 1: Add modal tests for geocoded selection and pin movement**

Append to `src/components/modals/EventEditModal.test.tsx`:

```tsx
it('stores free geocoded coordinates and lets the pin update them', async () => {
  vi.doMock('../../features/events/services/events.service', () => ({
    applyEventDraft: (nextEvent: Event) => nextEvent,
    createDefaultPhaseTimes: (from: string, to: string) => ({
      instal: { from, to },
      provoz: { from, to },
      deinstal: { from, to },
    }),
    getEventFormOptions: () => ({
      projects: [{ id: 'JTI001', name: 'JTI', client: 'NextLevel s.r.o.' }],
      clients: [{ id: 1, name: 'NextLevel s.r.o.' }],
    }),
    normalizeEventSchedules: () => ({}),
    saveEvent: vi.fn(),
  }));

  vi.doMock('../../features/events/components/EventAddressField', () => ({
    default: ({ onChange }: { onChange: (selection: {
      address: string;
      placeId?: string;
      locationLat: number | null;
      locationLng: number | null;
    }) => void }) => (
      <button
        type="button"
        onClick={() => onChange({
          address: 'Rohanské nábřeží 678/23, Praha',
          placeId: undefined,
          locationLat: 50.0929,
          locationLng: 14.4502,
        })}
      >
        Vybrat adresu
      </button>
    ),
  }));

  vi.doMock('../../features/events/components/EventMapPreview', () => ({
    default: ({ onLocationChange }: { onLocationChange?: (coords: { locationLat: number; locationLng: number }) => void }) => (
      <button type="button" onClick={() => onLocationChange?.({ locationLat: 50.1, locationLng: 14.2 })}>
        Posunout špendlík
      </button>
    ),
  }));

  const onChange = vi.fn();
  const { default: EventEditModal } = await import('./EventEditModal');

  render(<EventEditModal editingEvent={event} onClose={vi.fn()} onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'Vybrat adresu' }));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    address: 'Rohanské nábřeží 678/23, Praha',
    city: 'Rohanské nábřeží 678/23, Praha',
    placeId: undefined,
    locationLat: 50.0929,
    locationLng: 14.4502,
  }));

  fireEvent.click(screen.getByRole('button', { name: 'Posunout špendlík' }));

  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    locationLat: 50.1,
    locationLng: 14.2,
    placeId: undefined,
  }));
});
```

- [ ] **Step 2: Run modal tests to verify failure**

Run:

```bash
npm test -- src/components/modals/EventEditModal.test.tsx --reporter verbose
```

Expected: FAIL because the modal does not render `EventMapPreview` yet.

- [ ] **Step 3: Integrate editable map in modal**

Update imports in `src/components/modals/EventEditModal.tsx`:

```tsx
import EventAddressField from '../../features/events/components/EventAddressField';
import EventMapPreview from '../../features/events/components/EventMapPreview';
```

Add a full-width map block after the address/client grid:

```tsx
<div>
  <EventMapPreview
    address={editingEvent.address || editingEvent.city}
    locationLat={editingEvent.locationLat}
    locationLng={editingEvent.locationLng}
    editable
    onLocationChange={(coords) => updateEventDraft({
      ...editingEvent,
      placeId: undefined,
      locationLat: coords.locationLat,
      locationLng: coords.locationLng,
    })}
  />
</div>
```

Keep the existing `EventAddressField` `onChange`, but ensure selecting a free candidate clears `placeId`:

```tsx
<EventAddressField
  value={editingEvent}
  onChange={(selection) => updateEventDraft({
    ...editingEvent,
    address: selection.address,
    city: selection.address,
    placeId: selection.placeId,
    locationLat: selection.locationLat,
    locationLng: selection.locationLng,
  })}
/>
```

- [ ] **Step 4: Run modal tests to verify pass**

Run:

```bash
npm test -- src/components/modals/EventEditModal.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/EventEditModal.tsx src/components/modals/EventEditModal.test.tsx
git commit -m "feat: add editable event location map"
```

---

### Task 7: Use Real Map Preview In Mobile Event Detail

**Files:**
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.test.tsx`

- [ ] **Step 1: Update mobile detail test expectations**

In `src/views/EventDetailView.test.tsx`, keep the existing Google Maps URL assertion and add:

```tsx
expect(screen.getByRole('link', { name: /Otevřít mapu/i })).toHaveAttribute(
  'href',
  'https://www.google.com/maps/search/?api=1&query=50.0929%2C14.4502&query_place_id=ChIJ-event-place',
);
expect(screen.getByText('Rohanske nabrezi 678/23, Praha')).toBeInTheDocument();
```

Mock `EventMapPreview` in this test file if Leaflet makes the EventDetailView test too integration-heavy:

```tsx
vi.mock('../features/events/components/EventMapPreview', () => ({
  default: ({ googleMapsUrl, address }: { googleMapsUrl?: string; address?: string }) => (
    <a href={googleMapsUrl} target="_blank" rel="noreferrer">
      Otevřít mapu: {address}
    </a>
  ),
}));
```

- [ ] **Step 2: Run EventDetailView tests to verify failure**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: FAIL until `EventDetailView` imports and renders `EventMapPreview`.

- [ ] **Step 3: Replace decorative mobile map link**

Update imports in `src/views/EventDetailView.tsx`:

```tsx
import EventMapPreview from '../features/events/components/EventMapPreview';
```

Replace the current mobile map anchor block that uses `className="nodu-mobile-event-map"` with:

```tsx
<EventMapPreview
  address={mobileAddress}
  locationLat={event.locationLat}
  locationLng={event.locationLng}
  googleMapsUrl={mobileMapUrl}
/>
```

- [ ] **Step 4: Run EventDetailView tests to verify pass**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx
git commit -m "feat: show free map preview in mobile event detail"
```

---

### Task 8: Remove Paid Google Maps Platform Path

**Files:**
- Delete: `src/features/events/services/event-location-google.service.ts`
- Delete: `src/features/events/services/event-location-google.service.test.ts`
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`
- Modify: `src/features/events/components/EventAddressField.tsx`
- Modify: `src/features/events/components/EventAddressField.test.tsx`

- [ ] **Step 1: Remove Google API env configuration**

Update `.env.example` by deleting:

```env
VITE_GOOGLE_MAPS_API_KEY=your-browser-restricted-google-maps-key
```

Update `src/vite-env.d.ts` by deleting:

```ts
readonly VITE_GOOGLE_MAPS_API_KEY?: string;
```

- [ ] **Step 2: Delete deprecated Google service files**

Run:

```bash
git rm src/features/events/services/event-location-google.service.ts
git rm src/features/events/services/event-location-google.service.test.ts
```

- [ ] **Step 3: Verify no production Google Maps Platform references remain**

Run:

```bash
rg -n "maps.googleapis|VITE_GOOGLE_MAPS_API_KEY|event-location-google|fetchGoogleAddressSuggestions|resolveGoogleAddressSuggestion|isGooglePlacesConfigured" src .env.example
```

Expected: no output.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- src/features/events/services/event-geocoding.service.test.ts src/features/events/services/event-location.service.test.ts src/features/events/components/EventAddressField.test.tsx src/features/events/components/EventMapPreview.test.tsx src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/vite-env.d.ts src/features/events/components/EventAddressField.tsx src/features/events/components/EventAddressField.test.tsx
git add src/features/events/services/event-location-google.service.ts src/features/events/services/event-location-google.service.test.ts
git commit -m "chore: remove paid Google maps integration"
```

---

### Task 9: Full Verification And Push

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/features/events/services/event-geocoding.service.test.ts src/features/events/services/event-location.service.test.ts src/features/events/components/EventAddressField.test.tsx src/features/events/components/EventMapPreview.test.tsx src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit 0. Existing unrelated warnings may remain, but no new errors.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: exit 0. Existing Vite chunk-size warning may remain.

- [ ] **Step 4: Verify cost guardrails**

Run:

```bash
rg -n "maps.googleapis|VITE_GOOGLE_MAPS_API_KEY|Places API|Google Places|Google Geocoding|Maps JavaScript API" src .env.example docs/superpowers/specs/2026-07-23-event-address-maps-design.md
```

Expected: only documentation mentions that the app must not use paid Google APIs. There must be no source or env references.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only known unrelated pre-existing dirty files remain, or a clean tree if those were absent. Do not revert unrelated user changes.

- [ ] **Step 6: Push**

Run:

```bash
git push
```

Expected: branch pushed to `origin/main`.

---

## Self-Review

- Spec coverage: Manual address entry is Task 4, explicit free geocoding is Task 3 and Task 4, draggable pin is Task 5 and Task 6, Google Maps URL click-through is Task 7, and cost guardrails are Task 8 and Task 9.
- Provider constraints: Nominatim is only called after explicit user action, has no autocomplete path, and has a cooldown/cache guard.
- Data compatibility: Existing `address`, `placeId`, `locationLat`, and `locationLng` fields remain. `city = address` compatibility is preserved in `EventEditModal`.
- Testing coverage: Service-level, component-level, modal-level, and mobile detail tests are included before implementation steps.
- Cost risk: Google Maps Platform source references are explicitly removed and verified with `rg`.

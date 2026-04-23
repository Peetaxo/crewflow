# UI Session Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obnovit UI kontext a rozpracované formuláře po nechtěném reloadu stránky, aniž by se perzistovala business data nebo měnilo běžné chování při obyčejném přepnutí tabu.

**Architecture:** `AppContext` zůstane source of truth pro runtime UI stav, ale dostane malý `sessionStorage` fallback. Serializace a validace snapshotu bude soustředěná v jednom helper modulu, aby obnova při startu a průběžné ukládání byly defenzivní, verzované a snadno testovatelné.

**Tech Stack:** React, TypeScript, Vitest, `sessionStorage`

---

### Task 1: Přidat helper pro UI session snapshot

**Files:**
- Create: `src/context/ui-session-storage.ts`
- Test: `src/context/ui-session-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  clearPersistedUiSession,
  loadPersistedUiSession,
  savePersistedUiSession,
} from './ui-session-storage';

describe('ui session storage', () => {
  it('round-trips a valid UI snapshot', () => {
    const snapshot = {
      currentTab: 'events',
      searchQuery: 'akce',
      timelogFilter: 'all',
      projectFilter: 'all',
      selectedContractorId: 3,
      selectedEventId: 11,
      selectedProjectIdForStats: 'AK001',
      selectedClientIdForStats: 4,
      eventTab: 'overview',
      eventsViewMode: 'calendar' as const,
      eventsCalendarMode: 'month' as const,
      eventsFilter: 'upcoming' as const,
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: null,
      editingProject: null,
      editingClient: null,
    };

    savePersistedUiSession(snapshot);

    expect(loadPersistedUiSession()).toEqual(snapshot);

    clearPersistedUiSession();
    expect(loadPersistedUiSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/context/ui-session-storage.test.ts`
Expected: FAIL because `ui-session-storage.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Client, Project, ReceiptItem, Timelog } from '../types';

const UI_SESSION_STORAGE_KEY = 'crewflow.ui-session.v1';

export type PersistedUiSessionState = {
  currentTab: string;
  searchQuery: string;
  timelogFilter: string;
  projectFilter: string;
  selectedContractorId: number | null;
  selectedEventId: number | null;
  selectedProjectIdForStats: string | null;
  selectedClientIdForStats: number | null;
  eventTab: string;
  eventsViewMode: 'list' | 'calendar';
  eventsCalendarMode: 'month' | 'week';
  eventsFilter: 'upcoming' | 'past' | 'all';
  eventsCalendarDate: string;
  editingTimelog: Timelog | null;
  editingReceipt: ReceiptItem | null;
  editingProject: Project | null;
  editingClient: Client | null;
};

type PersistedUiSessionPayload = {
  version: 1;
  state: PersistedUiSessionState;
};

const isStorageAvailable = () => typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export const loadPersistedUiSession = (): PersistedUiSessionState | null => {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.sessionStorage.getItem(UI_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedUiSessionPayload>;
    if (parsed.version !== 1 || !parsed.state) {
      window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
      return null;
    }

    return parsed.state;
  } catch {
    window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
    return null;
  }
};

export const savePersistedUiSession = (state: PersistedUiSessionState) => {
  if (!isStorageAvailable()) return;

  const payload: PersistedUiSessionPayload = {
    version: 1,
    state,
  };

  window.sessionStorage.setItem(UI_SESSION_STORAGE_KEY, JSON.stringify(payload));
};

export const clearPersistedUiSession = () => {
  if (!isStorageAvailable()) return;
  window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/context/ui-session-storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/ui-session-storage.ts src/context/ui-session-storage.test.ts
git commit -m "Add UI session storage helpers"
```

### Task 2: Napojit restore/save logiku do AppContext

**Files:**
- Modify: `src/context/AppContext.tsx`
- Test: `src/context/AppContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext } from './AppContext';

vi.mock('../app/providers/AuthProvider', () => ({
  useAuth: () => ({ isAuthRequired: false, role: 'crewhead' }),
}));

vi.mock('./ui-session-storage', () => ({
  loadPersistedUiSession: () => ({
    currentTab: 'events',
    searchQuery: 'akce',
    timelogFilter: 'approved',
    projectFilter: 'all',
    selectedContractorId: null,
    selectedEventId: 5,
    selectedProjectIdForStats: null,
    selectedClientIdForStats: null,
    eventTab: 'overview',
    eventsViewMode: 'calendar',
    eventsCalendarMode: 'month',
    eventsFilter: 'upcoming',
    eventsCalendarDate: '2026-04-23',
    editingTimelog: null,
    editingReceipt: null,
    editingProject: null,
    editingClient: null,
  }),
  savePersistedUiSession: vi.fn(),
  clearPersistedUiSession: vi.fn(),
}));

const Probe = () => {
  const { currentTab, searchQuery, selectedEventId, eventsViewMode } = useAppContext();
  return (
    <>
      <div>{currentTab}</div>
      <div>{searchQuery}</div>
      <div>{selectedEventId}</div>
      <div>{eventsViewMode}</div>
    </>
  );
};

describe('AppContext persisted UI restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores persisted UI state on mount', () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <Probe />
        </AppProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('events')).toBeInTheDocument();
    expect(screen.getByText('akce')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('calendar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/context/AppContext.test.tsx`
Expected: FAIL because `AppContext` still always initializes from defaults.

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  clearPersistedUiSession,
  loadPersistedUiSession,
  savePersistedUiSession,
} from './ui-session-storage';

const persistedUiState = loadPersistedUiSession();

const [currentTab, setCurrentTabState] = useState(persistedUiState?.currentTab ?? 'dashboard');
const [searchQuery, setSearchQuery] = useState(persistedUiState?.searchQuery ?? '');
const [timelogFilter, setTimelogFilter] = useState(persistedUiState?.timelogFilter ?? 'all');
const [projectFilter, setProjectFilter] = useState(persistedUiState?.projectFilter ?? 'all');
const [selectedContractorId, setSelectedContractorId] = useState<number | null>(persistedUiState?.selectedContractorId ?? null);
const [selectedEventId, setSelectedEventId] = useState<number | null>(persistedUiState?.selectedEventId ?? null);
const [selectedProjectIdForStats, setSelectedProjectIdForStats] = useState<string | null>(persistedUiState?.selectedProjectIdForStats ?? null);
const [selectedClientIdForStats, setSelectedClientIdForStats] = useState<number | null>(persistedUiState?.selectedClientIdForStats ?? null);
const [editingTimelog, setEditingTimelog] = useState<Timelog | null>(persistedUiState?.editingTimelog ?? null);
const [editingProject, setEditingProject] = useState<Project | null>(persistedUiState?.editingProject ?? null);
const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(persistedUiState?.editingReceipt ?? null);
const [editingClient, setEditingClient] = useState<Client | null>(persistedUiState?.editingClient ?? null);
const [eventTab, setEventTab] = useState<string>(persistedUiState?.eventTab ?? 'overview');
const [eventsViewMode, setEventsViewMode] = useState<'list' | 'calendar'>(persistedUiState?.eventsViewMode ?? 'list');
const [eventsCalendarMode, setEventsCalendarMode] = useState<'month' | 'week'>(persistedUiState?.eventsCalendarMode ?? 'month');
const [eventsFilter, setEventsFilter] = useState<'upcoming' | 'past' | 'all'>(persistedUiState?.eventsFilter ?? 'upcoming');
const [eventsCalendarDate, setEventsCalendarDate] = useState<string>(persistedUiState?.eventsCalendarDate ?? '');

useEffect(() => {
  savePersistedUiSession({
    currentTab,
    searchQuery,
    timelogFilter,
    projectFilter,
    selectedContractorId,
    selectedEventId,
    selectedProjectIdForStats,
    selectedClientIdForStats,
    eventTab,
    eventsViewMode,
    eventsCalendarMode,
    eventsFilter,
    eventsCalendarDate,
    editingTimelog,
    editingReceipt,
    editingProject,
    editingClient,
  });
}, [
  currentTab,
  searchQuery,
  timelogFilter,
  projectFilter,
  selectedContractorId,
  selectedEventId,
  selectedProjectIdForStats,
  selectedClientIdForStats,
  eventTab,
  eventsViewMode,
  eventsCalendarMode,
  eventsFilter,
  eventsCalendarDate,
  editingTimelog,
  editingReceipt,
  editingProject,
  editingClient,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/context/AppContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/context/AppContext.test.tsx
git commit -m "Restore UI session state in AppContext"
```

### Task 3: Vyčistit snapshot při sign-out

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/app/providers/AuthProvider.tsx`
- Test: `src/context/AppContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from './AppContext';

const clearPersistedUiSession = vi.fn();

vi.mock('./ui-session-storage', () => ({
  loadPersistedUiSession: () => null,
  savePersistedUiSession: vi.fn(),
  clearPersistedUiSession,
}));

vi.mock('../app/providers/AuthProvider', () => ({
  useAuth: () => ({ isAuthRequired: true, role: null }),
}));

describe('AppContext sign-out cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears persisted UI session when auth becomes required again', () => {
    render(<AppProvider><div>probe</div></AppProvider>);
    expect(clearPersistedUiSession).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/context/AppContext.test.tsx`
Expected: FAIL because sign-out cleanup is not implemented.

- [ ] **Step 3: Write minimal implementation**

```ts
useEffect(() => {
  if (isAuthRequired && !authRole) {
    clearPersistedUiSession();
  }
}, [authRole, isAuthRequired]);
```

If sign-out already has a dedicated helper in `AuthProvider`, call `clearPersistedUiSession()` there too, but do not duplicate broader reset logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/context/AppContext.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/app/providers/AuthProvider.tsx src/context/AppContext.test.tsx
git commit -m "Clear persisted UI session on sign-out"
```

### Task 4: Harden parsing and invalid snapshot handling

**Files:**
- Modify: `src/context/ui-session-storage.ts`
- Modify: `src/context/ui-session-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadPersistedUiSession } from './ui-session-storage';

describe('ui session storage invalid payloads', () => {
  it('returns null and clears malformed payloads', () => {
    window.sessionStorage.setItem('crewflow.ui-session.v1', '{broken-json');

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem('crewflow.ui-session.v1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/context/ui-session-storage.test.ts`
Expected: FAIL if malformed payloads are not removed consistently.

- [ ] **Step 3: Write minimal implementation**

```ts
const clearRawUiSessionStorage = () => {
  if (!isStorageAvailable()) return;
  window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
};

export const loadPersistedUiSession = (): PersistedUiSessionState | null => {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.sessionStorage.getItem(UI_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedUiSessionPayload>;
    if (parsed.version !== 1 || !parsed.state) {
      clearRawUiSessionStorage();
      return null;
    }

    return parsed.state;
  } catch {
    clearRawUiSessionStorage();
    return null;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/context/ui-session-storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/ui-session-storage.ts src/context/ui-session-storage.test.ts
git commit -m "Handle invalid UI session snapshots safely"
```

### Task 5: Final verification

**Files:**
- Verify only: `src/context/AppContext.tsx`, `src/context/ui-session-storage.ts`, tests touched above

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/context/ui-session-storage.test.ts src/context/AppContext.test.tsx`
Expected: PASS

- [ ] **Step 2: Run full lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/context/ui-session-storage.ts src/context/ui-session-storage.test.ts src/context/AppContext.test.tsx
git commit -m "Add session restore for UI draft state"
```

## Self-Review

- Spec coverage: plan covers helper creation, restore on mount, live save, sign-out cleanup, invalid snapshot handling, and verification. No spec section is left without a task.
- Placeholder scan: removed vague “handle errors later” language and provided concrete code or commands for each step.
- Type consistency: snapshot field names match the spec and current `AppContext` state keys; `eventsViewMode`, `eventsCalendarMode`, and `eventsFilter` stay typed consistently across helper and context tasks.

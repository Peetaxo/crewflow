# Initial App Data Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Keep the approved Nodu loading mark visible until the first authenticated screen has a consistent Supabase snapshot for events, timelogs, Crew, and projects.

**Architecture:** Refactor the four existing lazy hydration paths to expose deduplicated, awaitable loaders that reject on failed or stale attempts. A focused coordinator resets the previous data scope, awaits the four loaders in parallel, and seeds React Query from the committed local snapshot. AppDataBootstrap becomes a scope-aware React gate that shows the loading mark, a retryable generic error, or the authenticated layout.

**Tech Stack:** React 18, TypeScript, TanStack Query, Supabase JS, Vitest, Testing Library, Capacitor 8, Xcode/iOS Simulator

---

## File structure

- Create **src/app/providers/initial-app-data-bootstrap.ts**: reset scope, await four loaders, seed query caches.
- Create **src/app/providers/initial-app-data-bootstrap.test.ts**: coordinator order, parallelism, cache commit, rejection.
- Modify event, timelog, Crew, and project service files: expose awaitable loaders and close reset races.
- Modify corresponding service test files: prove deduplication, retry, and stale-scope rejection.
- Modify **src/app/providers/AppDataBootstrap.tsx** and its test: authenticated data gate and retry UI.
- Modify **src/pages/Index.tsx** and its test: place AppLayout behind the gate.

### Task 1: Awaitable Crew and project hydration

**Files:**
- Modify: src/features/crew/services/crew.service.ts
- Test: src/features/crew/services/crew.service.test.ts
- Modify: src/features/projects/services/projects.service.ts
- Test: src/features/projects/services/projects.service.test.ts

- [ ] **Step 1: Write failing Crew loader tests**

Add this helper to the Crew test file and use the existing authenticated-session harness:

~~~ts
const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

it('shares one awaitable Crew hydration and resolves after commit', async () => {
  const profiles = createDeferred<{ data: []; error: null }>();
  profilesOrder.mockReturnValue(profiles.promise);
  const { loadSupabaseCrew } = await import('./crew.service');

  const first = loadSupabaseCrew();
  const duplicate = loadSupabaseCrew();

  expect(first).toBe(duplicate);
  expect(updateLocalAppState).not.toHaveBeenCalled();

  profiles.resolve({ data: [], error: null });
  await expect(first).resolves.toBeUndefined();
  expect(updateLocalAppState).toHaveBeenCalledTimes(1);
  expect(getSession).toHaveBeenCalledTimes(1);
});

it('rejects a stale Crew load after reset and permits retry', async () => {
  const firstProfiles = createDeferred<{ data: []; error: null }>();
  profilesOrder
    .mockReturnValueOnce(firstProfiles.promise)
    .mockResolvedValueOnce({ data: [], error: null });
  const { loadSupabaseCrew, resetSupabaseCrewHydration } = await import('./crew.service');

  const staleLoad = loadSupabaseCrew();
  resetSupabaseCrewHydration();
  firstProfiles.resolve({ data: [], error: null });

  await expect(staleLoad).rejects.toThrow('Crew hydration scope changed.');
  await expect(loadSupabaseCrew()).resolves.toBeUndefined();
  expect(updateLocalAppState).toHaveBeenCalledTimes(1);
});
~~~

- [ ] **Step 2: Run Crew RED**

Run:

~~~bash
npm test -- src/features/crew/services/crew.service.test.ts -t "awaitable Crew|stale Crew"
~~~

Expected: FAIL because loadSupabaseCrew is not exported.

- [ ] **Step 3: Implement the awaitable Crew loader**

Refactor the shared promise to Promise<void>. Preserve the current ensure function as a warning-only fire-and-forget adapter:

~~~ts
let crewHydrationPromise: Promise<void> | null = null;

export const loadSupabaseCrew = (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured || crewLoaded) {
    return Promise.resolve();
  }
  if (crewHydrationPromise) return crewHydrationPromise;

  const epoch = crewHydrationEpoch;
  const request = hydrateCrewFromSupabase(epoch).then((didLoad) => {
    if (epoch !== crewHydrationEpoch) throw new Error('Crew hydration scope changed.');
    if (!didLoad) throw new Error('Crew hydration did not commit.');
    crewLoaded = true;
  });
  const sharedRequest = request.finally(() => {
    if (crewHydrationPromise === sharedRequest) crewHydrationPromise = null;
  });
  crewHydrationPromise = sharedRequest;
  return sharedRequest;
};

export const ensureSupabaseCrewLoaded = () => {
  void loadSupabaseCrew().catch((error) => {
    console.warn('Nepodarilo se nacist crew ze Supabase, zustavam na lokalnich datech.', error);
  });
};
~~~

- [ ] **Step 4: Verify Crew GREEN**

Run:

~~~bash
npm test -- src/features/crew/services/crew.service.test.ts
~~~

Expected: all Crew tests PASS.

- [ ] **Step 5: Write failing project reset test**

~~~ts
it('discards an in-flight project snapshot after reset and loads retry', async () => {
  const firstProjects = createDeferred<{ data: []; error: null }>();
  projectsOrder
    .mockReturnValueOnce(firstProjects.promise)
    .mockResolvedValueOnce({ data: [], error: null });
  const { loadSupabaseProjects, resetSupabaseProjectsHydration } = await import('./projects.service');

  const staleLoad = loadSupabaseProjects();
  resetSupabaseProjectsHydration();
  firstProjects.resolve({ data: [], error: null });

  await expect(staleLoad).rejects.toThrow('Project hydration scope changed.');
  expect(updateLocalAppState).not.toHaveBeenCalled();

  await expect(loadSupabaseProjects()).resolves.toBeUndefined();
  expect(updateLocalAppState).toHaveBeenCalledTimes(1);
});
~~~

- [ ] **Step 6: Run project RED**

~~~bash
npm test -- src/features/projects/services/projects.service.test.ts -t "in-flight project snapshot"
~~~

Expected: FAIL because the public loader and project hydration epoch do not exist.

- [ ] **Step 7: Implement project epoch and awaitable loading**

~~~ts
let projectsHydrationPromise: Promise<void> | null = null;
let projectsLoaded = false;
let projectsHydrationEpoch = 0;

const hydrateProjectsFromSupabase = async (epoch: number): Promise<void> => {
  // Keep the current two Supabase reads and mapping.
  if (epoch !== projectsHydrationEpoch) throw new Error('Project hydration scope changed.');
  updateLocalAppState((snapshot) => ({ ...snapshot, projects: supabaseProjects }));
};

export const loadSupabaseProjects = (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured || projectsLoaded) {
    return Promise.resolve();
  }
  if (projectsHydrationPromise) return projectsHydrationPromise;

  const epoch = projectsHydrationEpoch;
  const request = hydrateProjectsFromSupabase(epoch).then(() => {
    if (epoch !== projectsHydrationEpoch) throw new Error('Project hydration scope changed.');
    projectsLoaded = true;
  });
  const sharedRequest = request.finally(() => {
    if (projectsHydrationPromise === sharedRequest) projectsHydrationPromise = null;
  });
  projectsHydrationPromise = sharedRequest;
  return sharedRequest;
};

const ensureSupabaseProjectsLoaded = () => {
  void loadSupabaseProjects().catch((error) => {
    console.warn('Nepodarilo se nacist projekty ze Supabase, zustavam na lokalnich datech.', error);
  });
};

export const resetSupabaseProjectsHydration = () => {
  projectsHydrationEpoch += 1;
  projectsHydrationPromise = null;
  projectsLoaded = false;
};
~~~

- [ ] **Step 8: Verify and commit Task 1**

~~~bash
npm test -- src/features/crew/services/crew.service.test.ts src/features/projects/services/projects.service.test.ts
git add src/features/crew/services/crew.service.ts src/features/crew/services/crew.service.test.ts src/features/projects/services/projects.service.ts src/features/projects/services/projects.service.test.ts
git commit -m "fix: expose core profile data hydration"
~~~

Expected: both suites PASS and only the four files are committed.

### Task 2: Awaitable event and timelog hydration

**Files:**
- Modify: src/features/events/services/events.service.ts
- Test: src/features/events/services/events.service.test.ts
- Modify: src/features/timelogs/services/timelogs.service.ts
- Test: src/features/timelogs/services/timelogs.service.test.ts

- [ ] **Step 1: Add failing event loader test**

~~~ts
type EventQueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

it('shares one awaitable event hydration and retries after rejection', async () => {
  const firstRows = createDeferred<EventQueryResult>();
  eventsSelect
    .mockReturnValueOnce(firstRows.promise)
    .mockResolvedValueOnce({ data: [], error: null });
  const { loadSupabaseEvents } = await import('./events.service');

  const first = loadSupabaseEvents();
  const duplicate = loadSupabaseEvents();
  expect(first).toBe(duplicate);

  firstRows.resolve({ data: null, error: { message: 'offline' } });
  await expect(first).rejects.toThrow('offline');
  await expect(loadSupabaseEvents()).resolves.toBeUndefined();
  expect(eventsSelect).toHaveBeenCalledTimes(2);
});
~~~

- [ ] **Step 2: Run event RED**

~~~bash
npm test -- src/features/events/services/events.service.test.ts -t "awaitable event hydration"
~~~

Expected: FAIL because loadSupabaseEvents is absent.

- [ ] **Step 3: Export the event loader**

~~~ts
export const loadSupabaseEvents = (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured || eventsLoaded) {
    return Promise.resolve();
  }
  if (eventsHydrationPromise) return eventsHydrationPromise;

  const epoch = eventsHydrationEpoch;
  const request = loadAndCommitEventsSnapshotWithRetry(epoch).then((result) => {
    if (!result.committed || epoch !== eventsHydrationEpoch) {
      throw new Error('Event hydration scope changed.');
    }
    eventsLoaded = true;
  });
  const sharedRequest = request.finally(() => {
    if (eventsHydrationPromise === sharedRequest) eventsHydrationPromise = null;
  });
  eventsHydrationPromise = sharedRequest;
  return sharedRequest;
};

export const ensureSupabaseEventsLoaded = () => {
  void loadSupabaseEvents().catch((error) => {
    console.warn('Nepodarilo se nacist akce ze Supabase, zustavam na lokalnich datech.', error);
  });
};
~~~

- [ ] **Step 4: Add failing timelog reset test**

~~~ts
type SupabaseRowsResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

it('rejects an awaitable timelog load reset before response', async () => {
  const rows = createDeferred<SupabaseRowsResult>();
  timelogsOrder.mockReturnValueOnce(rows.promise);
  const { loadSupabaseTimelogs, resetSupabaseTimelogsHydration } = await import('./timelogs.service');

  const staleLoad = loadSupabaseTimelogs();
  resetSupabaseTimelogsHydration();
  rows.resolve({ data: [], error: null });

  await expect(staleLoad).rejects.toThrow('Timelog hydration scope changed.');
  expect(updateLocalAppState).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 5: Run timelog RED**

~~~bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts -t "awaitable timelog load"
~~~

Expected: FAIL because loadSupabaseTimelogs and the epoch do not exist.

- [ ] **Step 6: Add timelog epoch and loader**

Capture timelogsHydrationEpoch at the start of fetchTimelogsSnapshot and include it in the existing generation guard before updateLocalAppState. Then add:

~~~ts
let timelogsHydrationEpoch = 0;

export const loadSupabaseTimelogs = (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured || timelogsLoaded) {
    return Promise.resolve();
  }
  if (timelogsHydrationPromise) return timelogsHydrationPromise;

  const epoch = timelogsHydrationEpoch;
  const request = fetchTimelogsSnapshot().then(() => {
    if (epoch !== timelogsHydrationEpoch) throw new Error('Timelog hydration scope changed.');
    timelogsLoaded = true;
  });
  const sharedRequest = request.finally(() => {
    if (timelogsHydrationPromise === sharedRequest) timelogsHydrationPromise = null;
  });
  timelogsHydrationPromise = sharedRequest;
  return sharedRequest;
};

export const ensureSupabaseTimelogsLoaded = () => {
  void loadSupabaseTimelogs().catch((error) => {
    console.warn('Nepodarilo se nacist timelogy ze Supabase, zustavam na lokalnich datech.', error);
  });
};

export const resetSupabaseTimelogsHydration = () => {
  timelogsHydrationEpoch += 1;
  timelogsHydrationPromise = null;
  timelogsLoaded = false;
};
~~~

- [ ] **Step 7: Verify and commit Task 2**

~~~bash
npm test -- src/features/events/services/events.service.test.ts src/features/timelogs/services/timelogs.service.test.ts
git add src/features/events/services/events.service.ts src/features/events/services/events.service.test.ts src/features/timelogs/services/timelogs.service.ts src/features/timelogs/services/timelogs.service.test.ts
git commit -m "fix: await core lifecycle hydration"
~~~

Expected: both suites PASS.

### Task 3: Coordinate the initial snapshot

**Files:**
- Create: src/app/providers/initial-app-data-bootstrap.ts
- Create: src/app/providers/initial-app-data-bootstrap.test.ts

- [ ] **Step 1: Write failing coordinator tests**

~~~ts
const mocks = vi.hoisted(() => ({
  order: [] as string[],
  reset: vi.fn(async () => { mocks.order.push('reset'); }),
  events: vi.fn(async () => { mocks.order.push('events'); }),
  timelogs: vi.fn(async () => { mocks.order.push('timelogs'); }),
  crew: vi.fn(async () => { mocks.order.push('crew'); }),
  projects: vi.fn(async () => { mocks.order.push('projects'); }),
  setQueryData: vi.fn(),
  snapshot: { events: [{ id: 1 }], timelogs: [{ id: 2 }] },
}));

it('resets, loads every core dataset, and seeds query caches', async () => {
  const { bootstrapInitialAppData } = await import('./initial-app-data-bootstrap');
  await bootstrapInitialAppData();

  expect(mocks.order[0]).toBe('reset');
  expect(new Set(mocks.order.slice(1))).toEqual(new Set(['events', 'timelogs', 'crew', 'projects']));
  expect(mocks.setQueryData).toHaveBeenCalledWith(['events'], mocks.snapshot.events);
  expect(mocks.setQueryData).toHaveBeenCalledWith(['timelogs'], mocks.snapshot.timelogs);
});

it('does not seed caches when a required loader rejects', async () => {
  mocks.crew.mockRejectedValueOnce(new Error('offline'));
  const { bootstrapInitialAppData } = await import('./initial-app-data-bootstrap');

  await expect(bootstrapInitialAppData()).rejects.toThrow('offline');
  expect(mocks.setQueryData).not.toHaveBeenCalled();
});
~~~

- [ ] **Step 2: Run coordinator RED**

~~~bash
npm test -- src/app/providers/initial-app-data-bootstrap.test.ts
~~~

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the coordinator**

~~~ts
import { loadSupabaseCrew } from '../../features/crew/services/crew.service';
import { loadSupabaseEvents } from '../../features/events/services/events.service';
import { loadSupabaseProjects } from '../../features/projects/services/projects.service';
import { loadSupabaseTimelogs } from '../../features/timelogs/services/timelogs.service';
import { getLocalAppState } from '../../lib/app-data';
import { queryClient } from '../../lib/query-client';
import { queryKeys } from '../../lib/query-keys';
import { resetSupabaseDataScope } from './reset-supabase-data-scope';

export const bootstrapInitialAppData = async (): Promise<void> => {
  await resetSupabaseDataScope();
  await Promise.all([
    loadSupabaseEvents(),
    loadSupabaseTimelogs(),
    loadSupabaseCrew(),
    loadSupabaseProjects(),
  ]);

  const snapshot = getLocalAppState();
  queryClient.setQueryData(queryKeys.events.all, snapshot.events ?? []);
  queryClient.setQueryData(queryKeys.timelogs.all, snapshot.timelogs ?? []);
};
~~~

- [ ] **Step 4: Verify and commit Task 3**

~~~bash
npm test -- src/app/providers/initial-app-data-bootstrap.test.ts
git add src/app/providers/initial-app-data-bootstrap.ts src/app/providers/initial-app-data-bootstrap.test.ts
git commit -m "feat: coordinate initial app data"
~~~

Expected: coordinator tests PASS.

### Task 4: Gate the authenticated layout

**Files:**
- Modify: src/app/providers/AppDataBootstrap.tsx
- Test: src/app/providers/AppDataBootstrap.test.tsx
- Modify: src/pages/Index.tsx
- Test: src/pages/Index.test.tsx

- [ ] **Step 1: Write failing gate tests**

~~~tsx
const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

it('keeps children hidden until all initial data commits', async () => {
  const attempt = createDeferred<void>();
  mocks.bootstrap.mockReturnValueOnce(attempt.promise);

  render(<AppDataBootstrap><div>Ready dashboard</div></AppDataBootstrap>);

  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
  expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

  attempt.resolve();
  expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
});

it('shows a generic retry state without raw Supabase text', async () => {
  mocks.bootstrap
    .mockRejectedValueOnce(new Error('new row violates row-level security'))
    .mockResolvedValueOnce(undefined);

  render(<AppDataBootstrap><div>Ready dashboard</div></AppDataBootstrap>);

  expect(await screen.findByText('Data aplikace se nepodařilo načíst.')).toBeInTheDocument();
  expect(screen.queryByText('new row violates row-level security')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
  expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
});

it('ignores completion from the previous role scope', async () => {
  const crewAttempt = createDeferred<void>();
  const cooAttempt = createDeferred<void>();
  mocks.bootstrap.mockReturnValueOnce(crewAttempt.promise).mockReturnValueOnce(cooAttempt.promise);

  const view = render(<AppDataBootstrap><div>Ready dashboard</div></AppDataBootstrap>);
  mockAuthState.role = 'coo';
  view.rerender(<AppDataBootstrap><div>Ready dashboard</div></AppDataBootstrap>);

  crewAttempt.resolve();
  await Promise.resolve();
  expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

  cooAttempt.resolve();
  expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
});
~~~

Also test local mode renders immediately and unmount suppresses post-await state updates.

- [ ] **Step 2: Run gate RED**

~~~bash
npm test -- src/app/providers/AppDataBootstrap.test.tsx
~~~

Expected: FAIL because the current component returns null and accepts no children.

- [ ] **Step 3: Implement the scope-aware gate**

Use currentUserId, currentProfileId, and role to form a scope key. Compare the stored key with the current key during render so a role change hides old children before the effect runs.

~~~tsx
import React, { useEffect, useRef, useState } from 'react';
import AppLoadingMark from '../../components/shared/AppLoadingMark';
import { appDataSource } from '../../lib/app-config';
import { bootstrapInitialAppData } from './initial-app-data-bootstrap';
import { useAuth } from './useAuth';

type BootstrapStatus = 'loading' | 'ready' | 'error';

const AppDataBootstrap = ({ children }: { children: React.ReactNode }) => {
  const { currentProfileId, currentUserId, isAuthRequired, isAuthenticated, role } = useAuth();
  const scopeKey = isAuthRequired
    ? [currentUserId ?? currentProfileId ?? 'authenticated', role ?? 'unknown'].join(':')
    : 'local';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ scopeKey: string; status: BootstrapStatus }>({
    scopeKey,
    status: appDataSource === 'supabase' && isAuthRequired ? 'loading' : 'ready',
  });
  const generation = useRef(0);

  useEffect(() => {
    if (appDataSource !== 'supabase' || !isAuthRequired) {
      setState({ scopeKey, status: 'ready' });
      return;
    }
    if (!isAuthenticated) return;

    const currentGeneration = ++generation.current;
    setState({ scopeKey, status: 'loading' });
    void bootstrapInitialAppData()
      .then(() => {
        if (generation.current === currentGeneration) setState({ scopeKey, status: 'ready' });
      })
      .catch((error) => {
        if (generation.current !== currentGeneration) return;
        console.error('Initial app data bootstrap failed', error);
        setState({ scopeKey, status: 'error' });
      });
    return () => { generation.current += 1; };
  }, [attempt, isAuthRequired, isAuthenticated, scopeKey]);

  const status = state.scopeKey === scopeKey ? state.status : 'loading';
  if (status === 'loading') return <AppLoadingMark />;
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div role="alert" className="nodu-dashboard-panel max-w-sm rounded-[28px] p-5 text-center">
          <p>Data aplikace se nepodařilo načíst.</p>
          <button type="button" className="mt-4 rounded-xl bg-[color:var(--nodu-accent)] px-4 py-2 text-white" onClick={() => setAttempt((value) => value + 1)}>
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};
~~~

Do not render error.message.

- [ ] **Step 4: Place AppLayout behind the gate**

In Index.tsx:

~~~tsx
return (
  <AppProvider>
    <AppDataBootstrap>
      <AppLayout />
    </AppDataBootstrap>
  </AppProvider>
);
~~~

Update the test mock:

~~~tsx
vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-data-bootstrap">{children}</div>
  ),
}));
~~~

- [ ] **Step 5: Verify the gate and focused matrix**

~~~bash
npm test -- src/app/providers/AppDataBootstrap.test.tsx src/pages/Index.test.tsx
npm test -- src/app/providers/AppDataBootstrap.test.tsx src/app/providers/initial-app-data-bootstrap.test.ts src/app/providers/reset-supabase-data-scope.test.ts src/pages/Index.test.tsx src/features/events/services/events.service.test.ts src/features/timelogs/services/timelogs.service.test.ts src/features/crew/services/crew.service.test.ts src/features/projects/services/projects.service.test.ts
~~~

Expected: all focused tests PASS with no unhandled promise warnings.

- [ ] **Step 6: Commit Task 4**

~~~bash
git add src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx src/pages/Index.tsx src/pages/Index.test.tsx
git commit -m "fix: gate app layout on initial data"
~~~

### Task 5: Verification and iOS proof

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run static and production checks**

~~~bash
npx tsc --noEmit
npx eslint src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx src/app/providers/initial-app-data-bootstrap.ts src/app/providers/initial-app-data-bootstrap.test.ts src/pages/Index.tsx src/pages/Index.test.tsx src/features/events/services/events.service.ts src/features/timelogs/services/timelogs.service.ts src/features/crew/services/crew.service.ts src/features/projects/services/projects.service.ts
npm run build
git diff --check
~~~

Expected: exit 0. Existing Browserslist, chunk-size, and ineffective dynamic-import warnings may remain; no new errors are allowed.

- [ ] **Step 2: Run the full suite and compare the known baseline**

~~~bash
npm test
~~~

Expected feature result: no bootstrap/auth/event/timelog/Crew/project regression. The already reproduced baseline may still contain exactly 13 unrelated failures in FleetView.test.tsx, fleet.service.test.ts, and warehouse.service.test.ts. Any different failure blocks integration.

- [ ] **Step 3: Build iOS with the existing local Supabase environment**

~~~bash
set -a
source /Users/peetax/Projekty/crewflow/.env.local
set +a
npm run build
npx cap sync ios
~~~

Expected: build and sync exit 0. Do not copy or commit .env.local.

- [ ] **Step 4: Launch and inspect the simulator**

Use XcodeBuildMCP in this order:

1. session_show_defaults
2. list_sims
3. build_run_sim
4. screenshot

Expected: app launches without the missing-Supabase screen.

- [ ] **Step 5: Reproduce the original flow manually**

1. Sign out and sign in as Crew.
2. Confirm the Nodu mark remains until the first dashboard data is ready.
3. Confirm the first visible earnings, shifts, and workflow rows do not change from temporary zeros.
4. Relaunch with stored session and repeat.
5. Switch Crew → CH → COO and confirm each scope is gated.
6. Disconnect network once and verify the generic retry state contains no raw Supabase text.

- [ ] **Step 6: Verify repository scope**

~~~bash
git status --short
git log -6 --oneline
~~~

Expected: only planned commits plus the pre-existing untracked SwiftPM workspace directory. Never stage ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/.

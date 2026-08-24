# Minimum Loading Intro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing Nodu loader continuous after sign-in and visible for at least the 1.8-second outward-ray phase before revealing an already-loaded application.

**Architecture:** `AppDataBootstrap` becomes the single authenticated startup gate for both profile/role loading and initial role-scoped data loading. It owns a once-per-mounted-session intro clock, delays only a fast successful first bootstrap, and preserves generation and timer cleanup; `AppShell` routes authenticated loading into that gate and mounts `AppProvider` only after the gate is ready.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite, Capacitor iOS

---

## File structure

- Modify `src/app/providers/AppDataBootstrap.tsx`: coordinate auth readiness, data bootstrap, the 1.8-second minimum intro, reduced-motion bypass, and stale timer cleanup.
- Modify `src/app/providers/AppDataBootstrap.test.tsx`: prove timing, continuity, role-scope, reduced-motion, and cleanup behavior.
- Modify `src/pages/Index.tsx`: route an accepted authenticated session through the persistent bootstrap gate and move `AppProvider` inside it.
- Modify `src/pages/Index.test.tsx`: prove authenticated metadata loading reaches the bootstrap gate while an unknown unauthenticated session still uses the initial auth loader.

### Task 1: Make the authenticated bootstrap gate continuous and time-aware

**Files:**
- Modify: `src/app/providers/AppDataBootstrap.test.tsx`
- Modify: `src/app/providers/AppDataBootstrap.tsx`

- [ ] **Step 1: Add auth-loading and motion controls to the component test harness**

Add `afterEach` to the Vitest import, add `isLoading` to `mockAuthState`, and install a file-local motion preference mock so existing non-timing cases can bypass the artificial delay:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let prefersReducedMotion = true;

const mockAuthState = {
  currentProfileId: 'profile-1' as string | null,
  currentUserId: 'user-1' as string | null,
  isAuthRequired: true,
  isAuthenticated: true,
  isLoading: false,
  role: 'crew' as 'crew' | 'coo',
};
```

At the beginning of the existing `beforeEach`, reset `isLoading` and replace `window.matchMedia` with this complete test double:

```tsx
prefersReducedMotion = true;
Object.assign(mockAuthState, {
  currentProfileId: 'profile-1',
  currentUserId: 'user-1',
  isAuthRequired: true,
  isAuthenticated: true,
  isLoading: false,
  role: 'crew',
});

vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
  matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
```

Restore timers and spies after every test:

```tsx
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

- [ ] **Step 2: Write the failing continuity test**

Add a test showing that auth metadata loading does not start bootstrap and that the same loading DOM node remains mounted when bootstrap starts:

```tsx
it('keeps one loading mark mounted from auth metadata into data bootstrap', async () => {
  const attempt = createDeferred<void>();
  mocks.bootstrap.mockReturnValueOnce(attempt.promise);
  mockAuthState.isLoading = true;

  const view = render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  const loadingMark = screen.getByRole('status', { name: 'Připravuji aplikaci' });
  expect(mocks.bootstrap).not.toHaveBeenCalled();

  mockAuthState.isLoading = false;
  view.rerender(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBe(loadingMark);

  await act(async () => { attempt.resolve(); });
  expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
});
```

- [ ] **Step 3: Write failing minimum-intro tests**

Import the timing constant with the component and add these fast-load and slow-load cases:

```tsx
import AppDataBootstrap, { AUTHENTICATED_LOADING_INTRO_MS } from './AppDataBootstrap';

it('waits for the outward-ray intro when bootstrap finishes early', async () => {
  vi.useFakeTimers();
  prefersReducedMotion = false;

  render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

  act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS - 1); });
  expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
});

it('reveals immediately when bootstrap finishes after the outward-ray intro', async () => {
  vi.useFakeTimers();
  prefersReducedMotion = false;
  const attempt = createDeferred<void>();
  mocks.bootstrap.mockReturnValueOnce(attempt.promise);

  render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });
  await act(async () => { attempt.resolve(); });

  expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
});
```

- [ ] **Step 4: Write failing once-per-session, reduced-motion, and cleanup tests**

Add these cases to prevent the timing rule from delaying role changes or firing after unmount:

```tsx
it('does not impose the intro minimum again for a later role scope', async () => {
  vi.useFakeTimers();
  prefersReducedMotion = false;
  const cooAttempt = createDeferred<void>();
  mocks.bootstrap
    .mockResolvedValueOnce(undefined)
    .mockReturnValueOnce(cooAttempt.promise);

  const view = render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });
  expect(screen.getByText('Ready dashboard')).toBeInTheDocument();

  mockAuthState.role = 'coo';
  view.rerender(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );
  await act(async () => { await Promise.resolve(); });
  expect(mocks.bootstrap).toHaveBeenCalledTimes(2);

  await act(async () => { cooAttempt.resolve(); });
  expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
});

it('skips the artificial minimum when reduced motion is requested', async () => {
  prefersReducedMotion = true;

  render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
});

it('cancels a delayed reveal after unmount', async () => {
  vi.useFakeTimers();
  prefersReducedMotion = false;
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const view = render(
    <AppDataBootstrap>
      <div>Ready dashboard</div>
    </AppDataBootstrap>,
  );

  await act(async () => { await Promise.resolve(); });
  view.unmount();
  act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });

  expect(consoleError).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Run the focused tests and verify the new cases fail**

Run:

```bash
npm test -- src/app/providers/AppDataBootstrap.test.tsx
```

Expected: the new tests fail because `isLoading` is ignored, the timing constant is absent, and children are currently revealed immediately after a successful bootstrap.

- [ ] **Step 6: Implement the persistent auth/data loading gate**

Update `src/app/providers/AppDataBootstrap.tsx` with the timing constant, auth-loading guard, remaining-time calculation, and timer cleanup. Preserve the existing retry UI and use this implementation for the component body and effect:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import AppLoadingMark from '../../components/shared/AppLoadingMark';
import { appDataSource } from '../../lib/app-config';
import { bootstrapInitialAppData } from './initial-app-data-bootstrap';
import { useAuth } from './useAuth';

type BootstrapStatus = 'loading' | 'ready' | 'error';

export const AUTHENTICATED_LOADING_INTRO_MS = 1_800;

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const AppDataBootstrap = ({ children }: { children: ReactNode }) => {
  const {
    currentProfileId,
    currentUserId,
    isAuthRequired,
    isAuthenticated,
    isLoading: isAuthLoading,
    role,
  } = useAuth();
  const scopeKey = isAuthRequired
    ? [currentUserId ?? currentProfileId ?? 'authenticated', role ?? 'unknown'].join(':')
    : 'local';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ scopeKey: string; status: BootstrapStatus }>({
    scopeKey,
    status: appDataSource === 'supabase' && isAuthRequired ? 'loading' : 'ready',
  });
  const generation = useRef(0);
  const introStartedAt = useRef<number | null>(isAuthenticated ? Date.now() : null);
  const hasCompletedInitialIntro = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (readyTimer.current !== null) {
      clearTimeout(readyTimer.current);
      readyTimer.current = null;
    }

    if (appDataSource !== 'supabase' || !isAuthRequired) {
      hasCompletedInitialIntro.current = true;
      setState({ scopeKey, status: 'ready' });
      return;
    }
    if (!isAuthenticated) return;

    if (introStartedAt.current === null) {
      introStartedAt.current = Date.now();
    }

    if (isAuthLoading) {
      setState({ scopeKey, status: 'loading' });
      return;
    }

    const currentGeneration = ++generation.current;
    setState({ scopeKey, status: 'loading' });

    const revealChildren = () => {
      readyTimer.current = null;
      if (generation.current !== currentGeneration) return;
      hasCompletedInitialIntro.current = true;
      setState({ scopeKey, status: 'ready' });
    };

    void bootstrapInitialAppData()
      .then(() => {
        if (generation.current !== currentGeneration) return;

        const elapsed = Date.now() - (introStartedAt.current ?? Date.now());
        const remainingIntro = hasCompletedInitialIntro.current || prefersReducedMotion()
          ? 0
          : Math.max(0, AUTHENTICATED_LOADING_INTRO_MS - elapsed);

        if (remainingIntro === 0) {
          revealChildren();
          return;
        }

        readyTimer.current = setTimeout(revealChildren, remainingIntro);
      })
      .catch((error) => {
        if (generation.current !== currentGeneration) return;
        console.error('Initial app data bootstrap failed', error);
        setState({ scopeKey, status: 'error' });
      });

    return () => {
      generation.current += 1;
      if (readyTimer.current !== null) {
        clearTimeout(readyTimer.current);
        readyTimer.current = null;
      }
    };
  }, [attempt, isAuthLoading, isAuthRequired, isAuthenticated, scopeKey]);

  const status = state.scopeKey === scopeKey ? state.status : 'loading';
  if (status === 'loading') return <AppLoadingMark />;
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div role="alert" className="nodu-dashboard-panel max-w-sm rounded-[28px] p-5 text-center">
          <p>Data aplikace se nepodařilo načíst.</p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-[color:var(--nodu-accent)] px-4 py-2 text-white"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppDataBootstrap;
```

- [ ] **Step 7: Run the focused component test**

Run:

```bash
npm test -- src/app/providers/AppDataBootstrap.test.tsx
```

Expected: all `AppDataBootstrap` tests pass, including continuity, 1.8-second fast-load delay, slow-load reveal, role switch, reduced motion, retry, and unmount cleanup.

- [ ] **Step 8: Commit the bootstrap gate**

```bash
git add src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx
git commit -m "fix: preserve loading intro through bootstrap"
```

### Task 2: Route authenticated metadata loading through the persistent gate

**Files:**
- Modify: `src/pages/Index.test.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Make the bootstrap mock model auth loading**

Replace the existing `AppDataBootstrap` mock in `src/pages/Index.test.tsx` with:

```tsx
vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-data-bootstrap">
      {mockAuthState.isLoading
        ? <div role="status" aria-label="Připravuji aplikaci" />
        : children}
    </div>
  ),
}));
```

- [ ] **Step 2: Change the authenticated-loading routing expectation**

Replace the existing profile/role loading test with:

```tsx
it('routes an accepted session through the persistent bootstrap gate while metadata loads', () => {
  Object.assign(mockAuthState, {
    hasKnownSession: true,
    isAuthRequired: true,
    isAuthenticated: true,
    isLoading: true,
  });

  render(
    <MemoryRouter initialEntries={['/app']}>
      <AppShell />
    </MemoryRouter>,
  );

  expect(screen.getByTestId('app-data-bootstrap')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
  expect(screen.queryByText('App layout')).not.toBeInTheDocument();
});
```

Add a separate regression test for the initial unknown unauthenticated session:

```tsx
it('keeps an unknown unauthenticated session outside the data bootstrap gate', () => {
  Object.assign(mockAuthState, {
    hasKnownSession: false,
    isAuthRequired: true,
    isAuthenticated: false,
    isLoading: true,
  });

  render(
    <MemoryRouter initialEntries={['/app']}>
      <AppShell />
    </MemoryRouter>,
  );

  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
  expect(screen.queryByTestId('app-data-bootstrap')).not.toBeInTheDocument();
  expect(screen.queryByText('App layout')).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the routing tests and verify the new authenticated case fails**

Run:

```bash
npm test -- src/pages/Index.test.tsx
```

Expected: the accepted-session test fails because `AppShell` still returns its direct loading mark before mounting `AppDataBootstrap`.

- [ ] **Step 4: Route accepted sessions into `AppDataBootstrap` and invert provider order**

In `src/pages/Index.tsx`, restrict the early auth loader to sessions that are not yet authenticated:

```tsx
if (isLoading && !isAuthenticated) {
  return <AppLoadingMark />;
}
```

Keep the existing unauthenticated login check after that condition. Replace the authenticated tree with:

```tsx
return (
  <AppDataBootstrap>
    <AppProvider>
      <AppLayout />
    </AppProvider>
  </AppDataBootstrap>
);
```

This keeps `AppDataBootstrap` mounted from session acceptance through data readiness and prevents `AppProvider` or `AppLayout` from mounting until the gate returns its children.

- [ ] **Step 5: Run both focused suites**

Run:

```bash
npm test -- src/app/providers/AppDataBootstrap.test.tsx src/pages/Index.test.tsx
```

Expected: both focused suites pass with no loader restart and no unauthenticated routing regression.

- [ ] **Step 6: Commit the application-shell routing**

```bash
git add src/pages/Index.tsx src/pages/Index.test.tsx
git commit -m "fix: keep authenticated loader mounted"
```

### Task 3: Verify the complete web and iOS result

**Files:**
- Verify only; no planned source changes

- [ ] **Step 1: Run TypeScript and focused lint**

```bash
npx tsc --noEmit
npx eslint src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx src/pages/Index.tsx src/pages/Index.test.tsx
```

Expected: both commands exit with code 0 and no errors.

- [ ] **Step 2: Run the full automated test suite**

```bash
npm test
```

Expected: all tests pass; the previous verified baseline was 872 passing tests before this feature.

- [ ] **Step 3: Produce the production web bundle**

```bash
npm run build
```

Expected: Vite completes the production build successfully.

- [ ] **Step 4: Sync the verified bundle into iOS**

```bash
npx cap sync ios
```

Expected: Capacitor copies the current `dist` bundle and reports a successful iOS sync without configuring a live-reload `server.url`.

- [ ] **Step 5: Build the iOS simulator application**

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,id=B337323A-264B-4AAC-9236-BEAAB3701659' -derivedDataPath /tmp/crewflow-loader-derived build
```

Expected: `** BUILD SUCCEEDED **` and an application bundle at `/tmp/crewflow-loader-derived/Build/Products/Debug-iphonesimulator/App.app`.

- [ ] **Step 6: Install, launch, and visually verify on the simulator**

```bash
xcrun simctl install B337323A-264B-4AAC-9236-BEAAB3701659 /tmp/crewflow-loader-derived/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch B337323A-264B-4AAC-9236-BEAAB3701659 cz.nodu.app
xcrun simctl io B337323A-264B-4AAC-9236-BEAAB3701659 screenshot /tmp/crewflow-loading-intro.png
```

Expected: the app launches, the first authenticated load shows one smooth continuous outward-ray animation for at least 1.8 seconds, and the styled overview appears only when initial data is ready. Inspect `/tmp/crewflow-loading-intro.png` for layout regressions; use a short simulator screen recording when checking motion timing because a screenshot cannot prove animation continuity.

- [ ] **Step 7: Confirm repository cleanliness and push the verified commits**

```bash
git status --short
git log -4 --oneline
git push origin main
```

Expected: no uncommitted files, the design/plan and two implementation commits are at the top of `main`, and the push updates `origin/main` without a force push.

# Native Startup Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed Capacitor application enter the authenticated application flow at startup without ever rendering the public web landing page.

**Architecture:** `AppShell` detects native Capacitor runtime synchronously, suppresses `WelcomeView` for a native root pathname, and replaces `/` with `/app` in a React effect while rendering the existing auth state immediately. Browser routing remains unchanged, and no native configuration or authentication code is duplicated.

**Tech Stack:** React 18, React Router 6, Capacitor 8, TypeScript, Vitest, Testing Library, Vite, iOS Simulator

---

## File structure

- Modify `src/pages/Index.test.tsx`: model native/browser runtime and prove all three native authentication states plus the canonical `/app` replacement.
- Modify `src/pages/Index.tsx`: detect native root startup, suppress the public page synchronously, and replace the route without changing the existing auth decisions.

### Task 1: Route native root startup into the application flow

**Files:**
- Modify: `src/pages/Index.test.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Add native runtime control to the routing test harness**

Import `useLocation` for a small path probe:

```tsx
import { MemoryRouter, useLocation } from 'react-router-dom';
```

Extend the existing hoisted `runtimeConfig` object:

```tsx
const runtimeConfig = vi.hoisted(() => ({
  appDataSource: 'supabase' as 'local' | 'supabase',
  isNativePlatform: false,
  isSupabaseConfigured: true,
}));
```

Mock the Capacitor platform detector and add a probe component below the mocks:

```tsx
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => runtimeConfig.isNativePlatform,
  },
}));

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};
```

Reset browser runtime in the existing `beforeEach`:

```tsx
runtimeConfig.isNativePlatform = false;
```

- [ ] **Step 2: Write the failing native unauthenticated-session-check test**

Add this test to prove that the public page is suppressed on the first native paint:

```tsx
it('shows the auth loader instead of the public page during native session discovery', () => {
  runtimeConfig.isNativePlatform = true;
  Object.assign(mockAuthState, {
    hasKnownSession: false,
    isAuthRequired: true,
    isAuthenticated: false,
    isLoading: true,
  });

  render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
    </MemoryRouter>,
  );

  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the focused test and verify it fails for the current bug**

Run:

```bash
npm test -- src/pages/Index.test.tsx
```

Expected: FAIL because native `/` still renders the public `WelcomeView` before authentication is checked.

- [ ] **Step 4: Implement the minimal native-root suppression and replacement**

Update the React import and add the Capacitor import at the top of `src/pages/Index.tsx`:

```tsx
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
```

Inside `AppShell`, immediately after `isLoginPreview`, derive the native root state and schedule canonical route replacement:

```tsx
const isNativeRoot = Capacitor.isNativePlatform() && location.pathname === '/';

useEffect(() => {
  if (isNativeRoot) {
    navigate('/app', { replace: true });
  }
}, [isNativeRoot, navigate]);
```

Restrict the existing public-page branch to browser root navigation:

```tsx
if (location.pathname === '/' && !isNativeRoot && !isLoginPreview) {
  return (
    <WelcomeView
      onLogin={() => navigate('/login')}
      onRegister={() => navigate('/login')}
    />
  );
}
```

Do not change the configuration, auth loader, login form, login preview, or authenticated bootstrap branches.

- [ ] **Step 5: Run the focused test and verify the native loading case passes**

Run:

```bash
npm test -- src/pages/Index.test.tsx
```

Expected: all routing tests pass, including native session discovery and the existing browser root behavior.

- [ ] **Step 6: Add native logged-out and authenticated regression cases**

Add the logged-out case with `CurrentPath` as a sibling so route replacement is also observable:

```tsx
it('shows login and replaces native root with the app route when no session exists', async () => {
  runtimeConfig.isNativePlatform = true;
  Object.assign(mockAuthState, {
    hasKnownSession: false,
    isAuthRequired: true,
    isAuthenticated: false,
    isLoading: false,
  });

  render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
      <CurrentPath />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Prihlaseni' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
  expect(await screen.findByTestId('current-path')).toHaveTextContent('/app');
});
```

Add the authenticated case:

```tsx
it('enters the authenticated bootstrap from native root without the public page', () => {
  runtimeConfig.isNativePlatform = true;
  Object.assign(mockAuthState, {
    hasKnownSession: true,
    isAuthRequired: true,
    isAuthenticated: true,
    isLoading: false,
  });

  render(
    <MemoryRouter initialEntries={['/']}>
      <AppShell />
    </MemoryRouter>,
  );

  expect(screen.getByTestId('app-data-bootstrap')).toContainElement(screen.getByText('App layout'));
  expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 7: Run routing and loading suites together**

Run:

```bash
npm test -- src/pages/Index.test.tsx src/app/providers/AppDataBootstrap.test.tsx src/components/shared/AppLoadingMark.test.tsx
```

Expected: every focused routing, bootstrap, and loading-mark test passes. The browser `/` test proves `WelcomeView` is preserved outside Capacitor.

- [ ] **Step 8: Commit the native startup routing**

```bash
git add src/pages/Index.tsx src/pages/Index.test.tsx
git commit -m "fix: open native app in auth flow"
```

### Task 2: Verify the combined loading and native-start result

**Files:**
- Verify only; no planned source changes

- [ ] **Step 1: Run TypeScript and focused lint**

```bash
npx tsc --noEmit
npx eslint src/pages/Index.tsx src/pages/Index.test.tsx src/app/providers/AppDataBootstrap.tsx src/app/providers/AppDataBootstrap.test.tsx
```

Expected: both commands exit with code 0 and no errors.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass; the verified baseline immediately before this routing change is 879 passing tests.

- [ ] **Step 3: Build with the ignored local Supabase configuration and sync iOS**

Ensure the ignored `.env.local` copied from the main workspace remains present in the isolated worktree, then run:

```bash
npm run build
npx cap sync ios
```

Expected: Vite builds successfully with Supabase configuration and Capacitor copies the current bundle into the iOS project without adding `server.url`.

- [ ] **Step 4: Build and launch on the booted simulator**

Using the existing XcodeBuildMCP defaults for project `ios/App/App.xcodeproj`, scheme `App`, and simulator `B337323A-264B-4AAC-9236-BEAAB3701659`, run `build_run_sim`.

Expected: the native app builds, installs, and launches successfully. With no stored session it opens `LoginView`; with a valid stored session it shows the loading mark and then `AppLayout`. It never opens `WelcomeView`.

- [ ] **Step 5: Verify repository state before integration**

```bash
git diff --check
git status --short
git log -7 --oneline
```

Expected: no tracked uncommitted changes; ignored `.env.local`, `dist`, native copied web assets, and dependencies do not appear in status. The design, plan, loading implementation, and native routing commits are present on the feature branch.

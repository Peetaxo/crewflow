# First Mobile Paint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary unstyled/wrong-role dashboard after sign-in with the approved animated Nodu mark, then render the correct mobile role and tab on the first application paint.

**Architecture:** Keep authentication as the source of truth. `AppShell` will hold back `AppProvider` and `AppLayout` for the complete `isLoading` interval, including the period after a session exists but before profile/role metadata resolves. A small shared inline-SVG component will render the approved mark animation. The viewport hook and App context will compute their first values synchronously so the first authenticated layout is already mobile and role-correct.

**Tech Stack:** React 18, TypeScript, CSS, Vite, Vitest, Testing Library, Capacitor iOS

---

## Task 1: Add the approved accessible loading mark

**Files:**
- Create: `src/components/shared/AppLoadingMark.tsx`
- Create: `src/components/shared/AppLoadingMark.test.tsx`
- Modify: `src/index.css`
- Modify: `src/index.css.test.ts`
- Reference: `public/nodu-mark.svg`

- [ ] Add a RED component test proving the loading view:
  - exposes `role="status"` with accessible name `Připravuji aplikaci`;
  - contains no visible loading sentence;
  - renders exactly six ray groups and one orange-dot path;
  - uses the dedicated loading-mark CSS classes.

Use this complete component test:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AppLoadingMark from './AppLoadingMark';

describe('AppLoadingMark', () => {
  it('shows only the accessible animated Nodu mark', () => {
    const { container } = render(<AppLoadingMark />);
    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByText(/načítám|připravuji/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.nodu-app-loading__ray')).toHaveLength(6);
    expect(container.querySelector('.nodu-app-loading__dot')).toBeInTheDocument();
    expect(container.querySelector('.nodu-app-loading__mark')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] Add a RED CSS contract test proving:
  - the ray transform origin is the orange dot (`887px 302px`);
  - the ray cycle scales from approximately zero to one and back to zero;
  - six small stagger delays are defined;
  - the cycle duration is `3.7s`;
  - `prefers-reduced-motion: reduce` disables animation and leaves the complete mark visible.

Add this complete test to `src/index.css.test.ts`:

```ts
it('animates the loading rays from and back into the orange dot', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const rayRule = css.match(/\.nodu-app-loading__ray\s*\{[\s\S]*?\}/)?.[0];
  const rayKeyframes = css.match(/@keyframes nodu-app-loading-ray-cycle\s*\{[\s\S]*?\n\}/)?.[0];
  const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.nodu-app-loading__ray[\s\S]*?\n\}/)?.[0];

  expect(rayRule).toContain('transform-box: view-box;');
  expect(rayRule).toContain('transform-origin: 887px 302px;');
  expect(rayRule).toContain('3.7s');
  expect(rayKeyframes).toContain('transform: scale(0.001);');
  expect(rayKeyframes).toContain('transform: scale(1);');
  expect(css).toContain('.nodu-app-loading__ray--1');
  expect(css).toContain('.nodu-app-loading__ray--6');
  expect(reducedMotion).toContain('animation: none;');
  expect(reducedMotion).toContain('transform: scale(1);');
});
```

- [ ] Run the focused RED tests:

```bash
npm test -- src/components/shared/AppLoadingMark.test.tsx src/index.css.test.ts
```

Expected: the component import/file is missing and the loading-animation CSS contract is absent; existing CSS tests remain green.

- [ ] Implement `AppLoadingMark` as a full-viewport, safe-area-aware status region with an inline SVG copied from the exact six black-ray paths and orange-dot path in `public/nodu-mark.svg`. Do not render visible copy.

Use this structure; `rayPaths` must contain the six exact `d` values from `public/nodu-mark.svg` in their existing order:

```tsx
const rayPaths = [
  'M887.188 293.598C887.188 293.598 716.633 300.313 651.723 270.768C586.813 241.223 504.238 187.952 504.238 187.952',
  'M887.191 293.598L768.115 25.0063',
  'M887.191 293.598L636.505 119.909',
  'M886.951 309.469C886.951 309.469 716.395 302.755 651.485 332.3C586.576 361.845 504 415.116 504 415.116',
  'M886.951 309.47L767.875 578.061',
  'M886.951 309.47L636.265 483.159',
] as const;

const AppLoadingMark = () => (
  <div className="nodu-app-loading" role="status" aria-label="Připravuji aplikaci">
    <svg className="nodu-app-loading__mark" viewBox="470 0 500 600" fill="none" aria-hidden="true">
      {rayPaths.map((path, index) => (
        <g key={path} className={`nodu-app-loading__ray nodu-app-loading__ray--${index + 1}`}>
          <path d={path} />
        </g>
      ))}
      <path
        className="nodu-app-loading__dot"
        d="M867.495 231.427C906.281 231.427 937.723 262.87 937.723 301.656C937.723 340.442 906.281 371.884 867.495 371.885C828.708 371.885 797.265 340.442 797.265 301.656C797.265 262.87 828.708 231.427 867.495 231.427Z"
      />
    </svg>
  </div>
);

export default AppLoadingMark;
```

- [ ] Animate each complete ray group with `transform-box: view-box` and `transform-origin: 887px 302px`. Use the approved sequence: staggered scale from `0.001` to `1`, brief hold, then scale back to `0.001`. Keep the orange dot above the ray groups and give it only a restrained pulse.

- [ ] Add a reduced-motion rule that displays the static full mark.

Use these exact CSS contracts in `src/index.css`:

```css
.nodu-app-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: calc(env(safe-area-inset-top) + 1.5rem) 1.5rem calc(env(safe-area-inset-bottom) + 1.5rem);
  background: var(--nodu-paper);
}

.nodu-app-loading__mark { width: clamp(7rem, 30vw, 10rem); height: auto; overflow: visible; }
.nodu-app-loading__ray {
  transform-box: view-box;
  transform-origin: 887px 302px;
  animation: nodu-app-loading-ray-cycle 3.7s cubic-bezier(0.22, 0.78, 0.28, 1) infinite;
}
.nodu-app-loading__ray path { fill: none; stroke: #17130f; stroke-width: 50; stroke-linecap: round; }
.nodu-app-loading__ray--1 { animation-delay: 0s; }
.nodu-app-loading__ray--2 { animation-delay: 0.08s; }
.nodu-app-loading__ray--3 { animation-delay: 0.16s; }
.nodu-app-loading__ray--4 { animation-delay: 0.24s; }
.nodu-app-loading__ray--5 { animation-delay: 0.32s; }
.nodu-app-loading__ray--6 { animation-delay: 0.4s; }
.nodu-app-loading__dot {
  fill: #ff800d;
  stroke: #c75e00;
  transform-box: fill-box;
  transform-origin: center;
  animation: nodu-app-loading-dot-pulse 3.7s ease-in-out infinite;
}
@keyframes nodu-app-loading-ray-cycle {
  0%, 8% { transform: scale(0.001); opacity: 0; }
  37%, 62% { transform: scale(1); opacity: 1; }
  94%, 100% { transform: scale(0.001); opacity: 0; }
}
@keyframes nodu-app-loading-dot-pulse {
  0%, 100% { transform: scale(0.78); opacity: 0.76; }
  16%, 76% { transform: scale(1); opacity: 1; }
  91% { transform: scale(0.84); opacity: 0.86; }
}
@media (prefers-reduced-motion: reduce) {
  .nodu-app-loading__ray { animation: none; transform: scale(1); opacity: 1; }
  .nodu-app-loading__dot { animation: none; }
}
```

- [ ] Run the focused tests again and confirm GREEN.

- [ ] Commit Task 1:

```bash
git add src/components/shared/AppLoadingMark.tsx src/components/shared/AppLoadingMark.test.tsx src/index.css src/index.css.test.ts
git commit -m "feat: add animated app loading mark"
```

## Task 2: Keep the application layout hidden until auth metadata resolves

**Files:**
- Modify: `src/pages/Index.tsx`
- Modify: `src/pages/Index.test.tsx`
- Use: `src/components/shared/AppLoadingMark.tsx`

- [ ] Add RED routing tests for `/app` proving:
  - `isLoading: true`, `hasKnownSession: true`, and `isAuthenticated: true` still render the loading mark;
  - `AppLayout` and `AppDataBootstrap` do not mount during that interval;
  - the old visible `Nacitam prihlaseni a data...` sentence is gone;
  - once `isLoading` is false, the authenticated layout renders normally.

Make bootstrap mounting observable:

```tsx
vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: () => <div data-testid="app-data-bootstrap" />,
}));
```

Add the regression test:

```tsx
it('keeps the authenticated layout hidden until profile and role loading finishes', () => {
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

  expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
  expect(screen.queryByText('App layout')).not.toBeInTheDocument();
  expect(screen.queryByTestId('app-data-bootstrap')).not.toBeInTheDocument();
  expect(screen.queryByText('Nacitam prihlaseni a data...')).not.toBeInTheDocument();
});
```

- [ ] Run the focused RED test:

```bash
npm test -- src/pages/Index.test.tsx
```

Expected: the known-session loading case incorrectly renders `App layout` instead of the loading mark.

- [ ] Replace the conditional `isLoading && !hasKnownSession` gate with a complete `isLoading` gate that returns `AppLoadingMark`. Remove the now-unused `hasKnownSession` destructuring from `AppShell` while leaving the auth-context field itself unchanged.

Use this exact branch after the existing public-welcome and missing-configuration branches:

```tsx
const { isAuthRequired, isAuthenticated, isLoading } = useAuth();

if (isLoading) {
  return <AppLoadingMark />;
}
```

- [ ] Preserve the existing precedence for the public welcome route and missing-Supabase configuration view.

- [ ] Run the focused test again and confirm GREEN.

- [ ] Commit Task 2:

```bash
git add src/pages/Index.tsx src/pages/Index.test.tsx
git commit -m "fix: wait for auth metadata before app render"
```

## Task 3: Make mobile detection correct on the first render

**Files:**
- Modify: `src/hooks/use-mobile.tsx`
- Create: `src/hooks/use-mobile.test.tsx`

- [ ] Add RED hook tests that record every rendered value and prove:
  - a `390px` viewport reports `true` on the first render, not `false` followed by `true`;
  - a wide viewport reports `false` on the first render;
  - a media-query change after mount still updates the hook.

Use this complete test harness in `src/hooks/use-mobile.test.tsx`:

```tsx
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

let mediaChangeListener: (() => void) | null = null;

function RenderHistory({ values }: { values: boolean[] }) {
  values.push(useIsMobile());
  return null;
}

describe('useIsMobile', () => {
  beforeEach(() => {
    mediaChangeListener = null;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '(max-width: 767px)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: (_event: string, listener: () => void) => { mediaChangeListener = listener; },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('reports a narrow viewport as mobile on the first render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const values: boolean[] = [];
    render(<RenderHistory values={values} />);
    expect(values[0]).toBe(true);
  });

  it('reports a wide viewport as desktop on the first render', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const values: boolean[] = [];
    render(<RenderHistory values={values} />);
    expect(values[0]).toBe(false);
  });

  it('updates after a viewport media change', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const values: boolean[] = [];
    render(<RenderHistory values={values} />);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    act(() => mediaChangeListener?.());
    expect(values.at(-1)).toBe(true);
  });
});
```

- [ ] Run the RED test:

```bash
npm test -- src/hooks/use-mobile.test.tsx
```

Expected: the narrow case records an initial desktop value.

- [ ] Introduce a small browser-safe `getIsMobile()` initializer. Pass it lazily to `useState`, reuse it in the media-query change handler, and retain listener cleanup. When `window` is unavailable, return the desktop fallback.

Replace the hook with:

```tsx
import * as React from 'react';

const MOBILE_BREAKPOINT = 768;
const getIsMobile = () => (
  typeof window === 'undefined' ? false : window.innerWidth < MOBILE_BREAKPOINT
);

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(getIsMobile());
    mql.addEventListener('change', onChange);
    setIsMobile(getIsMobile());
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
```

- [ ] Run the hook test and confirm GREEN.

- [ ] Commit Task 3:

```bash
git add src/hooks/use-mobile.tsx src/hooks/use-mobile.test.tsx
git commit -m "fix: detect mobile viewport on first render"
```

## Task 4: Initialize the first tab from the resolved role

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/context/AppContext.test.tsx`

- [ ] Add RED tests that capture the first `currentTab` render without waiting for effects and prove:
  - Crew without a persisted UI session starts on `my-shifts`;
  - CrewHead and COO start on `dashboard`;
  - a valid persisted tab still wins over the role default.

Add the render-history probe:

```tsx
function FirstTabProbe({ values }: { values: string[] }) {
  values.push(useAppContext().currentTab);
  return null;
}
```

Add the role-default tests:

```tsx
it('starts Crew on my shifts on the first render', () => {
  mockAuthState.role = 'crew';
  const values: string[] = [];
  render(<AppProvider><FirstTabProbe values={values} /></AppProvider>);
  expect(values[0]).toBe('my-shifts');
});

it.each(['crewhead', 'coo'] as const)('starts %s on dashboard on the first render', (role) => {
  mockAuthState.role = role;
  const values: string[] = [];
  render(<AppProvider><FirstTabProbe values={values} /></AppProvider>);
  expect(values[0]).toBe('dashboard');
});
```

Add the persisted-tab assertion with a complete fixture:

```tsx
it('keeps a valid persisted tab on the first render', () => {
  mockAuthState.role = 'crew';
  savePersistedUiSession({
    currentTab: 'events',
    searchQuery: '',
    timelogFilter: 'all',
    projectFilter: 'all',
    selectedContractorProfileId: null,
    selectedEventId: null,
    selectedProjectIdForStats: null,
    selectedClientIdForStats: null,
    eventTab: 'overview',
    eventsViewMode: 'list',
    eventsCalendarMode: 'month',
    eventsFilter: 'all',
    eventsCalendarDate: '',
    editingTimelog: null,
    editingReceipt: null,
    editingProject: null,
    editingClient: null,
  });
  const values: string[] = [];
  render(<AppProvider><FirstTabProbe values={values} /></AppProvider>);
  expect(values[0]).toBe('events');
});
```

- [ ] Run the RED tests:

```bash
npm test -- src/context/AppContext.test.tsx
```

Expected: Crew first renders `dashboard` before the existing effect changes it.

- [ ] Derive a single initial role (`authRole ?? 'crewhead'`) and initialize `currentTab` from `initialUiSession?.currentTab ?? NAV_BY_ROLE[initialRole][0]`. Keep the existing role-change and persisted-session normalization effects as defensive behavior.

Use these exact initializers:

```tsx
const initialRole = authRole ?? 'crewhead';
const [role, setRole] = useState<Role>(initialRole);
const [currentTab, setCurrentTabState] = useState(
  initialUiSession?.currentTab ?? NAV_BY_ROLE[initialRole][0],
);
```

- [ ] Run the context tests and confirm GREEN.

- [ ] Commit Task 4:

```bash
git add src/context/AppContext.tsx src/context/AppContext.test.tsx
git commit -m "fix: initialize navigation from auth role"
```

## Task 5: Verify the complete first-paint contract

**Files:**
- Test all files changed in Tasks 1–4.
- Do not modify Supabase schema, authentication requests, or production configuration.

- [ ] Run the complete focused regression matrix:

```bash
npm test -- \
  src/components/shared/AppLoadingMark.test.tsx \
  src/pages/Index.test.tsx \
  src/hooks/use-mobile.test.tsx \
  src/context/AppContext.test.tsx \
  src/index.css.test.ts
```

- [ ] Run static and production-build checks:

```bash
npx tsc --noEmit
npx eslint \
  src/components/shared/AppLoadingMark.tsx \
  src/components/shared/AppLoadingMark.test.tsx \
  src/pages/Index.tsx \
  src/pages/Index.test.tsx \
  src/hooks/use-mobile.tsx \
  src/hooks/use-mobile.test.tsx \
  src/context/AppContext.tsx \
  src/context/AppContext.test.tsx \
  src/index.css.test.ts
npm run build
git diff --check
```

- [ ] Review the diff for the agreed boundaries: only a real auth-loading gate, approved mark animation, synchronous viewport detection, and role-aware initial tab. Confirm there is no timeout, visible loading copy, data-query change, or deployment configuration change.

- [ ] Commit only the implementation files:

```bash
git add \
  src/components/shared/AppLoadingMark.tsx \
  src/components/shared/AppLoadingMark.test.tsx \
  src/pages/Index.tsx \
  src/pages/Index.test.tsx \
  src/hooks/use-mobile.tsx \
  src/hooks/use-mobile.test.tsx \
  src/context/AppContext.tsx \
  src/context/AppContext.test.tsx \
  src/index.css \
  src/index.css.test.ts
git commit -m "fix: render the correct first mobile paint"
```

## Task 6: Verify in iOS without deploying to production

**Files:**
- Generated Capacitor/Xcode outputs only; do not commit generated files.

- [ ] Build and sync the current web bundle into iOS using the existing local environment without printing secrets:

```bash
npm run build
npx cap sync ios
```

- [ ] Build and launch the app in the existing iPhone simulator. Confirm:
  - the loading interval shows only the animated Nodu mark;
  - no text-only or CrewHead dashboard frame appears first;
  - Crew opens directly on the correct mobile tab;
  - the approved rays grow and shrink without residual black dots;
  - normal app navigation still works after loading.

- [ ] If the physical iPhone remains connected and trusted, install the same Debug build and repeat the visual check on the real device. This is local device testing only, not a production release.

- [ ] Run `git status --short` and preserve the pre-existing untracked Xcode SwiftPM directory unless the user separately asks to clean it.

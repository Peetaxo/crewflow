# First Mobile Paint Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

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

- [ ] Add a RED CSS contract test proving:
  - the ray transform origin is the orange dot (`887px 302px`);
  - the ray cycle scales from approximately zero to one and back to zero;
  - six small stagger delays are defined;
  - the cycle duration is `3.7s`;
  - `prefers-reduced-motion: reduce` disables animation and leaves the complete mark visible.

- [ ] Run the focused RED tests:

```bash
npm test -- src/components/shared/AppLoadingMark.test.tsx src/index.css.test.ts
```

Expected: the component import/file is missing and the loading-animation CSS contract is absent; existing CSS tests remain green.

- [ ] Implement `AppLoadingMark` as a full-viewport, safe-area-aware status region with an inline SVG copied from the exact six black-ray paths and orange-dot path in `public/nodu-mark.svg`. Do not render visible copy.

- [ ] Animate each complete ray group with `transform-box: view-box` and `transform-origin: 887px 302px`. Use the approved sequence: staggered scale from `0.001` to `1`, brief hold, then scale back to `0.001`. Keep the orange dot above the ray groups and give it only a restrained pulse.

- [ ] Add a reduced-motion rule that displays the static full mark.

- [ ] Run the focused tests again and confirm GREEN.

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

- [ ] Run the focused RED test:

```bash
npm test -- src/pages/Index.test.tsx
```

Expected: the known-session loading case incorrectly renders `App layout` instead of the loading mark.

- [ ] Replace the conditional `isLoading && !hasKnownSession` gate with a complete `isLoading` gate that returns `AppLoadingMark`. Remove the now-unused `hasKnownSession` destructuring from `AppShell` while leaving the auth-context field itself unchanged.

- [ ] Preserve the existing precedence for the public welcome route and missing-Supabase configuration view.

- [ ] Run the focused test again and confirm GREEN.

## Task 3: Make mobile detection correct on the first render

**Files:**
- Modify: `src/hooks/use-mobile.tsx`
- Create: `src/hooks/use-mobile.test.tsx`

- [ ] Add RED hook tests that record every rendered value and prove:
  - a `390px` viewport reports `true` on the first render, not `false` followed by `true`;
  - a wide viewport reports `false` on the first render;
  - a media-query change after mount still updates the hook.

- [ ] Run the RED test:

```bash
npm test -- src/hooks/use-mobile.test.tsx
```

Expected: the narrow case records an initial desktop value.

- [ ] Introduce a small browser-safe `getIsMobile()` initializer. Pass it lazily to `useState`, reuse it in the media-query change handler, and retain listener cleanup. When `window` is unavailable, return the desktop fallback.

- [ ] Run the hook test and confirm GREEN.

## Task 4: Initialize the first tab from the resolved role

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/context/AppContext.test.tsx`

- [ ] Add RED tests that capture the first `currentTab` render without waiting for effects and prove:
  - Crew without a persisted UI session starts on `my-shifts`;
  - CrewHead and COO start on `dashboard`;
  - a valid persisted tab still wins over the role default.

- [ ] Run the RED tests:

```bash
npm test -- src/context/AppContext.test.tsx
```

Expected: Crew first renders `dashboard` before the existing effect changes it.

- [ ] Derive a single initial role (`authRole ?? 'crewhead'`) and initialize `currentTab` from `initialUiSession?.currentTab ?? NAV_BY_ROLE[initialRole][0]`. Keep the existing role-change and persisted-session normalization effects as defensive behavior.

- [ ] Run the context tests and confirm GREEN.

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

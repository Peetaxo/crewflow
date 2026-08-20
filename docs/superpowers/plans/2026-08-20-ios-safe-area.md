# iOS Safe Area Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the mobile Crew header and role switcher from overlapping the iPhone status bar while preserving the current visual design.

**Architecture:** Enable WebKit safe-area values through the viewport metadata. Keep the existing CSS, which already applies `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to the mobile page frame, role switcher, navigation, and modals.

**Tech Stack:** React, TypeScript, Vite, Vitest, Capacitor iOS, Xcode CLI

---

## Task 1: Lock the viewport contract with a regression test

**Files:**
- Modify: `src/index.css.test.ts`
- Read: `index.html`

- [ ] Add this focused test inside the existing `nodu CSS helpers` suite:

```ts
it('enables iOS safe-area viewport insets for the mobile shell', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const viewport = html.match(
    /<meta\s+name="viewport"\s+content="([^"]+)"\s*\/?>/,
  )?.[1];

  expect(viewport).toContain('width=device-width');
  expect(viewport).toContain('initial-scale=1.0');
  expect(viewport).toContain('viewport-fit=cover');
});
```

- [ ] Run the focused test and confirm the intended RED failure:

```bash
npm test -- src/index.css.test.ts -t "enables iOS safe-area viewport insets"
```

Expected: the test fails only because the current viewport content does not contain `viewport-fit=cover`.

## Task 2: Enable the native iOS safe area

**Files:**
- Modify: `index.html`
- Test: `src/index.css.test.ts`

- [ ] Change only the viewport declaration:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] Run the focused test and confirm GREEN:

```bash
npm test -- src/index.css.test.ts -t "enables iOS safe-area viewport insets"
```

- [ ] Run the complete CSS helper suite:

```bash
npm test -- src/index.css.test.ts
```

- [ ] Run static and build verification:

```bash
npx tsc --noEmit
npx eslint src/index.css.test.ts
npm run build
git diff --check
```

- [ ] Review the diff and confirm there is no fixed pixel padding, no redesign, and no unrelated change.

- [ ] Commit only the implementation files:

```bash
git add index.html src/index.css.test.ts
git commit -m "fix: respect ios safe areas"
```

## Task 3: Verify on the connected iPhone

**Files:**
- Generated build assets only; do not commit them.

- [ ] Build the web app with the existing local Supabase environment without copying or printing secrets:

```bash
set -a
source /Users/peetax/Projekty/crewflow/.env.local
set +a
npm run build
npx cap sync ios
```

- [ ] Build the signed iOS app for the connected device:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=00008110-000C284E2299801E' \
  -derivedDataPath /tmp/crewflow-ios-safe-area-build \
  DEVELOPMENT_TEAM=53SY44H4ZS CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
```

- [ ] Install and launch the app on `Peetax`:

```bash
xcrun devicectl device install app \
  --device 75DA6037-2430-56C9-A791-4DD552D102BA \
  /tmp/crewflow-ios-safe-area-build/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch \
  --device 75DA6037-2430-56C9-A791-4DD552D102BA \
  --terminate-existing --activate cz.nodu.app
```

- [ ] Confirm visually on the physical iPhone that the title and Crew/CH/COO switcher start below the status bar, while the rest of the dashboard layout remains unchanged.

- [ ] Remove only any generated untracked `Package.resolved` file if Capacitor/Xcode recreated it, then verify repository status.

```bash
git status --short
```

Expected: no implementation changes remain uncommitted; any pre-existing unrelated change remains untouched.

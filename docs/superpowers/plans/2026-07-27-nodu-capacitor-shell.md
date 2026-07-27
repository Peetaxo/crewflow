# nodu Capacitor Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native iOS and Android shell for the existing Vite app under the app name `nodu`.

**Architecture:** The React/Vite app remains the single source of product UI and business logic. Capacitor wraps the production `dist` build into generated native projects under `ios/` and `android/`.

**Tech Stack:** React 18, Vite 8, Capacitor, iOS/Xcode, Android Studio.

---

## File Structure

- Create `capacitor.config.ts`: Capacitor app name, app id and `dist` web directory.
- Modify `package.json`: add Capacitor dependencies and scripts for sync/open.
- Modify `package-lock.json`: generated dependency lockfile updates.
- Modify `index.html`: align document title and metadata with `nodu`.
- Create `ios/`: generated Capacitor iOS project.
- Create `android/`: generated Capacitor Android project.
- Create `docs/mobile-native-testing.md`: local testing workflow for browser, iOS Simulator, Android emulator and real devices.

### Task 1: Add Capacitor Dependencies And Config

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`

- [ ] **Step 1: Install Capacitor packages**

Run:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
```

Expected: dependencies are added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Create Capacitor config**

Create `capacitor.config.ts`:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.nodu.app',
  appName: 'nodu',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
```

- [ ] **Step 3: Add package scripts**

Add these scripts to `package.json`:

```json
"cap:sync": "npm run build && cap sync",
"cap:open:ios": "cap open ios",
"cap:open:android": "cap open android"
```

- [ ] **Step 4: Rename app metadata**

Update `index.html` so the title and social metadata use `nodu`:

```html
<title>nodu</title>
<meta name="description" content="nodu - interni aplikace pro rizeni externi crew, akci, vykazu a fakturace." />
<meta name="author" content="nodu" />
<meta property="og:title" content="nodu" />
<meta name="twitter:title" content="nodu" />
```

- [ ] **Step 5: Verify web build**

Run:

```bash
npm run build
```

Expected: Vite build exits with code 0 and writes `dist/`.

### Task 2: Generate Native iOS And Android Projects

**Files:**
- Create: `ios/`
- Create: `android/`

- [ ] **Step 1: Add iOS platform**

Run:

```bash
npx cap add ios
```

Expected: `ios/App/App.xcworkspace` exists.

- [ ] **Step 2: Add Android platform**

Run:

```bash
npx cap add android
```

Expected: `android/` contains a Gradle-based Capacitor project.

- [ ] **Step 3: Sync build output**

Run:

```bash
npx cap sync
```

Expected: Capacitor copies `dist/` into the native projects without errors.

### Task 3: Add Local Native Testing Notes

**Files:**
- Create: `docs/mobile-native-testing.md`

- [ ] **Step 1: Document the local workflow**

Create `docs/mobile-native-testing.md` with:

```md
# Mobile Native Testing

## Fast web preview

Use `npm run dev` for quick UI iteration in the browser preview.

## iPhone Simulator

Run `npm run cap:sync`, then `npm run cap:open:ios`. In Xcode select an iPhone simulator and press Run.

## Android Emulator

Run `npm run cap:sync`, then `npm run cap:open:android`. In Android Studio select an emulator and press Run.

## Real devices

Use real iPhone and Android devices before production, especially for safe-area, keyboard behavior, map rendering, login/session behavior and bottom panels.
```

- [ ] **Step 2: Verify final state**

Run:

```bash
npm run build
```

Expected: Vite build exits with code 0.

Run:

```bash
npx cap sync
```

Expected: Capacitor sync exits with code 0.

### Task 4: Commit Native Shell Setup

**Files:**
- All files modified by Tasks 1-3.

- [ ] **Step 1: Inspect status**

Run:

```bash
git status --short
```

Expected: only Capacitor shell setup files and docs are changed.

- [ ] **Step 2: Commit**

Run:

```bash
git add -A
git commit -m "feat: add nodu mobile shell"
```

Expected: commit succeeds on the current feature branch.

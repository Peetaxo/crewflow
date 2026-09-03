# Native Portrait Orientation Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamknout nativní NODU aplikaci v portrétní orientaci, aby otočení telefonu nebo tabletu nemohlo rozšířit viewport a přepnout mobilní rozhraní na desktopový shell.

**Architecture:** Zámek bude deklarovaný v nativních konfiguracích obou platforem, před spuštěním Reactu. iOS a iPadOS povolí jen vzpřímený portrét; Android Activity požádá o portrét a pro současný target API 36 použije dočasnou kompatibilní výjimku pro velké displeje. Webový breakpoint a hook `useIsMobile` se nemění.

**Tech Stack:** Capacitor 8.4.2, iOS `Info.plist`, Android manifest / SDK 36, Vitest 4.

---

## Mapa souborů

- Vytvořit `src/nativeOrientationConfig.test.ts`: statické regresní testy iOS a Android orientační konfigurace.
- Upravit `ios/App/App/Info.plist`: podporovat pouze `UIInterfaceOrientationPortrait` na iPhonu i iPadu.
- Upravit `android/app/src/main/AndroidManifest.xml`: zamknout `MainActivity` na portrét a zapnout dočasnou API 36 kompatibilitu pro velké displeje.
- Beze změny `android/variables.gradle`: test pouze ověří existující `targetSdkVersion = 36`; soubor se nemění.

## Stav provedení — 2026-09-03

Implementace je uložená v commitu `b270610` na větvi `codex/native-portrait-lock`.

- Výchozí stav: 896 testů prošlo.
- Regresní test: nejprve 3 očekávaná selhání, po změně 3 úspěšné testy.
- Celý balík: 899 testů v 96 souborech prošlo.
- Lint: bez chyb, dvě varování v nezměněném `MobileTimelogEditModal.tsx`.
- Webový build a `cap sync` prošly; synchronizace zachovala orientační zámek.
- `plutil` a XML validace Android manifestu prošly.
- Nativní iOS Simulator build prošel; sestavený `Info.plist` obsahuje pouze portrét pro iPhone i iPad.
- Android Gradle ověření je blokované: na počítači chybí Java Runtime a nebylo nalezeno Android SDK. Nástroje se bez potvrzení uživatele neinstalovaly.
- Změna zatím není začleněná do `main` ani odeslaná na remote. Instalace v simulátoru a fyzickém telefonu nebyly aktualizovány; praktická zkouška otočení zůstává neprovedená.

### Task 1: Přidat selhávající regresní test nativní orientace

**Files:**
- Create: `src/nativeOrientationConfig.test.ts`
- Read: `android/variables.gradle`
- Test: `src/nativeOrientationConfig.test.ts`

- [x] **Step 1: Vytvořit test konfigurace před změnou produkčních souborů**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const readPlistArray = (plist: string, key: string) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contents = plist.match(
    new RegExp(`<key>${escapedKey}</key>\\s*<array>([\\s\\S]*?)</array>`),
  )?.[1];

  if (!contents) {
    throw new Error(`Missing plist array: ${key}`);
  }

  return Array.from(contents.matchAll(/<string>([^<]+)<\/string>/g), (match) => match[1]);
};

const readMainActivity = (manifest: string) => {
  const activity = manifest.match(
    /<activity\b(?=[^>]*android:name="\.MainActivity")[\s\S]*?<\/activity>/,
  )?.[0];

  if (!activity) {
    throw new Error('Missing Android MainActivity declaration');
  }

  return activity;
};

describe('native portrait orientation lock', () => {
  it('supports only upright portrait on iPhone and iPad', () => {
    const plist = read('ios/App/App/Info.plist');

    expect(readPlistArray(plist, 'UISupportedInterfaceOrientations')).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
    expect(readPlistArray(plist, 'UISupportedInterfaceOrientations~ipad')).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
  });

  it('requests portrait orientation for the Android MainActivity', () => {
    const activity = readMainActivity(read('android/app/src/main/AndroidManifest.xml'));

    expect(activity).toContain('android:screenOrientation="portrait"');
  });

  it('keeps the Android 16 large-screen portrait compatibility opt-out valid', () => {
    const activity = readMainActivity(read('android/app/src/main/AndroidManifest.xml'));
    const variables = read('android/variables.gradle');

    expect(variables).toMatch(/targetSdkVersion\s*=\s*36\b/);
    expect(activity).toContain(
      'android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"',
    );
    expect(activity).toMatch(
      /android:name="android\.window\.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"\s+android:value="true"/,
    );
  });
});
```

- [x] **Step 2: Spustit zaměřený test a ověřit správné selhání**

Run:

```bash
npm test -- src/nativeOrientationConfig.test.ts
```

Expected: `FAIL` se třemi věcnými selháními — iOS pole obsahují landscape hodnoty, Android Activity nemá `screenOrientation="portrait"` a chybí vlastnost `PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`. Test nesmí selhat kvůli syntaxi nebo chybějícím souborům.

### Task 2: Zamknout orientaci v iOS a Android konfiguraci

**Files:**
- Modify: `ios/App/App/Info.plist`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Test: `src/nativeOrientationConfig.test.ts`

- [x] **Step 1: Omezit iPhone a iPad na vzpřímený portrét**

V `ios/App/App/Info.plist` nahradit obě pole orientací tímto přesným obsahem:

```xml
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
	</array>
```

- [x] **Step 2: Zamknout Android Activity na portrét**

V otevíracím tagu `MainActivity` v `android/app/src/main/AndroidManifest.xml` přidat atribut vedle ostatních atributů Activity:

```xml
android:screenOrientation="portrait"
```

- [x] **Step 3: Přidat API 36 kompatibilitu pro Android tablety**

Do `MainActivity`, před existující `<intent-filter>`, přidat:

```xml
<property
    android:name="android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY"
    android:value="true" />
```

Výsledný blok Activity musí zachovat stávající `configChanges`, `launchMode`, theme a launcher intent. Nesmí se snižovat `targetSdkVersion` ani přidávat JavaScriptový orientační plugin.

- [x] **Step 4: Spustit zaměřený test a ověřit průchod**

Run:

```bash
npm test -- src/nativeOrientationConfig.test.ts
```

Expected: `PASS`, 1 test file a 3 testy úspěšné.

- [ ] **Step 5: Ověřit syntaxi obou nativních konfigurací**

Run:

```bash
plutil -lint ios/App/App/Info.plist
./android/gradlew -p android :app:processDebugMainManifest
```

Expected: `ios/App/App/Info.plist: OK` a Gradle `BUILD SUCCESSFUL` bez chyby při slučování manifestu.

- [x] **Step 6: Commitnout test a minimální konfiguraci**

```bash
git add src/nativeOrientationConfig.test.ts ios/App/App/Info.plist android/app/src/main/AndroidManifest.xml
git commit -m "fix: lock native apps to portrait orientation"
```

### Task 3: Regresní a build ověření

**Files:**
- Verify: `src/nativeOrientationConfig.test.ts`
- Verify: `ios/App/App/Info.plist`
- Verify: `android/app/src/main/AndroidManifest.xml`

- [x] **Step 1: Spustit celý automatický testovací balík**

Run:

```bash
npm test
```

Expected: všechny test files a testy `PASS`; žádné neočekávané chyby.

- [x] **Step 2: Spustit lint**

Run:

```bash
npm run lint
```

Expected: exit code 0 bez nových lint chyb.

- [x] **Step 3: Sestavit produkční webový bundle**

Run:

```bash
npm run build
```

Expected: Vite dokončí produkční build s exit code 0.

- [x] **Step 4: Ověřit, že změna zůstala omezená na schválený rozsah**

Run:

```bash
git status --short
git diff --check HEAD^
git diff --stat HEAD^
```

Expected: commit mění jen nový regresní test, iOS plist a Android manifest; bez whitespace chyb. `src/hooks/use-mobile.tsx` ani responzivní styly nejsou změněné.

### Task 4: Aktualizovat vývojové iOS instalace po začlenění do `main`

**Files:**
- Verify: `AGENTS.md`
- Run: `scripts/ios-device-refresh.mjs`

- [ ] **Step 1: Ověřit čistý a synchronizovaný `main`**

Run:

```bash
git branch --show-current
git status --short
git rev-parse main
git rev-parse origin/main
```

Expected: větev `main`, čistý pracovní strom a shodné hashe `main` a `origin/main`.

- [ ] **Step 2: Spustit projektový refresh iOS zařízení**

Run:

```bash
npm run ios:refresh:devices
```

Expected: simulátor je sestaven, nainstalován a spuštěn. Dostupný fyzický iPhone je také aktualizován; nedostupný iPhone se oznámí samostatně jako čekající na instalaci a není blokující.

- [ ] **Step 3: Ověřit chování při otočení zařízení**

Na aktualizovaném iOS simulátoru nebo dostupném iPhonu zapnout systémové otáčení, otevřít mobilní shell NODU a otočit zařízení na šířku.

Expected: aplikace zůstane ve vzpřímeném portrétu, šířka webview nepřekročí mobilní breakpoint a neobjeví se desktopový sidebar ani jiné desktopové rozhraní.

Pokud je k dispozici Android telefon nebo tablet, zopakovat stejnou kontrolu na debug buildu. U Android tabletu musí být aplikace stále cílená na API 36 a manifest musí obsahovat kompatibilní výjimku popsanou v Task 2.

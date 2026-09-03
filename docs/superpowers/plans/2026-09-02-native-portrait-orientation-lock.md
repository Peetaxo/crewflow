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

Implementace je uložená v commitu `b270610`, začleněná do `main` a odeslaná na `origin/main` (ověřený aplikační stav `a0a6da0`). Dočasná větev `codex/native-portrait-lock` a její čistý worktree byly po začlenění odstraněny; historie změny zůstává v `main`.

- Výchozí stav: 896 testů prošlo.
- Regresní test: nejprve 3 očekávaná selhání, po změně 3 úspěšné testy.
- Celý balík: 899 testů v 96 souborech prošlo.
- Lint: bez chyb, dvě varování v nezměněném `MobileTimelogEditModal.tsx`.
- Webový build a `cap sync` prošly; synchronizace zachovala orientační zámek.
- `plutil` a XML validace Android manifestu prošly.
- Nativní iOS Simulator build prošel; sestavený `Info.plist` obsahuje pouze portrét pro iPhone i iPad.
- Po potvrzení uživatelem byly doplněny Temurin JDK 21.0.12.1 a Android SDK (Command-Line Tools 22.0, platforma API 36, Build Tools 35.0.0 a Platform Tools) do uživatelského profilu. Cesta k SDK je nastavená v ignorovaném `android/local.properties`; systémové ani shellové nastavení se neměnilo.
- Android `:app:processDebugMainManifest`, `:app:assembleDebug` a `:app:testDebugUnitTest` prošly (`BUILD SUCCESSFUL`, 1 nativní unit test bez chyb).
- Ve výsledném `app-debug.apk` bylo přes APK Analyzer potvrzeno cílení na API 36, portrétní orientace `MainActivity` a hodnota `true` pro tabletovou kompatibilní výjimku.
- Opakovaný běh celého testovacího balíku: 899 testů v 96 souborech prošlo.
- Závěrečné nezávislé review nenašlo žádné actionable findings. Po začlenění do `main` znovu prošlo všech 899 testů.
- Lint v kořenovém checkoutu zahrnul také nesouvisející vnořené worktrees a jejich build artefakty. Kontrola samotného `main` příkazem `npm run lint -- --ignore-pattern '.worktrees/**' --ignore-pattern '.claude/worktrees/**'` prošla bez chyb, se dvěma známými varováními. Konfigurace lintu ani ostatní worktrees se neměnily.
- Projektový `npm run ios:refresh:devices` byl spuštěn na čistém synchronizovaném `main`. Původní dočasná Xcode cache měla neplatné odkazy na chybějící Capacitor/Cordova artefakty; opakování s `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-ios-portrait-refresh.7ewktZ` úspěšně sestavilo, nainstalovalo a spustilo aplikaci v simulátoru iPhone 17 Pro (iOS 26.5).
- Fyzický spárovaný iPhone byl dostupný. Jeho build v projektovém skriptu narazil na chybějící `DEVELOPMENT_TEAM`. Samostatný build s existujícím lokálním vývojovým týmem předaným jen jako argument `xcodebuild` následně prošel; `devicectl` potvrdil instalaci i spuštění `cz.nodu.app`. Podepisování se neukládalo do projektu.
- Sestavený a instalovaný iOS bundle má v obou orientačních polích pouze `UIInterfaceOrientationPortrait`.
- Praktický smoke test: přes nabídku Simulator > Device > Rotate Left byl telefon otočen na šířku. NODU zůstalo ve stejném portrétním mobilním shellu se spodní navigací, bez desktopového sidebaru. Simulátor byl poté vrácen přímou volbou Orientation > Portrait. Stav systémového zámku otáčení se nepodařilo nezávisle potvrdit; úplná zkouška s výslovně vypnutým systémovým zámkem a fyzické otočení iPhonu/Androidu zůstávají ruční kontrolou.

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

- [x] **Step 5: Ověřit syntaxi obou nativních konfigurací**

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

- [x] **Step 1: Ověřit čistý a synchronizovaný `main`**

Run:

```bash
git branch --show-current
git status --short
git rev-parse main
git rev-parse origin/main
```

Expected: větev `main`, čistý pracovní strom a shodné hashe `main` a `origin/main`.

- [x] **Step 2: Spustit projektový refresh iOS zařízení**

Run:

```bash
npm run ios:refresh:devices
```

Expected: simulátor je sestaven, nainstalován a spuštěn. Dostupný fyzický iPhone je také aktualizován; nedostupný iPhone se oznámí samostatně jako čekající na instalaci a není blokující.

- [ ] **Step 3: Ověřit chování při otočení zařízení**

Na aktualizovaném iOS simulátoru nebo dostupném iPhonu zapnout systémové otáčení, otevřít mobilní shell NODU a otočit zařízení na šířku.

Expected: aplikace zůstane ve vzpřímeném portrétu, šířka webview nepřekročí mobilní breakpoint a neobjeví se desktopový sidebar ani jiné desktopové rozhraní.

Pokud je k dispozici Android telefon nebo tablet, zopakovat stejnou kontrolu na debug buildu. U Android tabletu musí být aplikace stále cílená na API 36 a manifest musí obsahovat kompatibilní výjimku popsanou v Task 2.

# Mobilní pole bez automatického přiblížení

Datum: 2026-10-12

## Příčina a oprava

Hledání v Crew mělo text 14 px. Stejně malé nebo menší písmo používají i další přímá pole a společná textarea. V iOS se při zaměření Crew hledání skutečně přiblížila stránka a ořízla její pravá strana; problém zůstal viditelný při otevřené klávesnici.

`src/index.css` nyní obsahuje společné pravidlo mimo Tailwind layers pro viewport do 1023 px nebo zařízení s libovolným dotykovým ukazatelem. Textová, číselná, datumová a časová pole, textarea, native select a editovatelné hosty dostávají `max(16px, 1rem)`. Pravidlo je účinné už před zaměřením, platí i v portálech dialogů a přebije malé utility nebo běžné inline písmo. Netextové input typy jsou vynechané. Větší kořenové písmo se respektuje, velký desktop s myší zachovává dosavadní velikosti. Viewport meta ani ruční přibližování se nemění.

WebKit při zobrazení zaměřeného prvku používá jeho font a povolené měřítko: [primární zdroj WebKit](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm). Oprava upravuje příčinu ve velikosti psacích polí, nepřidává obsluhu focus událostí nebo resetování zoomu.

## Ověření před integrací

- Výchozí CSS kontroly: 1 soubor / 5 testů, exit 0.
- Jednorázová kontrola skutečného CSS sestaveného PostCSS/Tailwindem v testovacím Chromiu: před opravou **185 nevyhovujících výsledků**, po opravě **573 kontrol / 0 chyb**, exit 0. Harness `/private/tmp/verify-mobile-form-controls.mjs`; logy `/private/tmp/mobile-form-controls-before.log` a `/private/tmp/mobile-form-controls-after.log`.
- Kontrola pokrývá různé input typy, textarea, select, contenteditable, přímá i portálová pole, malé třídy včetně important utility a inline písma, stav před/po focus a kořenové písmo 20 px. Rozměry 375, 390, 844 (na šířku), 1024 a 1280 px; dotyková zařízení i kontrolní desktop s myší. Desktopové pole zůstalo 14 px a tlačítko 12 px.
- Související Vitest kontroly CSS, Crew hledání, formuláře akce a mobilního výkazu: **4 soubory / 77 testů**, exit 0. Log `/private/tmp/mobile-form-zoom-tests.log`.
- Webový build: exit 0. Log `/private/tmp/mobile-form-zoom-build.log`. Stávající upozornění na velké chunky, stáří Browserslist a neúčinné dynamické importy zůstávají.
- `git diff --check`: exit 0.
- Po spojení s aktuálním origin/main `a2b1a77` (výběr propojených směn na kartách akcí) prošla celá sada: **157 souborů / 1 877 testů**, exit 0. Log `/private/tmp/mobile-form-zoom-merged-tests.log`.
- Společná verze prošla i webovým buildem a opakovanou kontrolou CSS (**573 kontrol / 0 chyb**). Logy `/private/tmp/mobile-form-zoom-merged-build.log` a `/private/tmp/mobile-form-controls-merged.log`.
- Nezávislá kontrola diffu vůči aktuálnímu main nenašla zásadní problém v rozsahu, cascade nebo zachování desktopu a ručního zoomu.

Chromium kontroluje skutečně vypočtené styly a jejich cascade; iOS automatické přiblížení vyžaduje samostatnou kontrolu v nativní aplikaci s klávesnicí.

## Vývojové instalace

Ověřená oprava byla začleněná a odeslaná do main jako `1504d69`. Kvůli současné práci na opravě PDF faktur ve sdíleném rollout checkoutu proběhla instalace z oddělené čisté kopie `/Users/peetax/Projekty/.crewflow-input-zoom-rollout-20261012`; rozpracované změny a neodeslané commity druhého úkolu se nepřenášely ani neměnily. Před refresh byl HEAD shodný s origin/main. Ignorovaná `.env.local` byla zachovaná.

Předepsaný `npm run ios:refresh:devices` s nezměněným preflightem a samostatným `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-input-zoom-device-refresh-20261012` skončil exit 0. Log `/private/tmp/mobile-input-zoom-device-refresh.log`.

- **Simulátor iPhone 17 Pro / iOS 26.5:** sestavení, instalace a spuštění úspěšné. Nativní kontrola hledání Crew před focus, při otevřené klávesnici a při psaní `petr` potvrdila stejné měřítko a celý pravý okraj. Stejně se ověřilo zaměření pole Jméno v dialogu nového člena; formulář se zavřel bez uložení.
- **Fyzický iPhone 13 mini:** dostupný, sestavení, podpis, instalace a spuštění úspěšné. Interaktivní kontrola klávesnice byla provedena v simulátoru; instalace na telefonu obsahuje stejný webový bundle.

Ukázka původního problému: `/Users/peetax/.codex/visualizations/2026/10/12/01a12f8f-6eab-7b83-abed-25b98572ac77/input-focus-before.png`. [Hledání s otevřenou klávesnicí po opravě](/Users/peetax/.codex/visualizations/2026/10/12/01a12f8f-6eab-7b83-abed-25b98572ac77/input-focus-after.jpg).

Lokální náhled na portu 8094 se aktualizoval stejnou odeslanou verzí. Kontrolní součty původních rozpracovaných `Info.plist`, `TimelogsView.tsx` a `TimelogsView.test.tsx` zůstaly shodné. Závěrečný commit mění pouze tento záznam ověření; aplikace zůstává totožná s nainstalovaným `1504d69`. Jde o vývojové instalace, nikoli produkční webové nasazení.

# Nativní zámek orientace na výšku

Datum: 2026-09-02
Stav: Schváleno

## Cíl

Nativní aplikace NODU zůstane při otočení zařízení v portrétní orientaci. Tím se na širokém mobilním viewportu nespustí desktopové rozhraní a nerozbije mobilní layout.

Změna platí pro iPhone, iPad, telefony Android a v aktuálně podporovaném režimu také pro Android tablety. Webová verze zůstane beze změny a bude nadále responzivní podle šířky okna.

## iOS a iPadOS

V `ios/App/App/Info.plist` bude pro `UISupportedInterfaceOrientations` i `UISupportedInterfaceOrientations~ipad` povolena pouze hodnota `UIInterfaceOrientationPortrait`.

Landscape orientace i převrácený portrét budou odstraněny. iPhone ani iPad proto neotočí rozhraní aplikace při změně polohy zařízení.

## Android

Hlavní Capacitor Activity v `android/app/src/main/AndroidManifest.xml` dostane `android:screenOrientation="portrait"`.

Projekt cílí na Android API 36. Android 16 standardně ignoruje zámek orientace na displejích s nejmenší šířkou alespoň 600 dp, proto Activity zároveň dostane dočasnou vlastnost `android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` s hodnotou `true`. Tím se pro současný target SDK zachová kompatibilní portrétní režim také na Android tabletech a velkých vnitřních displejích skládacích zařízení.

Tato výjimka je přechodná. Android ji při budoucím cílení na API 37 přestane respektovat. Zvýšení `targetSdkVersion` na 37 proto musí být podmíněno kontrolou a případnou opravou adaptivního layoutu pro landscape a velká okna. Snížení současného target SDK není součástí řešení.

Referenční omezení platformy: [App orientation, aspect ratio, and resizability](https://developer.android.com/develop/adaptive-apps/guides/app-orientation-aspect-ratio-resizability).

## Testování

Před úpravou nativních konfigurací vznikne statický regresní test, který ověří:

- obě iOS pole podporovaných orientací obsahují právě portrét,
- Android Activity požaduje portrét,
- Android Activity obsahuje kompatibilní výjimku pro velké displeje na API 36,
- projekt stále cílí na API 36, protože na této verzi závisí tabletová výjimka.

Test se nejprve spustí proti současné konfiguraci a musí selhat kvůli povoleným landscape orientacím a chybějícímu Android zámku. Potom se provedou minimální změny konfigurace a ověří se zaměřený test, celý testovací balík, lint a produkční build.

Podle projektového pracovního postupu se po začlenění změny do `main` samostatně ověří vývojová instalace na iOS simulátoru a dostupném fyzickém iPhonu. Android konfigurace se ověří buildem; ruční test konkrétního Android tabletu není podmínkou této změny, pokud zařízení není dostupné.

## Mimo rozsah

- redesign desktopového nebo mobilního rozhraní,
- oprava adaptivního landscape layoutu pro budoucí Android API 37,
- změna breakpointu, podle kterého webová aplikace vybírá mobilní a desktopové rozhraní,
- zámek orientace webové aplikace v běžném mobilním prohlížeči,
- produkční distribuce přes App Store, TestFlight nebo Google Play.

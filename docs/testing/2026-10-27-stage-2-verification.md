# Nodu — ověření etapy 2

Stav: **etapa 2 dokončená v main a živém backendu; simulátor aktualizovaný, fyzický iPhone čeká na dostupnost.**

## Oprávnění

Podrobné API scénáře a živá migrace: [záznam přístupů](2026-10-27-pilot-access.md). Oprava serveru byla nasazena a ověřena před implementací dashboardu. Přepínač není součástí ochrany a byl z UI odebraný. Všechny existující role zůstaly zachované.

## Dashboard

- Desktopový pevný text Duben 2026 je nahrazen aktuálním kalendářním měsícem a rokem. Stejné období je vidět také na mobilním management přehledu.
- Schválené hodiny zahrnují stavy approved, invoiced a paid a pouze jednotlivé dny uvnitř zobrazeného měsíce. Výkaz přes prosinec/leden nepřidá celý součet do obou měsíců; původní aritmetika hodin je zachovaná.
- Nevyřízené výkazy a souhrny práce ke schválení zůstávají napříč obdobími. Nový složitý filtr, změna query konfigurace ani přepis datové vrstvy nebyly přidány.
- 18 nových regresních případů: prosinec 2026, leden 2027, prázdný únor 2027, crew/CH/COO, mobil/desktop, různé schválené stavy a historická nevyřízená práce. Pozorované RED před opravou; **27 dashboard testů GREEN** po opravě.
- Skutečný náhled na mobilní a desktopové šířce zobrazil **říjen 2026** a odstraněné přepínače. Desktopový snímek: `/private/tmp/nodu-stage2-dashboard-desktop-20261027.png`. Náhled používá místní data, není veřejným nasazením webu.

## Automatické kontroly

- Auth/layout/sidebar: **22 testů prošlo**. Doplňující existující identity/sidebar scénáře po aktualizaci odstraněných kontrol: **7 prošlo**.
- `npm run lint`: exit 0. Dodatečný scoped ESLint pro upravené integrační a identity testy: exit 0.
- `npm run build`: exit 0, pouze dosavadní varování o velikosti balíku a dynamických importech.
- Typecheck: **108 dosavadních diagnostik**, jedna původní odpadla, **žádná nová** při porovnání normalizovaných hlaviček s čerstvým výchozím stavem 109. Typový úklid zůstává v etapě 7.
- První celkový běh při souběžném ověřování skončil časovými limity a dvěma starými očekáváními přepínače v identity testech. Ty byly aktualizované podle záměrné změny a jejich soubor znovu prošel. Konečný úplný běh `npm test -- --maxWorkers=1`: **211 souborů / 2 754 testů prošlo**, exit 0, 620,53 s.
- Nezávislé review oprávnění, klienta i dashboardu dokončené bez nevyřešeného podstatného nálezu. `git diff --check` prošel.

## Integrace a zařízení

- Aplikační commit **`6f434a769d5d0534d4f3815b5827cd2576246dec`** je začleněný do `origin/main`; zahrnuje oprávnění `d444991` a dashboard `6f434a7`. Následný evidenční commit mění pouze dokumentaci.
- Čistá samostatná kopie `/Users/peetax/Projekty/crewflow-stage2-refresh-20261027` měla před refreshem větev main, čistý stav a HEAD shodný s origin/main. Ignorovaná `.env.local` byla zachovaná. Na tomto main znovu prošlo **5 souborů / 56 cílených testů**.
- Povinný `npm run ios:refresh:devices` byl spuštěný s nezměněnými preflight kontrolami a odděleným DerivedData. **Simulátor iPhone 17 Pro / iOS 26.5: sestavení, instalace a spuštění úspěšné.** Na skutečné obrazovce nejsou přepínače rolí. Snímek: `/private/tmp/nodu-stage2-simulator-20261027.png`.
- **Fyzický Peetax iPhone 13 mini: čeká na instalaci, není aktualizovaný.** Xcode neměl odpovídající cílové zařízení. Následné `devicectl list devices` i přímý osmivteřinový probe potvrdily `unavailable`. Původní helper bohužel považuje návratový kód 0 z informací o nedostupném zařízení za dostupnost a vypíše `phone: failed`; nejde o prokázanou chybu sestavení na dostupném telefonu. Podle AGENTS.md je potvrzená nedostupnost neblokující. Pomocný skript nebyl v této etapě rozšiřovaný; před příštím refreshem počítat s tímto chováním.
- Log refreshe: `/private/tmp/nodu-stage2-ios-refresh-20261027.log`; potvrzení dostupnosti: `/private/tmp/nodu-stage2-phone-probe-20261027.log`. Vygenerované místní cesty SwiftPM byly po refreshe vrácené; čistý main opět ověřený. Původní tři rozpracované soubory hlavního checkoutu zůstaly podle SHA-256 beze změny. Samostatná aplikace nodu test a její účet zůstávají zachované.

Navazuje etapa 3 podle řídicího plánu. Skutečné pozvánky a veřejný onboarding zůstávají podmíněné dalšími etapami.

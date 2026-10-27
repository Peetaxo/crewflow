# Nodu — ověření etapy 2

Stav: změny a cílené kontroly dokončené, probíhá celková kontrola a integrace main / vývojových instalací.

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

Main, ověřený aplikační commit a samostatné výsledky simulátoru / iPhonu budou doplněné po integraci a povinném `npm run ios:refresh:devices`. Původní rozpracované tři soubory hlavního checkoutu se nepřepisují; refresh použije samostatný čistý main se zachovanou ignorovanou `.env.local`.

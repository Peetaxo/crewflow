# Správa propojených směn z Akcí — ověření

Datum: 2026-10-09. Po integraci ověřený a instalovaný commit `main`: `ecf5294d06baf7548260132af494f44f591c20aa`; poslední změna kódu aplikace je `81e2208`.

Stav: aplikace je integrovaná do synchronizovaného `main`; simulátor i párovaný iPhone byly aktualizované a spuštěné. Následný commit této závěrečné zprávy mění pouze dokumentaci a stav plánu, nikoliv instalovaný kód aplikace; jeho začlenění nevyžaduje nový nativní build.

## Implementace a automatické kontroly

- `24fa5ef`: vytváření z přehledu Akce, úprava existujícího propojení v detailu akce a osobní přehled pouze ke čtení.
- `805c76a`: zachování dialogu a výběru při skutečném obnovení query po zániku propojení nebo chybě čtení.
- `81e2208`: obnova zavřeného přehledu při změně skupiny či jejích členů, ukončení zastaralých čtení a přednost výslovného obnovení.
- Čerstvá nezávislá kontrola specifikace i kvality je uzavřená bez nevyřešených nálezů; cílený běh ověřil 29 souborů / 392 testů.

| Kontrola před integrací (`81e2208`) a po integraci (`ecf5294`) | Výsledek |
| --- | --- |
| Celá sada, jeden worker, `--configLoader=runner` | Oba běhy: 147 souborů / 1 755 testů, exit 0; 73,98 s před integrací, 80,29 s po integraci |
| Webový build s runner loaderem | Oba běhy exit 0 |
| ESLint všech 20 změněných TS/TSX souborů | Oba běhy exit 0 |
| `git diff --check` | Oba běhy exit 0 |
| `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | Oba běhy exit 2, 112 původních diagnostik |

Logy celé sady a buildu: `/private/tmp/crewflow-event-workflows-20261009-full-approved.txt` a `/private/tmp/crewflow-event-workflows-20261009-build-approved.txt`. Build hlásí dosavadní velké chunky, neúčinné dynamické importy a zastaralá Browserslist data.

Čerstvé logy ze sloučeného `main`: `/private/tmp/crewflow-event-workflows-20261009-merged-full.txt` a `/private/tmp/crewflow-event-workflows-20261009-merged-build.txt`; sestavení má stejné dosavadní kategorie varování.

TypeScript byl porovnán se skutečným výchozím výstupem `/private/tmp/crewflow-event-workflows-20261009-types-before.txt`; výstupy po změně a po integraci jsou `/private/tmp/crewflow-event-workflows-20261009-types-approved.txt` a `/private/tmp/crewflow-event-workflows-20261009-merged-types.txt`. Po odstranění pozic řádků/sloupců je celý text se soubory a zprávami totožný s výchozím stavem. Samostatné opakování stejného příkazu při kontrole dokumentace i porovnání sloučeného výstupu potvrdily stejný výsledek. Globální typecheck není zelený.

Regresní testy používají skutečné vlastníky dialogu a query publikaci: konflikt zachová výběr a vyžádá novou kontrolu; chybějící propojení či člen blokuje uložení. Chyba obnovení ponechá stejný dialog a dovolí výslovné opakování. Zavřený přehled reaguje na změnu skupiny, členů téže skupiny i odpojení; zastaralé odpovědi a změna identity se ukončují.

## Vizuální kontrola a její meze

Skutečné rozhraní běželo na izolovaném `127.0.0.1:8091` s `VITE_APP_DATA_SOURCE=local`. Tři neobsazené testovací směny a jejich propojení vznikly pouze v paměti lokálního gateway.

- Na desktopu byl ověřen vstup **Akce → Propojit směny** i při listopadovém přehledu: výběr nabídl všechny tři říjnové směny, začal prázdný a nešel uložit s méně než dvěma členy.
- Hledání podle názvu i jobnumber zachovalo označené směny. Lokálně se uložila celá sada tří členů; vytváření bylo ověřeno také jako COO.
- Mobilní dialog při 390 × 844 px se vešel do obrazovky. Detail propojené akce na mobilu i desktopu zobrazil všechny názvy, jobnumbers a data; **Upravit propojení** předvybralo všechny tři členy.
- Osobní přehled byl následně ověřen ve skutečném rozhraní na izolovaném `127.0.0.1:8092`. Runtime fixture `/private/tmp/crewflow-event-workflows-visual-20261009.mjs` dodala účet QA Crew s platným UUID, tři propojené směny QA100, aktuální přiřazení pouze k přípravám a instalaci a historický koncept také k nepřiřazené deinstalaci. Propojení všech tří se uložilo přes skutečné Akce a lokální gateway; fixture neupravila zdrojové soubory ani skutečné profily.
- V **Crew → QA Crew** zobrazily dvě přiřazené karty pouze **Společná evidence: QA instalace, QA přípravy**. Kontrola DOM potvrdila dva odstavce `<p>` bez vnoření do tlačítka. Historická karta deinstalace zůstala viditelná, ale neměla osobní souhrn; vytvoření, úprava ani zrušení propojení nebyly v detailu crew dostupné.
- Desktopový snímek ověřil zalamování souhrnu a mobilní snímky při 390 × 844 px jeho zobrazení v kartách bez nepřiřazené třetí směny. Omezení na aktuální přiřazení a neinteraktivní názvy potvrzují také testy osobních komponent a helperu s platnými UUID.
- Ve Staff se v této etapě neukládalo testovací propojení ani výkaz a neprovádělo schvalování. Celý ruční průchod společnou evidencí na obchodních datech nebyl opakován.

Ruční postup v `docs/testing/shared-shifts-acceptance-cs.md` zachovává postupné koncepty, společné odeslání a schválení, opravy a potvrzení crew, nevytvoření faktury a ukončení přístupu po změně identity.

## Integrace a vývojové instalace

| Cíl | Stav této změny |
| --- | --- |
| `main` | Čistý rollout checkout přijal větev fast-forwardem, znovu ověřil sloučený kód a úspěšně odeslal `cc4f36f..ecf5294` do `origin/main`; před instalací byl místní `main` shodný s `origin/main` na `ecf5294`. |
| Simulátor | iPhone 17 Pro / iOS 26.5, `B337323A-264B-4AAC-9236-BEAAB3701659`: nativní build, instalace a spuštění `cz.nodu.app` uspěly. Skutečné nativní rozhraní bylo vizuálně ověřené. |
| Fyzický iPhone | Párovaný iPhone 13 mini: nativní build, podpis, instalace a spuštění uspěly. Rozhraní na fyzickém telefonu nebylo vizuálně kontrolované. |

Rollout checkout: `/Users/peetax/Projekty/crewflow-shared-rollout-20261008`; jeho ignorované `.env.local` a `node_modules` jsou zachované a po refreshi zůstal čistý a synchronizovaný. Opakované porovnání hashů potvrdilo, že původní rozpracované `Info.plist`, `TimelogsView.tsx` a `TimelogsView.test.tsx` zůstaly beze změny.

Povinný `npm run ios:refresh:devices` podle `AGENTS.md` skončil exit 0 se zachovanou místní konfigurací a nezměněnými preflight kontrolami. Vite runner loader se zvolil pouze procesovým preloadem; zdroje ani konfigurace se neupravovaly. Log `/private/tmp/crewflow-event-workflows-20261009-ios-refresh.txt` dokládá oba úspěšné nativní buildy a závěr `main: ecf5294`, `simulator: updated`, `phone: updated`.

V nativním simulátoru se ověřilo **Akce → Propojit směny**: tlačítko je dostupné i při prázdném seznamu pro zvolené datum a filtr **Vše**. Dialog načetl historické Staff akce mimo rozsah seznamu, s prázdným výběrem a hledáním, vysvětlením globálního propojení a blokacemi již schvalovaných částí. Ověřila se pouze navigace, otevření a zavření dialogu bez výběru či uložení, schvalování nebo přepnutí role.

Nativní snímky: [seznam Akce](/var/folders/h5/tn4pvmkd0lg_vwzjngmxz3080000gn/T/screenshot_optimized_e651b56d-30ce-4a28-897e-10c53feea254.jpg), [dialog bez klávesnice](/var/folders/h5/tn4pvmkd0lg_vwzjngmxz3080000gn/T/screenshot_optimized_b9699450-7d8a-428e-aa85-506aa0005b06.jpg), [seznam po zavření](/var/folders/h5/tn4pvmkd0lg_vwzjngmxz3080000gn/T/screenshot_optimized_3547d2b2-0710-45db-aa8d-eabf497e680c.jpg).

Tato změna neobsahuje SQL ani novou migraci Staff, změnu závislostí, autorizace nebo převod obchodních dat. Vizuální ověření nezměnilo Staff obchodní data; celý schvalovací průchod na nich nebyl opakován. Jde pouze o vývojové instalace, nikoliv produkční nasazení.

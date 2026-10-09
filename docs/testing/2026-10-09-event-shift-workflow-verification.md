# Správa propojených směn z Akcí — ověření

Datum: 2026-10-09. Ověřený kód: `81e2208399e35dc2caad6ec2095ffa1b4d4a64e9` na větvi `codex/shared-crew-workflow-plan`.

Stav před integrací: implementace a níže uvedené kontroly jsou ověřené ve worktree. Integrace této změny do `main` a aktualizace vývojových instalací ještě neproběhly; Task 2 zatím není dokončený.

## Implementace a automatické kontroly

- `24fa5ef`: vytváření z přehledu Akce, úprava existujícího propojení v detailu akce a osobní přehled pouze ke čtení.
- `805c76a`: zachování dialogu a výběru při skutečném obnovení query po zániku propojení nebo chybě čtení.
- `81e2208`: obnova zavřeného přehledu při změně skupiny či jejích členů, ukončení zastaralých čtení a přednost výslovného obnovení.
- Čerstvá nezávislá kontrola specifikace i kvality je uzavřená bez nevyřešených nálezů; cílený běh ověřil 29 souborů / 392 testů.

| Kontrola na `81e2208` | Výsledek |
| --- | --- |
| Celá sada, jeden worker, `--configLoader=runner` | 147 souborů / 1 755 testů, exit 0, 73,98 s |
| Webový build s runner loaderem | exit 0 |
| ESLint všech 20 změněných TS/TSX souborů | exit 0 |
| `git diff --check` | exit 0 |
| `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | exit 2, 112 původních diagnostik |

Logy celé sady a buildu: `/private/tmp/crewflow-event-workflows-20261009-full-approved.txt` a `/private/tmp/crewflow-event-workflows-20261009-build-approved.txt`. Build hlásí dosavadní velké chunky, neúčinné dynamické importy a zastaralá Browserslist data.

TypeScript byl porovnán se skutečným výchozím výstupem `/private/tmp/crewflow-event-workflows-20261009-types-before.txt`; výstup po změně je `/private/tmp/crewflow-event-workflows-20261009-types-approved.txt`. Po odstranění pozic řádků/sloupců je celý text se soubory a zprávami totožný. Samostatné opakování stejného příkazu při kontrole dokumentace potvrdilo stejný výsledek. Globální typecheck není zelený.

Regresní testy používají skutečné vlastníky dialogu a query publikaci: konflikt zachová výběr a vyžádá novou kontrolu; chybějící propojení či člen blokuje uložení. Chyba obnovení ponechá stejný dialog a dovolí výslovné opakování. Zavřený přehled reaguje na změnu skupiny, členů téže skupiny i odpojení; zastaralé odpovědi a změna identity se ukončují.

## Vizuální kontrola a její meze

Skutečné rozhraní běželo na izolovaném `127.0.0.1:8091` s `VITE_APP_DATA_SOURCE=local`. Tři neobsazené testovací směny a jejich propojení vznikly pouze v paměti lokálního gateway.

- Na desktopu byl ověřen vstup **Akce → Propojit směny** i při listopadovém přehledu: výběr nabídl všechny tři říjnové směny, začal prázdný a nešel uložit s méně než dvěma členy.
- Hledání podle názvu i jobnumber zachovalo označené směny. Lokálně se uložila celá sada tří členů; vytváření bylo ověřeno také jako COO.
- Mobilní dialog při 390 × 844 px se vešel do obrazovky. Detail propojené akce na mobilu i desktopu zobrazil všechny názvy, jobnumbers a data; **Upravit propojení** předvybralo všechny tři členy.
- Kladná vizuální kontrola osobního souhrnu neproběhla: původní lokální účty crew nemají potřebná vzdálená UUID. Testy skutečných osobních komponent a helperu s platnými UUID ověřují pouze aktuální přiřazení, názvy bez ovládání a vyloučení historické nepřiřazené třetí směny.
- Ve Staff se v této etapě neukládalo testovací propojení ani výkaz a neprovádělo schvalování. Celý ruční průchod společnou evidencí na obchodních datech nebyl opakován.

Ruční postup v `docs/testing/shared-shifts-acceptance-cs.md` zachovává postupné koncepty, společné odeslání a schválení, opravy a potvrzení crew, nevytvoření faktury a ukončení přístupu po změně identity.

## Integrace a vývojové instalace

| Cíl | Stav této změny |
| --- | --- |
| `main` | Integrace, ověření sloučeného kódu a synchronizace ještě neprovedeny. Čistý rollout checkout je připravený na `cc4f36f`, shodném s `origin/main`. |
| Simulátor | Aktualizace a kontrola této změny dosud neprovedeny. |
| Fyzický iPhone | Aktualizace této změny dosud neprovedena. |

Rollout checkout: `/Users/peetax/Projekty/crewflow-shared-rollout-20261008`; jeho ignorované `.env.local` a `node_modules` jsou zachované. Původní rozpracované `Info.plist`, `TimelogsView.tsx` a `TimelogsView.test.tsx` zůstaly podle porovnání hashů beze změny.

Další povinný krok podle `AGENTS.md`: integrovat zkontrolovanou větev, znovu ověřit sloučený kód a synchronizovat `main` s `origin/main`, pak spustit `npm run ios:refresh:devices` se zachovanou místní konfigurací a nezměněnými preflight kontrolami. Výsledky simulátoru a telefonu se zapisují samostatně. Nedostupný párovaný telefon čeká na instalaci; selhání sestavení, podpisu, instalace či spuštění na dostupném zařízení blokuje dokončení.

Tato změna neobsahuje SQL ani novou migraci Staff, změnu závislostí, autorizace nebo převod obchodních dat. Předchozí instalace staršího společného výkazu nedokládají instalaci této úpravy; jde pouze o vývojové instalace, nikoliv produkční nasazení.

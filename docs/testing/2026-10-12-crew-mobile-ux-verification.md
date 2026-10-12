# Ověření mobilního seznamu a detailu Crew

Datum: 2026-10-12

## Schválený rozsah

Seznam obsahuje jméno, město, hodnocení, kontakt a poslední zaznamenanou aktivitu. Sazba a ostatní údaje jsou v detailu. Detail má pro CrewHead i COO stejné pořadí: identita/kontakt, aktuální přehled, Směny/Výkazy/Faktury, sazba/poznámka a rozbalitelné administrativní údaje a graf. Dostupné akce respektují původní oprávnění. Společné výkazy a osobní souhrn propojení zůstávají zachované.

## Automatické kontroly

- Sloučený kód `43b4556` v čistém main checkoutu `/Users/peetax/Projekty/crewflow-shared-rollout-20261008`: celá sada **151 souborů / 1 772 testů**, exit 0. Log: `/private/tmp/crew-ux-merged-tests.log`.
- Webový build s process-local runner loaderem: exit 0. Log: `/private/tmp/crew-ux-merged-build.log`.
- ESLint změněných TS/TSX souborů a `git diff --check`: exit 0.
- TypeScript má stejné normalizované diagnostiky jako výchozí stav. Porovnání `/private/tmp/crew-ux-types-before.txt` a `/private/tmp/crew-ux-merged-types.txt` je totožné po odstranění pozic řádků/sloupců. Globální typecheck není zelený; změna nepřidává nové diagnostiky.
- Nezávislá kontrola nenašla nevyřešené důležité problémy. Nalezené přetečení výkazů při 768 px se opravilo posunutím řádkového rozložení na breakpoint lg; kontrola ověřila 768 i 1024 px.

Testy pokrývají hledání bez diakritiky a podle kontaktu, přesné odlišení schvalování od oprav, bezpečný chybějící profil, dostupnost starých konceptů, oprávnění editoru, stejný přehled pro obě role, skutečné tel/mailto odkazy, prázdné faktury, ukončení čtení aktivity po změně identity a omezení sledování na skutečné přihlášené použití v popředí.

## Vizuální kontrola

Skutečné rozhraní aplikace běželo v izolovaném lokálním náhledu `127.0.0.1:8094` se syntetickými profily, směnami, výkazy a fakturami. Testovací transformace existuje pouze v `/private/tmp/crew-ux-visual.mjs`; zdrojová data ani obchodní záznamy Staff se neupravovaly.

Ověřené šířky: 375, 390, 412, 768, 1024 (nezávislá kontrola) a 1280 px. Kontrola zahrnula dlouhé jméno, e-mail a fakturační identifikátor, hledání `jiri`, nabídku úpravy profilu, přepínání záznamů, starší koncept a zachování editoru jen pro oprávněnou roli. Na mobilu i tabletu se stránka posouvá svisle bez přetečení do stran. Světlý a tmavý režim jsou čitelné. Nebyl uložen testovací profil nebo finanční rozhodnutí v obchodních datech.

Ukázky se syntetickými daty:

- [Mobilní seznam](/Users/peetax/.codex/visualizations/2026/10/12/01a12f8f-6eab-7b83-abed-25b98572ac77/crew-list-mobile.png)
- [Mobilní detail](/Users/peetax/.codex/visualizations/2026/10/12/01a12f8f-6eab-7b83-abed-25b98572ac77/crew-detail-mobile.png)

## Databázová evidence aktivity

Do konfigurací potvrzeného projektu Staff byla aplikována pouze přídavná migrace `crew_profile_activity`, verze **20261012104225**. Stejné označení má verzovaný soubor. Tabulka uchovává jeden čas na profil, bez historického backfillu. RPC bez parametrů vybere vlastní profil z `auth.uid()` a zapíše serverový čas, nejvýše jednou za minutu. Přímý klientský zápis je zakázán; RLS dovoluje managementu čtení a člověku vlastní záznam.

`supabase/verify-crew-profile-activity.sql` prošel proti Staff. Používá pouze syntetické účty/profily/role v jedné transakci s ROLLBACK; ověřil vlastní serverový čas, throttle, manager/self čtení a odmítnutí přímého zápisu, anonymního přístupu i chybějící identity. Existující účty, role a obchodní záznamy se neměnily. Supabase security advisor nehlásí nález pro novou tabulku/RPC.

Aktivita se začne sbírat až při skutečném použití nové verze přihlášeným účtem. Lokální náhled a vývojová impersonace ji nezapisují. Nezjištěný čas se zobrazuje jako „Zatím bez aktivity“; selhání načtení jako „Aktivita nedostupná“.

## Integrace a zařízení

Větev byla začleněná fast-forwardem do čistého lokálního main. Původní rozpracované `Info.plist`, `TimelogsView.tsx` a `TimelogsView.test.tsx` zůstaly podle kontrolních součtů beze změny. Ignorovaná `.env.local` zůstala zachovaná.

Po výslovném souhlasu uživatele „odešli a aktualizuj“ byl commit `642c06b` odeslaný do GitHub main. Před obnovou byl checkout čistý a HEAD shodný s origin/main. Předepsaný `npm run ios:refresh:devices` proběhl s nezměněným preflightem.

První pokus odhalil neúplnou sdílenou mezipaměť Swift Package Manageru: evidované Capacitor/Cordova XCFramework soubory chyběly. Opakování použilo existující nastavení `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crew-ux-ios-refresh-20261012` a novou samostatnou složku. Zdrojový kód, závislosti a nastavení podpisu se kvůli tomu neměnily. Druhý pokus skončil exit 0; log: `/private/tmp/crew-ux-ios-refresh-clean.log`.

- Simulátor **iPhone 17 Pro**: sestavení, instalace a spuštění nové verze úspěšné. Screenshot potvrdil běžící rozhraní aplikace.
- Fyzický **iPhone 13 mini**: zařízení bylo dostupné; sestavení, podpis, instalace a spuštění nové verze úspěšné.

Obě vývojové instalace obsahují aplikaci z `642c06b`. Následující záznam výsledků mění pouze dokumentaci. Kontrolní součty původních rozpracovaných souborů zůstaly shodné i po obnově. Úprava je dokončená včetně integrace a vývojových instalací; nejde o produkční webové nasazení.

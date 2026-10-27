# Nodu — soulad Přehledu a Výkazů crew

Datum: 27. 10. 2026. Aplikační commit: `de2daae5fd15f3bacd1ed45ec1779e5077f24efb`.

## Příčina hlášeného rozdílu

Skutečné UI simulátoru ukázalo v Přehledu Ke kontrole 3 a Schválené 4. Sekce Výkazy (nadpis Schvalování) se implicitně omezovala na poslední měsíc obsahující vlastní data, srpen 2026, a ukazovala Čeká na kontrolu 2 a Schváleno 0. Přehled zahrnoval také červnové Vyzvedávky (Řidič B), které srpnový filtr nezobrazoval. Jde o rozdílný rozsah, nikoli smazané nebo nedotažené výkazy.

Další rozdíl je ve významu skupin. Přehled slučuje pending_ch, pending_coo, pending_crew_confirmation a rejected do rozpracovaného schvalovacího procesu; finálně schválené slučuje approved, invoiced a paid. Podrobný seznam má pro každý stav samostatný filtr. Číslo 4 v záložce je počet výkazů, nikoli čtyři hodiny.

## Oprava

- Vlastní Výkazy crew začínají explicitní volbou **Všechna období**, stejně jako Přehled. Volba **Po měsících** zachovává původní měsíční filtr i šipky pro další/předchozí měsíc. Při návratu na všechna období se znovu zahrne starší práce.
- Přehled uvádí **Všechna období · počty výkazů**, širokou procesní skupinu pojmenovává **Ve zpracování** a pod záložkami vysvětluje zahrnuté stavy. Schválené výslovně zahrnují i fakturované a zaplacené výkazy.
- Měsíc se nefixuje při prvním prázdném renderu před příchodem dat. Výchozí měsíční reference vychází z načtených vlastních výkazů; ruční posun měsíce zůstává zachovaný.
- Rozsah identity, databáze, schvalovací stavy ani výpočty odměn se nemění. Management seznamy zůstávají v původním rozsahu.

## Ověření

- Výchozí cílená sada: 3 soubory / 44 testů prošlo.
- Nová společná fixture reprodukuje tři pending_ch (jeden červen, dva srpen), čtyři approved/invoiced/paid v předchozích měsících, koncept a cizí identitu. Nové testy nejprve selhaly na původním implicitním měsíci a chybějícím vysvětlení; samostatný případ zpožděného načtení také nejprve selhal.
- Konečná sada: **5 souborů / 57 testů prošlo**, včetně mobilu, desktopu, vlastnictví a měsíčního filtru. Na synchronizovaném čistém main navíc **3 soubory / 37 testů prošlo**.
- Lint a build: exit 0. Typecheck: 108 dosavadních diagnostik, žádná nová normalizovaná hlavička proti aktuálnímu výchozímu stavu. `git diff --check` prošel. Nezávislé review bez materiálního nálezu.
- Povinný `npm run ios:refresh:devices` z čistého synchronizovaného main se zachovanou ignorovanou `.env.local`: **simulátor aktualizovaný; fyzický Peetax iPhone 13 mini aktualizovaný**. Obě sestavení, instalace i spuštění prošly, celý příkaz exit 0. Telefon byl v tomto běhu připojený; dřívější čekající instalace tím odpadá.
- Skutečné zachované UI simulátoru po instalaci: **Všechna období — Vše 8, Koncepty 1, Čeká na kontrolu 3, Schváleno 4**, ostatní stavy 0. Po ruční volbě srpna: **Vše 2, Čeká na kontrolu 2, Schváleno 0**. Návrat na všechna období obnovuje plný rozsah; simulátor je ponechaný na této volbě. Důkaz: `/private/tmp/nodu-report-counts-all-periods-20261027.png`.

Privátní logy: `/private/tmp/nodu-count-consistency-final-tests-20261027.log`, `/private/tmp/nodu-count-consistency-clean-main-tests-20261027.log`, `/private/tmp/nodu-count-consistency-ios-refresh-20261027.log`.

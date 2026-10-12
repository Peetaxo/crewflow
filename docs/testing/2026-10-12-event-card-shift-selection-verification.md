# Ověření výběru karet pro propojení směn

Datum: 2026-10-12. Ověřovaný zdrojový commit: `c9942ffefc6e3b46814748da98f4d991f69264db`.

Vytváření propojení nyní používá **Akce → Propojit směny → označení běžných karet → Pokračovat → závěrečný souhrn → Propojit směny**. Výběr začíná u dneška, minulost doplňuje nad seznam po sedmi dnech a hledání prochází všechny dostupné směny. Úprava existujícího propojení v detailu zůstává v původním výběrovém dialogu.

Stav: schválený zdroj má uzavřené nezávislé kontroly specifikace a kvality, úspěšnou celou testovací sadu, build i lint a lokální webové ověření. Integrace do synchronizovaného `main`, ověření sloučeného kódu a nové vývojové instalace zatím čekají. Tento záznam nepotvrzuje instalaci změny v simulátoru ani telefonu.

## Implementace a zachované kontroly

Implementace `fb240b2` a `62fc559` odděluje časový seznam, sdílenou relaci rozpracovaného propojení, prezentaci karet a závěrečný souhrn. Opravy `d26d8f2` a `b4a0110` zachovávají autoritativní zachycené výkazy, odznaky, dostupnost a verze. Desktopová jména crew používají oddělenou klonovanou informaci pouze pro zobrazení, včetně případu prázdného pole přiřazení skutečného loaderu; nevytvářejí přiřazení ani nerozhodují o blokacích. Výslovné obnovení nahrazuje obě zachycené části společně až po úspěšném načtení.

Poslední oprava `c9942ff` dovolí po úspěšné obnově odznačit volbu, jejíž zdrojová skupina získala blokaci. Odznačení nemění uložený zdroj. Konflikt, nejasná odpověď a probíhající uložení změny stále zamykají; přidání, pokračování i uložení kontrolují celý dopad. Původní detailový editor si zachovává dosavadní chování. Nezávislá kontrola specifikace a následná kontrola kvality schválily tento stav bez zbývajících nálezů.

## Nezávislé automatické kontroly

Následující nezávislé výsledky pocházejí ze schváleného `c9942ff`.

| Kontrola | Výsledek a log |
| --- | --- |
| Celá sada s jedním workerem a `--configLoader=runner` | 153 souborů / 1 860 testů, exit 0 za 89,18 s; `/private/tmp/crewflow-card-selection-20261012-parent-approved-tests.txt` |
| Webový build s runner loaderem | Exit 0 za 1,38 s; `/private/tmp/crewflow-card-selection-20261012-parent-approved-build.txt` |
| ESLint změněných TS a TSX souborů | Exit 0, bez chyb a varování; `/private/tmp/crewflow-card-selection-20261012-parent-approved-lint.txt` |
| Skutečný `tsc -p tsconfig.app.json --noEmit` | Exit 2, 111 existujících diagnostik; `/private/tmp/crewflow-card-selection-20261012-parent-approved-types.txt` |

TypeScript má ve skutečném výchozím logu `/private/tmp/crewflow-card-selection-20261012-types-before.txt` 112 diagnostik a exit 2. Porovnání celých zpráv se zachovanými názvy souborů po odstranění pouze čísel řádků a sloupců ukazuje nulové nové diagnostiky. Odpadla jedna původní chyba typového predikátu v `EventsView.tsx`; zbylých 111 zůstává. Globální typecheck není zelený. Build stále hlásí velké chunky, neúčinné dynamické importy a zastaralá Browserslist data.

Regrese zahrnují skutečné karty, vlastníky relací a publikaci query: první načtení a jeho opakování, zachycené verze při živé změně dat, blokaci výkazu jiného člověka i zbylého člena zdroje, nedostupný vybraný člen, konflikt a chybu obnovení, nové přezkoumání dopadu, přesný požadavek po nejasné odpovědi, souběžná uložení a ukončení starých odpovědí po změně identity, detailu či záložky. Oprava posledního commitu navíc ověřuje odznačení blokovaného zdroje po úspěšné obnově a zachování zámků i kontrol pro další kroky.

## Lokální vizuální ověření

Skutečné rozhraní používalo izolované runtime podklady a lokální zdroj dat. Žádné testovací propojení ani výkaz se neukládaly do Staff; neprovádělo se schvalování ani zápisy faktur.

- Mobilní viewport 390 × 844 px ověřil vytvoření jako CH i COO; Crew nemá vstup do správy. Výchozí rozsah začal 5. 10. s kotvou 12. 10.; marker dneška byl na 235 px pod toolbarem končícím na 223 px, bez rozbalení celé historie. Výběrová lišta 693,2–756 px nepřekrývala navigaci 764–832 px a nevzniklo vodorovné přetečení. Testovací přepínač role zůstal na svém místě. Skutečná nativní klávesnice zatím nebyla ověřená.
- Desktop 1280 × 720 px zachoval jména crew jako neinteraktivní text i se skutečným loaderem. Marker kotvy byl na 141 px pod toolbarem končícím na 129 px. Zrušení po dočasném hledání `HIST001` obnovilo běžný kalendář září 2026, původní globální hledání `QA` a posun kořene 0 px.
- Globální hledání `HIST001` našlo únorovou směnu Žlutá ze dne 1. 2. Souhrn obsahoval oba vybrané identifikátory i po jejich skrytí. Čtyři kopie vícedenní směny a jedna karta příprav měly všechna označení, ale počet byl správně 2. V kartách nebyla vnořená tlačítka; klepnutí, Enter a mezerník pouze přepínaly označení.
- Při zadání hledání přes nativní přístupnost webového rozhraní se původní posun přesně obnovil: 464 px → hledání 0 px → vymazání 464 px. Datum uchovalo počet 2 a návrat ze souhrnu zachoval hledání i pozici.
- Při skutečném posunu o 40 px nahoru měla karta 4. 10. původně horní hranu 190,5 px při posunu kořene 386 px a poté 230,5 px při posunu 599 px. Vložených 253 px bylo vykompenzováno přesně; rozdíl 40 px odpovídal pohybu uživatele. Historie překročila prázdnou mezeru změnou začátku 14. 9. → 26. 1.
- Lokální podklady obsahující jen historii začaly rozsahem od 5. 10., bez karet v počátečním záběru a s markerem dneška na 235 px. Posun nahoru zpřístupnil 4. 10., 20. 9. a následně 1. 2.; otevření nezpůsobilo automatický řetězec rozšiřování. Skok na 10. 10. bez přesné karty ukázal kompaktní kotvu a následující kartu 11. 10. na 319,5 px.
- Přes skutečné rozhraní se úspěšně uložily dvě lokální skupiny. Přesun ze zdroje a různé jobnumber vyžadovaly samostatná potvrzení; pokus bez nich uložení zablokoval. Dosavadní editor v detailu ponechal všechny tři původně vybrané členy a byl zavřen bez změny propojení.

Snímky: [mobilní výběr](/private/tmp/crewflow-card-selection-mobile-verified-20261012.jpg), [desktopový výběr](/private/tmp/crewflow-card-selection-desktop-verified-20261012.jpg), [úplný souhrn](/private/tmp/crewflow-card-selection-summary-verified-20261012.jpg).

Ruční postup [Propojené směny](shared-shifts-acceptance-cs.md) zachovává dvě částečně překrývající se osobní evidence, společného schvalovatele, rozpracované části, celé schvalovací kolo, opravy a potvrzení crew, historii, osobní přehled pouze ke čtení a nevytvoření faktury. Celý schvalovací průchod se v této změně ručně neopakoval.

## Integrace a vývojové instalace

| Cíl | Stav této změny |
| --- | --- |
| `main` | Integrace do čistého rollout checkoutu, ověření sloučeného kódu, odeslání a synchronizace zatím čekají. |
| Simulátor | Nový `npm run ios:refresh:devices`, instalace, spuštění a kontrola skutečného nativního rozhraní včetně klávesnice zatím čekají. |
| Fyzický iPhone | Výsledek nativního buildu, podpisu, instalace a spuštění zatím není zaznamenaný. |

Rollout použije `/Users/peetax/Projekty/crewflow-shared-rollout-20261008` se zachovanou ignorovanou `.env.local`, závislostmi, stávajícím vývojovým týmem a nezměněnými preflight kontrolami. Ověření hashů původních rozpracovaných `Info.plist`, `TimelogsView.tsx` a `TimelogsView.test.tsx` patří k závěrečné integraci. Samostatné výsledky simulátoru a fyzického telefonu i instalovaný commit budou doplněny až po skutečném refreshi.

Změna neobsahuje SQL, migraci, novou autorizaci, změnu gateway či závislostí, převod Staff dat ani novou fakturační funkci. Požadované instalace jsou vývojové, nikoliv produkční nasazení.

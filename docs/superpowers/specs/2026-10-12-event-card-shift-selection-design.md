# Výběr karet akcí pro propojení směn

Propojení směn se bude vytvářet označením existujících karet přímo v sekci Akce. Výběr začne dneškem a při posouvání směrem k horní části seznamu postupně nabídne starší směny po týdnech. Samostatný dialog bude sloužit až ke kontrole a potvrzení nového propojení.

Uživatel 12. října 2026 odsouhlasil tento způsob výběru, chronologické pořadí a doplňování minulosti po týdnech. Podrobný návrh předchází implementaci; aplikace toto chování zatím nemá.

## Rozsah změny

Nový výběrový režim nahrazuje výběr v dialogu po stisknutí **Akce → Propojit směny**. Je dostupný pro CH a COO na mobilu i desktopu. V kalendářovém pohledu přejde do seznamu karet; po ukončení obnoví původní pohled.

Správa existujícího propojení z detailu akce zůstává v dosavadním editoru. Detail crew zůstává pouze osobním informačním přehledem. Běžné prohlížení Akcí, evidence hodin, schvalování, faktury a testovací přepínač rolí se nemění.

## Vstup do výběru

1. **Propojit směny** načte aktuální podklady a teprve po úspěšném načtení aktivuje výběr. Při chybě lze načtení zopakovat; neúplné podklady nepovolí pokračování.
2. Nový výběr je prázdný. Seznam začne u dnešních a nadcházejících směn a zahrne i vícedenní směny, které dnes probíhají. Dnešek se určí podle stejného místního kalendářního dne jako v přehledu Akce.
3. V horní části se objeví hledání **Hledat směnu nebo jobnumber** a ovládání data. U karet se zobrazí zaškrtávací kolečko.
4. Klepnutí na kartu nebo ovládání klávesnicí přepne její označení, neotevře detail. Označené karty dostanou zřetelný rámeček a zaškrtnutí. Vnořené akce jako mazání a přechod do detailu crew se ve výběrovém režimu neprovádějí.
5. Pevná spodní lišta zobrazí **Vybráno: N**, **Pokračovat** a **Zrušit**. Nesmí překrýt poslední kartu, spodní navigaci ani ovládání při otevřené klávesnici. Pokračovat je dostupné až od dvou různých vybraných směn a při platných podkladech.

Propojení nadále platí pro všechny skutečně přiřazené lidi. Každý člen crew eviduje jen své směny; označení karet nevytváří nové přiřazení ani fakturu.

## Pořadí a postupné zobrazování minulosti

Karty zůstanou chronologicky od nejstarších nahoře k nejnovějším dole. Výchozí pozice je u dneška, nikoliv na začátku celé historie. Nad dneškem je v seznamu místo pro postupně doplňované starší rozsahy; pod ním jsou dnešní a budoucí směny.

Nejbližší historickou dávku lze připravit nad výchozí pozicí, aby šlo hned posunout seznam ke starším kartám. Vstupní záběr přesto zůstane u dneška. Samotné otevření režimu nesmí automaticky rozbalit celou historii; další dávky navazují na pohyb uživatele do minulosti.

Při pohybu k hornímu okraji se přidá předcházejících sedm kalendářních dnů. Pokud je výchozím dnem 12. 10., první dávka pokrývá 5.–11. 10.: nejblíž dnešku je 11. 10., nad ním 10. 10. a dále starší dny. Další dávka pokrývá 28. 9.–4. 10. Týden zde znamená sedm dnů před dosud zobrazenou hranicí, ne pevný kalendářní týden od pondělí.

Doplnění karet zachová na obrazovce stejnou dosud viditelnou kartu a její polohu. Seznam neskočí na začátek nově přidaného týdne. Opakované události posouvání nesmějí současně přidat tutéž dávku vícekrát. Dny bez směn nevytvářejí prázdné karty; prázdný týden neznamená konec historie ani nesmí znemožnit dosažení dalších starších směn. Rozšiřování skončí po dosažení nejstarších dostupných podkladů.

Postupně se rozšiřuje zobrazovaný rozsah nad stávajícími dostupnými daty. Nové databázové stránkování, API ani načítání celé jiné sady obchodních dat není součástí změny.

## Datum a vyhledávání

Výběr data přesune přehled k danému dni a nastaví novou hranici, od níž lze pokračovat dále do minulosti po týdnech. Při dni bez směn se ukáže nejbližší následující dostupná karta nebo srozumitelný prázdný stav. Návrat na dnešek je možný přes stejné ovládání data.

Hledání podle názvu či jobnumber prohledá všechny směny dostupné správci v načtených podkladech, včetně minulosti mimo rozšířený rozsah. Při aktivním hledání se výsledky řadí chronologicky bez omezení zvoleným datem a historickou hranicí. Vymazání hledání obnoví předchozí časový rozsah a polohu seznamu. Prázdný výsledek hledání není zpráva o konci historie.

Vybrané identifikátory jsou nezávislé na vykreslených kartách. Posouvání, datum ani hledání výběr nemažou. Spodní lišta počítá i vybrané směny mimo aktuální výsledky; závěrečný souhrn je vždy vypíše všechny.

Vícedenní směna může mít více karet v různých dnech, ale používá jediný identifikátor a počítá se pouze jednou. Její označení i odznačení se promítne do všech jejích zobrazených karet. Stejný jobnumber neznamená stejnou směnu a nezpůsobuje automatické propojení.

## Kontrola a potvrzení

**Pokračovat** otevře souhrn všech vybraných směn s názvem, jobnumber a datem. Souhrn nenabízí druhý výběrový seznam; **Zpět k výběru** vrátí označené karty i dosavadní hledání, datum a pozici. Uložení nastane až po výslovném potvrzení **Propojit směny**.

Souhrn zachová dosavadní popis dopadu: přesun z jiného propojení a zbytek původní skupiny, případné zrušení prázdné původní skupiny a kombinaci různých projektů či jobnumber. Přesuny a různé projekty nadále vyžadují samostatná výslovná potvrzení. Změna výběru tato potvrzení zneplatní.

Směny, jejichž přidání blokuje již zahájené schvalování, historie kol, vazba na fakturu nebo některá další dotčená část skupiny, zůstanou viditelné s důvodem a nepůjdou označit. Kontrola se netýká jen vybraného člověka ani právě zobrazených karet; zahrnuje všechny dotčené výkazy a členy původních skupin. Chybějící nebo nově nedostupná vybraná směna se nesmí potichu odznačit a blokuje potvrzení.

## Bezpečnost rozpracovaného výběru

Výběr a souhrn sdílejí jeden zachycený podklad a jeho verze. Běžná publikace nových dat v přehledu jej nepřepíše. Konflikt vyžaduje výslovné obnovení podkladů, zachování výběru a opětovnou kontrolu; chyba obnovení nechá možnost zopakovat načtení a neumožní uložit neúplná data.

Nejasná odpověď na uložení zachová přesně stejný požadavek pro ověření nebo opakování. Neumožní mezitím měnit výběr a odeslat jiný požadavek. Platí dosavadní upozornění, že zavření nevrátí případné již provedené uložení. Probíhající uložení se nedá přerušit zavřením.

**Zrušit**, opuštění Akcí nebo skutečná změna identity, role či zdroje dat ukončí rozpracovaný režim bez automatického uložení. Zpožděné odpovědi nesmějí znovu otevřít výběr ani zasáhnout do nového účtu. Zpět ze souhrnu, změna data, hledání a rozšíření historie naopak tentýž režim zachovávají.

Po zrušení nebo úspěšném dokončení se obnoví původní běžný pohled Akce s jeho filtrem, datem, hledáním a pozicí. Ve výběru se původní filtr přehledu nepoužívá jako omezení dostupných směn. Role crew nemá výběrový režim ani ovládání správy.

## Oddělení odpovědností

Časový rozsah, hledání a ukotvení posouvání patří do samostatné logiky přehledu karet. Zachycené podklady, vybrané identifikátory, dopad a stav uložení patří do jediné relace propojení sdílené výběrem a souhrnem. Karta přijímá stav označení a dostupnosti; sama neukládá propojení.

Implementace využije stávající načítání správy, výpočet dopadu, tvorbu atomického požadavku a obsluhu konfliktů. Sdílené potvrzovací chování se nesmí rozcházet mezi novým souhrnem a dosavadním editorem v detailu akce. Z rozsáhlého `EventsView` se vyčlení jen potřebné části prezentace karet a výběru; nesouvisející přepracování přehledu není součástí zadání.

Tabulky, serverové kontroly, oprávnění, závislosti a fakturační proces se nemění. Není potřeba migrace, převod stávajících propojení ani úprava dat Staff.

## Ověření před dokončením

- Nový režim začne dneškem a prázdným výběrem; probíhající vícedenní směna se neztratí. Chyba prvního načtení neotevře neúplný výběr.
- Historie se doplňuje po sedmi dnech správným směrem, bez poskočení, duplicit nebo uvíznutí na prázdném týdnu. Datum umožní přímý skok.
- Označení karty nenaviguje ani neprovede vnořenou akci. Vícedenní zobrazení se označí společně a počítá jako jedna směna. Výběr je dostupný klávesnicí.
- Hledání najde i starší směnu mimo zobrazený rozsah. Datum, hledání a návrat ze souhrnu uchovají všechna označení; souhrn zahrne i skryté vybrané směny.
- Méně než dvě různé směny nelze propojit. Blokace, přesuny mezi skupinami a různé projekty používají dosavadní kontroly a potvrzení.
- Konflikt, chyba obnovení, nejasná odpověď a změna identity mají testy skutečného životního cyklu. Staré asynchronní odpovědi nemění nový režim.
- Běžný přehled se po ukončení obnoví. Editace existujícího propojení a osobní přehled crew nadále fungují beze změny.
- Mobilní i desktopové rozhraní se vizuálně ověří včetně klávesnice, spodní lišty, posouvání a obnovy pozice. Testovací data vzniknou jen v izolovaném lokálním prostředí, ne ukládáním testovacích propojení do Staff.
- Proběhnou cílené a regresní testy, webový build a kontrola změněných souborů. Ověřená aplikace se začlení do čistého synchronizovaného `main` a aktualizuje přes `npm run ios:refresh:devices` podle `AGENTS.md`; výsledek simulátoru a fyzického iPhonu se ověří a uvede odděleně.

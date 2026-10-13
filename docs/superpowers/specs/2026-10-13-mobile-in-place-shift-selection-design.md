# Mobilní výběr propojených směn ve stávajícím přehledu

Propojení na mobilu pouze zapne označování karet v sekci Akce. Zachová zvolené datum, filtr a viditelné směny. Nevytvoří další obrazovku ani nepřesune seznam na dnešek. Uživatel zvolil variantu s plovoucí spodní lištou a potvrdil, že výška aplikace musí zůstat daná displejem.

Tento návrh pro mobil nahrazuje vstup a ovládání popsané v návrhu `2026-10-12-event-card-shift-selection-design.md`. Desktopový výběr, úprava existujícího propojení a obchodní pravidla zůstávají beze změny.

## Ovládání v sekci Akce

Mobilní záhlaví má vlevo stávající tlačítko pro výběr data, uprostřed nadpis Akce a vpravo stejně velké ikonové tlačítko Propojit směny. Správa je dostupná jen CH a COO. Crew nedostane nové oprávnění ani tlačítko propojení; jeho stávající filtr zůstane dostupný.

Na mobilu se odstraní přepínač Seznam a Kalendář i kalendářový pohled. Ikona kalendáře pro výběr data zůstane. Desktopový kalendář se nemění. Dříve uložená preference kalendářového pohledu nesmí na mobilu tento pohled znovu otevřít.

Stisknutí Propojit směny zobrazí jediné vyhledávací pole pod Nadcházející, Uplynulé a Vše, označovací kolečka na kartách a spodní lištu. Nepřidá nadpis Propojit směny, vysvětlující odstavec, další pole pro datum ani hlášku Načítání propojení. Hledání se samo nezaměří, aby bez výslovného klepnutí nevyskočila klávesnice.

## Datum a zachování seznamu

Výběr převezme datum, filtr, případné hledání a pozici aktuálního přehledu. Například po výběru 12. května zůstanou při zapnutí označování stejné karty z tohoto přehledu. Otevření nezmění globální preference ani samo nerozbalí historii do viditelného záběru.

Přidání vyhledávání smí zabrat místo v horní části, ale nesmí odstranit seznam, přehrát jeho vstupní animaci nebo jej posunout na nesouvisející datum. Dosud viditelná karta zůstane ukotvená ve viditelné části pod ovládáním. Tento princip platí i při dokončení čtení na pozadí a při doplnění starších karet.

V rozpracovaném výběru lze použít stejné tlačítko data a stejné filtry. Tyto změny upravují jen pohled na rozpracovaný výběr. Zrušení nebo úspěšné dokončení vrátí původní běžný přehled s jeho datem, filtrem, hledáním a pozicí.

Dosavadní historie po sedmidenních dávkách směrem nad zvolené datum zůstává dostupná ve výběru. Hledání názvu nebo jobnumber zahrnuje i starší dostupné směny mimo rozšířený časový rozsah; zvolený stavový filtr zůstává účinný. Vymazání hledání obnoví časový rozsah a pozici před hledáním. Směny bez výsledku používají běžný prázdný stav, ne další vysvětlující panel.

## Výběr a plovoucí lišta

Klepnutí na kartu nebo její aktivace klávesnicí přepne označení, neotevře detail ani neprovede vnořenou akci. Výběr začíná prázdný. Označená karta má zaškrtnuté kolečko a zřetelný rámeček. Vícedenní kopie sdílejí označení a počítají se jako jediná směna.

Plovoucí lišta obsahuje Vybráno, Zrušit a Pokračovat. Bez klávesnice leží nad spodní navigací a bezpečnou oblastí displeje; při psaní nad klávesnicí včetně jejího ovládacího pruhu. Obsah má dostatečný spodní odstup, aby se poslední karta dala celá posunout nad lištu. Lišta nezvětšuje výšku aplikace a nezakrývá systémové ovládání. Záhlaví a hledání nesmějí při psaní a posouvání sklouznout pod výřez displeje.

Datum, hledání, posouvání a návrat ze souhrnu nemažou označení. Počet zahrnuje i skryté vybrané směny. Pokračovat otevře dosavadní souhrn všech vybraných směn; uložení nastane až po jeho výslovném potvrzení. Potřebuje alespoň dvě různé směny a úplné platné podklady.

## Okamžité otevření a bezpečné podklady

Zobrazení výběru nečeká na úplné načtení podkladů pro propojení. Karty pocházejí ze stávajícího přehledu, označení vlastní samostatná relace výběru. Úplné podklady se mohou připravovat na pozadí v aktuálním přihlášeném kontextu; při otevření se ověří jejich aktuálnost.

Dokud není aktuální čtení dokončené, lze předběžně označovat dostupné karty a zrušit výběr, ale nelze pokračovat k potvrzení ani ukládat. Načtení nepřepíše seznam, datum, pozici ani označení. Vybraná směna, která se při ověření ukáže jako blokovaná nebo nedostupná, se nesmí potichu odznačit; zobrazí se důvod a pokračování zůstane zakázané. Po ověření se již známé blokované karty nedají nově označit.

Chyba čtení zobrazí srozumitelné upozornění a možnost opakovat ověření, nikoliv prázdnou obrazovku. Opakování zachová výběr a nepovolí uložení neúplných podkladů. Po zachycení úplných podkladů používají výběr i souhrn jejich stejnou verzi až do výslovného obnovení při konfliktu. Pozdější běžná aktualizace přehledu je nepřepíše.

Kontroly zahájeného schvalování, historie kol, faktur, všech dotčených lidí a zbytků původních propojení zůstávají platné. Přesuny mezi propojeními a různé projekty či jobnumber stále vyžadují dosavadní samostatná potvrzení. Nejasný výsledek uložení zachová neměnný požadavek a dosavadní postup ověření nebo opakování.

Změna identity, oprávnění nebo zdroje dat a opuštění Akcí ukončí relaci bez automatického uložení. Zrušení během čtení zneplatní jeho pozdní odpověď. Staré odpovědi nesmějí znovu otevřít výběr ani zasáhnout do jiné relace. Probíhající uložení a nejasná odpověď mají dosavadní ochrany před zavřením či změnou požadavku.

## Oddělení odpovědností a rozsah

Mobilní přehled vlastní záhlaví, datum, filtry a vykreslení karet. Relace propojení vlastní předběžný výběr, stav čtení, zachycené úplné podklady, souhrn a uložení. Logika časového rozsahu a ukotvení posouvání zůstane samostatná. Mobilní režim nesmí vzniknout nahrazením celého přehledu komponentou s novým výchozím datem.

Implementace znovu použije stávající výpočet dopadu, tvorbu atomického požadavku, souhrn a ochrany konfliktů. Úpravy se omezí na potřebné propojení prezentace a stavu. Databáze, oprávnění, závislosti, fakturační proces, evidence, schvalování a testovací přepínač rolí se nemění. Změna nezakládá migraci ani testovací zápisy do Staff.

## Ověření před dokončením

- Zapnutí na zvoleném datu zachová karty, filtr a viditelnou pozici, přidá jen dohodnuté ovládání a samo neotevře klávesnici.
- Pomalé čtení neblokuje označování; blokuje pokračování a uložení. Úspěch, chyba, opakování, zrušení a pozdní odpověď zachovají bezpečný stav bez mizení karet.
- Historie, hledání, vícedenní karty, souhrn a návrat zachovají označení. Změna účtu nebo role nepropustí starý výběr.
- Mobil má jen seznam pro všechny role, stávající výběr data funguje a desktopový kalendář i editor existujícího propojení projdou regresní kontrolou.
- Na skutečném simulátoru se ověří pevná výška aplikace, spodní lišta, poslední karta, klávesnice, posouvání a bezpečné oblasti. Natahovací ukázka není důkaz správného chování aplikace.
- Po cílených a regresních testech, buildu a kontrole změněných souborů se ověřená aplikace začlení do čistého synchronizovaného main. Podle AGENTS.md následuje `npm run ios:refresh:devices`; výsledek simulátoru a fyzického iPhonu se uvede odděleně.

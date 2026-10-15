# Průběžné ověření fakturace crew

Stav k 15. 10. 2026: rozpracováno. Tento záznam nerozhlašuje dokončení funkce, nasazení ani celý uživatelský průchod. Před dokončením se doplní výsledky z konečného zdroje.

## Schválený rozsah

Jeden úplný výkaz pracovníka za jednu akci, včetně několika denních řádků, tvoří jeden podklad. Konečný výkaz schvaluje COO. Vlastní nahrané PDF přijímá nebo vrací **CH**. Pracovník může místo nahrání výslovně potvrdit self-billing jednotlivé faktury; volitelný trvalý souhlas v nastavení platí pouze pro budoucí úplná schválení. Odběratelem je koncový klient projektu. Podklady čekající na rozhodnutí jsou oddělené od skutečných faktur.

## Dosavadní důkazy

| Oblast | Ověřeno | Zbývá |
| --- | --- | --- |
| Databázová pravidla | Obě nezávislé kontroly prošly na `7238ab7`; 237 kontrol fakturace, skutečné souběhy klientů, zachování historických záznamů a kontrola oprávnění. | Opakovat relevantní souhrn nad konečným zdrojem. |
| Nahrané dokumenty a PDF | Lokální Auth/Storage/Edge průchod pro návrat, opravenou verzi, přijetí CH, přesnou identitu originálu a opakování PDF stejné faktury. Skutečný plánovaný běh skončil HTTP 200 bez otevřené aplikace. 40 soustředěných testů. Oprava úklidu `fb3cdb2` prošla skutečným přerušením souběžných požadavků a přesnou obnovou 20 zachycených úloh. Nezávislé kontroly specifikace i kvality prošly na `fb3cdb2`; znovu prošly také dva skutečné testy rendereru, typy tří serverových vstupů a kontrola kódu. | Závěrečné ověření nad integrovaným zdrojem. |
| Vzhled PDF | Vizuálně zkontrolováno všech pět stran čtyř ukázkových dokumentů a skutečné PDF vytvořené workerem. Pokryté dlouhé české identity, stránkování, stravné a 8 h 20 min za 2 083,33 Kč. | Závěrečná kontrola, pokud se generátor ještě změní. |
| Obrazovky, souhlasy a schvalovací náhled | Připravené požadavky a přesný ověřený serverový kontrakt. | Implementace a nezávislé kontroly. |
| Celý uživatelský průchod | Dosavadní důkazy jsou databázové, API a PDF. | Skutečné ovládání celé aplikace oddělenými účty a důkaz z druhé relace/zařízení. |
| Nasazení a zařízení | Pouze čtení konfigurace Staff, bez změny obchodních dat nebo serveru. | Integrace aktuální hlavní větve, závěrečné testy, zveřejnění, server a vývojové instalace simulátoru a iPhonu. |

Základ před změnou prošel 158 soubory / 1 924 testy. To není výsledek konečné implementace. Široký existující dluh aplikační kontroly typů je veden odděleně; kontrola pouze kořenového referenčního projektu není důkazem čistých typů aplikace.

Po spojení současné hlavní větve `94f9092` se serverovou částí na `ac4d014` prošlo 167 souborů / 2 132 testů, kontrola kódu i webové sestavení. Dvě původní časové chyby při souběhu celé sady se sestavením a kontrolou kódu se nepotvrdily samostatně (99/99) ani v kompletním běhu se čtyřmi pracovními procesy. Kontroly, zdroj ani časové limity se kvůli tomu neměnily. Jeden proces se v omezeném prostředí zastavil před spuštěním testů; stejný příkaz mimo toto omezení prošel. Toto je ověřený základ před obrazovkami fakturace, nikoli závěrečný výsledek celé funkce.

Podrobné lokální výsledky jsou mimo Git v `/private/tmp/crewflow-invoice-workflow-20261013/`. Skutečné běhy dokumentů jsou v `/private/tmp/crewflow-demo-20261012/results/invoice-billing/`; obsahují výhradně označené fiktivní podklady. Soukromé přihlašovací údaje, lease tokeny a celé snímky testovacích úloh se nezveřejňují.

## Oddělená omezení a opravené testovací incidenty

Při prvním testu dokumentů se dočasně odložilo 19 starších fiktivních úloh bez úplně uložených původních časů. Jeden čas se podařilo přesně obnovit; zbývajících 18 bylo vědomě znovu naplánováno na `2026-10-15T06:32:23.247452Z` a tři staré běžící lease vypršely. Nejde o přesné obnovení ztracených historických časů. Atomická obnova a porovnání chráněných dat potvrzují nezměněné faktury, dokumenty, výkazy, částky a ostatní pole úloh. Opravený pomocný test před změnou trvale ukládá přesný snímek a před obnovou vyžaduje potvrzené dokončení přímých i naplánovaných HTTP požadavků. Skutečné přerušení s čekajícím i běžícím požadavkem a pozdě spuštěným příkazem plánovače prošlo; po důkazu nezůstal testovací plánovač, požadavek ve frontě ani pomocný záznam sledování.

Lokální databázový obraz PostgreSQL `17.6.1.106` padá při odmítnutém volání staré soukromé funkce v diagnostickém hooku `supautils`. Identický test i celý nezměněný společný regresní test projdou, pokud pouze dané administrátorské spojení nenačte tento hook; oprávnění, RLS, kontroly a trvalé nastavení zůstaly zachované. Výchozí lokální běh zůstává známým omezením, nikoli úspěšným testem. Souvislost popisují [supabase/postgres#2112](https://github.com/supabase/postgres/issues/2112) a [supabase/supautils#214](https://github.com/supabase/supautils/issues/214). Čtení nastavení Staff ukázalo, že role Data API načítá `safeupdate`, nikoli uvedený session hook; je to porovnání konfigurace, nikoli provedený živý test odmítnutého přístupu. Na Staff nebyl odeslán pokus o pád ani vytvořena testovací faktura.

Připojení k existující lokální záložce dema odmítla bezpečnostní politika ovládání prohlížeče. Omezení se neobchází jiným prohlížečem nebo WebView. Živý uživatelský průchod zatím není provedený a automatizované API testy ho v tomto záznamu nenahrazují.

# Fakturace po schválení konečného výkazu

Datum: 2026-10-13

Produktový průchod, význam odeslání výkazu, určení odběratele a tento konkrétní návrh uživatel schválil v této konverzaci. Při závěrečné kontrole určil CH jako kontrolora vlastní nahrané faktury; tato změna je zapracovaná níže. Nová fakturace ani souhlasy zatím nejsou implementované nebo nasazené.

## Běžný průchod

Pracovník průběžně ukládá rozpracované hodiny. **Odeslat ke schválení znamená konečné odevzdání veškeré jeho práce na dané akci.** Jednotlivé dny zůstávají řádky jednoho výkazu. Tři dny práce na jedné akci nejsou důvodem pro tři faktury.

Po kontrole CH a konečném schválení COO vznikne přesný podklad k fakturaci. Pro běžnou akci není potřebný další krok COO „spustit fakturaci“. Rozhoduje schválení výkazu konkrétního pracovníka; čekání na výkazy ostatních lidí na akci se nepřidává.

Odběratelem je **koncový klient uvedený u projektu dané akce**: akce → projekt → klient. Dodavatelem je pracovník. Chybějící vazba nebo neúplné fakturační údaje se zobrazí jako důvod, proč fakturace čeká; nevymyslí se náhradní odběratel a schválení hodin se kvůli tomu nevrací.

## Tři výsledky schválení

| Způsob | Výsledek |
| --- | --- |
| Vlastní faktura | Crew vidí schválený rozpis a částku, údaje odběratele a možnost nahrát vlastní PDF. |
| Self-billing s jednotlivým souhlasem | Crew vidí přesný náhled a potvrdí „Vystavit fakturu za mě“. Do té doby existuje pouze podklad, nikoli vystavená faktura. |
| Self-billing s trvalým souhlasem | Po úplném schválení vznikne jedna faktura automaticky; crew ji najde ve svém přehledu. |

Bez trvalého souhlasu zůstávají dostupné obě volby. Zvolením vlastní faktury se pro tentýž podklad nesmí zároveň vystavit self-billing faktura. Část již vyfakturovaného výkazu se znovu nenabídne.

Ve společném výkazu propojených směn se čeká na dokončení schválení celého příslušného odevzdaného kola. Výběr jeho podkladů zůstane přesný a omezený na daného pracovníka. Nesouvisející akce se automaticky neslučují. Dosavadní vědomý výběr více schválených podkladů může nadále sloužit k jedné společné faktuře; stejné podklady nesmí být současně rezervované pro jednotlivé i společné vystavení. Jedna faktura má právě jednoho dodavatele, odběratele a měnu. Rozdílní odběratelé se nesmějí potichu sloučit.

## Podklad není faktura

Vznikne oddělený záznam podkladu s přesnou vazbou na schválené výkazy, jejich verze a schvalovací kolo. Uchová rozpis dnů, hodin, sazeb, cestovného, podporovaného stravného a výsledné částky. Částka v náhledu musí odpovídat souhrnu, který COO schvaluje.

Výpočet a uložení potvrzuje server. Prohlížeč nesmí dodat libovolnou částku místo schválených údajů. Pozdější změna sazby, kilometrovného, názvu akce nebo údajů profilu nezmění již schválený finanční podklad. Peněžní součty používají desetinnou přesnost a jednu shodnou bázi v náhledu, uloženém podkladu a výsledné faktuře.

Náhled před vystavením obsahuje údaje dodavatele a odběratele. Změní-li se podstatné fakturační údaje mezi zobrazením náhledu a potvrzením, vyžádá se nový náhled. Faktura uloží vlastní neměnné snapshoty použitých údajů. Historické doklady se neaktualizují z dnešních profilů.

V seznamu budou zřetelně oddělené části **K fakturaci** a **Faktury**. Podklad čekající na rozhodnutí crew nemá číslo vydané faktury a nezobrazuje se jako skutečný účetní doklad.

## Vlastní faktura

Crew otevře podklad a uvidí akci, schválený rozpis, částku a správného odběratele. Formulář přijme PDF do 5 MiB a číslo faktury, datum vystavení a splatnost uvedené na dokumentu. Zobrazí schválenou částku, se kterou má dokument souhlasit.

Uchová se původní číslo faktury dodavatele. Stejné číslo u dvou různých dodavatelů je přípustné; opakované číslo u stejného dodavatele vyžaduje odmítnutí duplicity. Současná globální unikátnost `invoice_number` proto potřebuje před přidáním vlastních faktur bezpečně upravit rozsah, při zachování všech historických čísel a vazeb.

Nahrání provede server po ověření přihlášeného vlastníka a aktuálního podkladu. Ověří velikost, typ a hlavičku PDF a uloží soubor do soukromého úložiště. Název ani cesta od prohlížeče neslouží jako oprávnění nebo důkaz vlastnictví.

Nahraná faktura přejde do **Ke kontrole dokumentu**. CH porovná dokument s podkladem, zejména dodavatele, odběratele, číslo a částku. Pro první verzi se nepředstírá automatické vytěžení nebo ověření všech údajů uvnitř PDF. Po přijetí se doklad objeví mezi skutečnými fakturami a přesné výkazy se propojí s touto fakturou. Nesoulad se vrátí s konkrétním důvodem; schválené hodiny se tím nezamítají.

Opravené PDF je nová verze dokumentu. Starší verze a rozhodnutí zůstanou dohledatelné. Po přijetí či úhradě nelze doklad potichu přepsat jiným souborem. Generátor self-billingu nesmí nahranou fakturu regenerovat nebo přepsat. Stahování vrací přijatý originál.

## Self-billing a souhlas

Výchozí varianta vyžaduje potvrzení každé faktury. Crew vidí rozsah, částku, dodavatele, odběratele a data dokladu, a teprve potom potvrdí vystavení. Server ověří vlastníka, přesný podklad, jeho aktuální verzi a souhlas pro tento konkrétní doklad. COO nemůže jednotlivý souhlas za pracovníka obejít starým tlačítkem pro vytvoření faktury.

Poblíž potvrzení bude informace:

> Chcete, aby další faktury vznikaly automaticky po schválení celého výkazu? V Nastavení → Fakturace můžete zapnout Trvalý souhlas se self-billingem.

Nastavení má samostatnou část **Fakturace**. Trvalý souhlas je ve výchozím stavu vypnutý a zapíná jej výslovně přihlášený pracovník. COO ani obecná editace cizího profilu ho za pracovníka nezapnou. Uloží se identita, čas, verze a znění potvrzeného souhlasu. Odvolání je stejně dostupné jako zapnutí a zůstane v historii.

Zapnutí platí pro výkazy konečně schválené po tomto souhlasu; samo hromadně nevystaví historické podklady. Odvolání zabrání dalšímu automatickému vystavování. Existující faktury a jejich historie zůstanou zachované. Při souběhu odvolání a vystavení se na serveru ověří aktuální souhlas v jednom řízeném pořadí, nikoli jen podle starého údaje v prohlížeči.

Self-billing navazuje na stávající PDF a číselnou řadu podle dodavatele a roku. Zachovává současný rozsah PDF pro neplátce DPH; tento stav musí pracovník výslovně potvrdit, nesmí se odvozovat z prázdného DIČ. Tato etapa nepřidává automatický výpočet DPH, účtenky, auta nebo účetní export.

## Vystavení, PDF a úhrada

Vystavení atomicky uloží fakturu, její položky, přesné vazby na výkazy, číslo a snapshoty. Výkazy se přepnou na vyfakturované až při tomto potvrzeném kroku. Dvojklik, dvě zařízení, ztracená odpověď nebo opakovaný automatický běh nesmí vytvořit druhou fakturu ani odebrat položky z cizího podkladu.

Automatické vystavení musí fungovat i po zavření aplikace COO. Zpracování má trvalý serverový záznam a bezpečné opakování. Vygenerování PDF naváže na vystavený doklad; jeho selhání nesmí vytvořit další číslo nebo druhou fakturu. Přehled ukáže, že PDF čeká, a umožní opakovat vytvoření PDF stejné faktury.

Přijaté vlastní faktury i vystavené self-billing faktury používají stejný přehled a návaznost na označení úhrady COO. Uchová se, kdo a kdy úhradu označil. Aplikace označením stavu neprovádí bankovní platbu ani nepředstírá odeslání e-mailu.

## Oprávnění, obnova a zavedení

Crew čte pouze vlastní podklady, souhlasy, dokumenty a faktury. CH a COO mají aktuální oprávněný přehled. Nahraný dokument přijímá nebo vrací CH, konečný výkaz schvaluje COO a označení úhrady zůstává COO. Anonymní přístup ani změna uživatelských metadat nepřidá přístup. Nové tabulky a soukromé soubory mají vlastní pravidla čtení a žádné obecné přímé klientské zápisy.

Nové dotazy a načítání jsou svázané s přihlášenou identitou. Odhlášení, přepnutí profilu nebo změna role odstraní starý kontext a zastaví publikování opožděných odpovědí. Přehled se po změnách obnovuje mezi účty a po návratu do aplikace.

Migrace zachová historické faktury, čísla, částky, soubory, výkazy a schválení. Nezapne nikomu trvalý souhlas a nevystaví historické faktury hromadně. Starší schválené podklady lze zpřístupnit k vědomému dalšímu kroku. Funkce se nejprve ověří v izolovaném demu, které nevytváří skutečné obchodní doklady.

## Ověření před dokončením

- Třídenní výkaz jedné akce: průběžné uložení → konečné odeslání → vrácení a oprava → úplné schválení → jeden podklad → jedna faktura.
- Nedokončené, vrácené nebo částečně schválené společné kolo nevystaví fakturu.
- Jednotlivý souhlas vystaví jednu fakturu s přesně zobrazenými údaji; bez souhlasu nevznikne doklad.
- Trvalý souhlas: nové schválení vystaví fakturu bez dalšího kliknutí crew; starší podklady se nevystaví. Odvolání zastaví další automatické vystavení.
- Vlastní PDF: nahrání → kontrola CH → vrácení CH → opravená verze → přijetí CH → stažení původního souboru → označení úhrady COO. COO nemůže přijetí dokumentu provést místo CH.
- Změna sazby po schválení nemění schválenou částku. Podklad a PDF zachovají cestovné i podporované stravné.
- Stejná data při novém přihlášení a na druhém zařízení; skutečné povolení i odmítnutí přístupu pro čtyři oddělené testovací účty.
- Souběžné potvrzení, nahrání a automatický běh; souběh se změnou podkladu nebo odvoláním souhlasu; žádná duplicitní faktura.
- Selhání PDF a sítě: dohledání původního výsledku, bezpečné opakování a žádný falešný úspěch.
- App testy, lint, sestavení, skutečné databázové a Storage testy, nezávislá kontrola změn, integrace do main a aktualizace simulátoru a dostupného iPhonu podle AGENTS.md.

## Technické hranice a výchozí stav

Použít stávající kanonické výkazy, společná schvalovací kola, faktury, položky a vazby. Novou odpovědnost podkladů, souhlasů a dokumentů oddělit do `src/features/invoice-billing/`; nastavení začlenit do stávající `SettingsView` a přehled do `InvoicesView`. Privilegované zápisy zůstanou v úzce oprávněných serverových operacích. Soukromé PDF čtení navazuje na oprávnění k podkladu nebo faktuře.

Konkrétní implementační plán musí řešit současné omezení `create_invoice_atomic` na COO, zastavit možnost obejít souhlas tímto starým vstupem, zachovat ochrany dokončených společných výkazů a doplnit stravné, které současný výkaz do souhrnu počítá, ale starý create flow do faktury nepřenáší. Nestačí povolit crew přímé zápisy do `invoices`.

Izolovaná větev vychází z main `4eff3dd9b097e6bc2b1de5321924ad554658421e`. Základ bez této funkce prošel 158 soubory / 1 924 testy. Nebyl změněn živý server, obchodní údaje ani instalace zařízení.

Oficiální technické zdroje pro další implementaci: [soukromé Supabase buckety](https://supabase.com/docs/guides/storage/buckets/fundamentals), [omezení souborů](https://supabase.com/docs/guides/storage/uploads/file-limits), [Supabase changelog](https://supabase.com/changelog). Před serverovými změnami ověřit konkrétní aktuální kontrakty a provést lokální kontrolu oprávnění a advisors.

# Propojené směny — ověření v aplikaci

Tento postup je připravený pro testování po aktualizaci vývojové aplikace v prostředí s již nasazenou podporou propojených směn. Sám o sobě nepotvrzuje, že je změna už v simulátoru nebo telefonu. Použijte vyhrazené testovací akce a účty; schválení se skutečně ukládá.

## Příprava

Připravte tři samostatné směny: přípravy, instalace a deinstalace. Prvního člověka přiřaďte pouze na přípravy a instalaci, druhého na instalaci a deinstalaci. Pro propojení není nutný člověk společný všem třem směnám. Jejich výkazy musí být zatím koncepty, bez historie schvalování a faktur. Všechny směny mají mít stejného určeného schvalovatele COO, odlišného od člena crew.

Pro kontrolu časového seznamu přidejte v izolovaném lokálním prostředí dnešní a budoucí směnu, vícedenní směnu probíhající přes dnešek, včerejší směnu a starší směnu za několika prázdnými týdny. Starší směna má mít snadno vyhledatelný český název a jobnumber. Pro přesuny připravte další, nezávislé propojení tří jiných směn a nepropojenou cílovou směnu s jiným skutečným jobnumber. Toto zdrojové propojení nepoužívejte pro základní schvalovací průchod níže.

Nové testovací propojení a chybové scénáře vytvářejte pouze na lokálních podkladech. V prostředí Staff ověřujte otevření, hledání a zrušení bez uložení; schvalovací průchod vyžaduje výslovně vyhrazené testovací akce a účty.

## Výběr karet a závěrečné potvrzení

1. Jako CrewHead nebo COO otevřete **Akce → Propojit směny** v liště správy. Po načtení podkladů se běžné karty Akcí přepnou do režimu se zaškrtávacími kolečky. Vstup neotevře výběrový dialog. Výběr začíná prázdný a lišta ukazuje **Vybráno: 0**; **Pokračovat** není dostupné. Při chybě prvního načtení zopakujte načtení; neúplné podklady nesmějí otevřít výběr. Ověřte stejný vstup na mobilu i desktopu. Crew ovládání správy nemá.
2. Vstupní záběr musí být u dnešního místního kalendářního dne s probíhajícími vícedenními a budoucími směnami. Historie se při samotném otevření nesmí celá rozbalit. Posouvejte směrem nahoru: starší směny se přidávají nad seznam v dávkách po sedmi kalendářních dnech. Například pro 12. 10. je první rozsah 5.–11. 10. a další 28. 9.–4. 10. Dosud viditelná karta má zůstat na svém místě bez skoku na začátek nové dávky. Opakované posunutí nesmí vytvořit duplicitní karty; prázdné týdny nesmějí zabránit dosažení starší směny.
3. Přes **Přejít na datum** skočte na den se směnou i na den bez směny. U prázdného dne má být viditelná nejbližší následující karta, nebo srozumitelný prázdný stav, pokud žádná následující směna není. Od zvoleného data lze opět pokračovat do minulosti; návrat na dnešek použije stejné ovládání.
4. Označte dvě různé směny klepnutím na kartu a vyzkoušejte také Enter a mezerník. Karta má pouze přepnout označení, neotevřít detail ani spustit mazání, kopírování nebo přechod do crew. U vícedenní směny se musí označit všechny její viditelné kopie a počet narůst pouze o jednu. Desktopové karty zachovají jména crew jako neinteraktivní text; mobil zachovává dosavadní kompaktní podobu bez jmen.
5. V **Hledat směnu nebo jobnumber** najděte starší směnu mimo dosud zobrazené týdny, také podle českého názvu. Hledání prochází všechny dostupné podklady a řadí výsledky chronologicky bez omezení datem. Změna data, hledání i prázdný výsledek nesmějí odznačit skryté směny. Po vymazání hledání se obnoví předchozí časový rozsah a pozice.
6. S jednou různou směnou nelze pokračovat. Se dvěma nebo více zvolte **Pokračovat**: teprve nyní se otevře souhrn. Musí vypsat všechny vybrané směny s názvem, jobnumber a datem, i když byly skryté hledáním. V této chvíli ještě není nic uloženo. **Zpět k výběru** vrátí stejná označení, hledání, datum a pozici; změna výběru ruší dřívější potvrzení dopadu.
7. Na mobilu ověřte poslední kartu, spodní lištu, navigaci a otevřenou klávesnici. **Vybráno**, **Pokračovat** a **Zrušit** mají zůstat dosažitelné bez vodorovného přetečení nebo překrytí. **Zrušit** obnoví původní běžný přehled, včetně měsíce, pohledu, filtru, hledání a pozice. Totéž platí po úspěšném dokončení.
8. Pro konečné uložení zvolte v souhrnu **Propojit směny**. Nabídka není omezená člověkem, měsícem ani filtrem původního přehledu. Propojení platí pro všechny skutečně přiřazené lidi a nikoho na směnu nepřiřazuje. Stejný jobnumber neoznačí jiné směny automaticky a není identifikátorem propojení.

## Základní průchod

1. Jako CrewHead nebo COO otevřete **Akce → Propojit směny**, vyhledejte a označte přípravy, instalaci a deinstalaci přímo v kartách. Přes **Pokračovat** zkontrolujte všechny tři členy a až v souhrnu potvrďte **Propojit směny**. Případné propojení různých projektů vyžaduje samostatné výslovné potvrzení.
2. Přihlaste se jako první člověk. Otevřete evidenci z příprav a potom z instalace. V obou případech musí být tentýž společný editor se dvěma částmi. Deinstalace se mu vůbec nezobrazí.
3. Vyplňte hodiny, cestu a případné jídlo samostatně u každé části. Použijte **Uložit rozpracované části**, zavřete editor a znovu otevřete. Údaje musí zůstat zachované. Rozpracované části mohou být neúplné; odeslání neúplného výkazu musí konkrétní chybu označit.
4. Po doplnění obou částí zvolte **Odeslat vše ke kontrole**. V přehledu CrewHead má být jedna společná karta s oběma směnami, rozpisem a součtem. Otevření z jedné části nesmí zbytek společného výkazu skrýt.
5. Jako CrewHead zkontrolujte celý výkaz a zvolte **Předat celé kolo ke schválení**. Jako určený COO zvolte **Schválit celé kolo**. COO může hodiny prohlížet, ale ne přepisovat. Obě části musí přejít do schváleného stavu současně.
6. Ověřte, že samotným schválením nevznikla faktura ani se nezměnily účtenky. Druhý člověk má vlastní evidenci a vlastní schvalování, nezávislé na prvním.

## Umístění správy a osobní přehled

- Před prvním odesláním otevřete detail kterékoliv propojené akce. Musí zobrazit všechny členy propojení a **Upravit propojení**, se všemi uloženými členy již označenými. Detail nepropojené akce nenabízí další hlavní tlačítko pro vytváření.
- Vyzkoušejte také neobsazené testovací směny: ani ty nepotřebují společného člena crew. Nový režim v kartách nenahrazuje dosavadní výběrový dialog **Upravit propojení** v detailu; ten nadále otevírá již označené uložené členy.
- V detailu prvního člověka obsahuje neinteraktivní informace **Společná evidence** pouze názvy právě přiřazených směn: přípravy a instalaci. Deinstalace se do jeho osobní informace nesmí přidat ani kvůli historickému výkazu. Informace neotevírá správu; v detailu crew není tlačítko pro vytvoření, úpravu ani zrušení propojení.
- Otevřete vytváření z přehledu a pak opusťte Akce. Režim výběru i případný souhrn musí zaniknout bez automatického uložení. Skutečná změna identity, role nebo zdroje dat ukončuje stejnou relaci; pozdní načtení ji nesmí znovu otevřít. Při přechodu mezi detaily různých akcí nesmí zůstat otevřený editor předchozí akce nebo se do nového propsat její pozdní odpověď. Běžná změna data, hledání a návrat ze souhrnu naopak výběr zachovávají.
- Se zavřeným dialogem změňte propojení v druhé relaci a znovu načtěte data. Přehled v detailu musí zobrazit novou skupinu i změny členů téže skupiny; po odpojení akce musí zmizet. Pozdní odpověď předchozího načítání nesmí původní přehled obnovit.

## Přesuny a bezpečné opakování

- V nezávislém zdrojovém propojení označte pro nové propojení jednu směnu a cílovou směnu s jiným skutečným jobnumber. Souhrn musí popsat přesunuté směny a všechny zbylé členy původní skupiny. Bez obou samostatných potvrzení **Potvrzuji přesun z jiného propojení** a **Potvrzuji propojení různých projektů nebo jobnumber** se uložení nesmí provést. V odděleném lokálním průchodu vyberte všechny členy zdrojové skupiny a ověřte upozornění, že prázdné původní propojení zanikne.
- Zkontrolujte blokovanou směnu s důvodem přímo na kartě. Odeslaný výkaz, historie schvalovacích kol, vazba na fakturu nebo blokace jiného člověka či zbylého člena zdrojové skupiny musejí zabránit přidání i uložení. Nestačí kontrola právě zobrazené karty nebo jednoho člověka. Chybějící či nově nedostupný vybraný člen nesmí potichu zmizet z výběru; souhrn upozorní na problém a uložení zablokuje.
- Při souběžné úpravě jiným správcem vyvolejte konflikt a použijte **Obnovit data a ponechat výběr**. Po úspěšném načtení zůstane stejný rozpracovaný výběr, dosavadní potvrzení se ruší a před uložením je nutné označit **Zkontroloval jsem výběr po obnovení dat**. Běžné zveřejnění nových dat v přehledu nesmí samo přepsat zachycené podklady ani verze.
- Pokud po úspěšné obnově blokuje nové vytvoření člen původní skupiny, vraťte se přes **Zpět k výběru** a odznačte příslušnou vybranou směnu. Odznačení pouze odloží volbu z rozpracovaného výběru, nemění uloženou zdrojovou skupinu. Přidávání dalších směn, pokračování a konečné uložení stále musejí splnit všechny kontroly. Během konfliktu, ukládání nebo nejasné odpovědi je změna výběru zablokovaná. Toto zotavení nemění pravidla dosavadního editoru v detailu.
- Vyzkoušejte chybu při obnovování po konfliktu. Relace i výběr musejí zůstat zachované, neověřené podklady nesmějí dovolit uložení. Opakujte **Obnovit data a ponechat výběr** v témže souhrnu nebo detailovém editoru; po úspěšném načtení je znovu nutná kontrola výběru. Zánik upravovaného propojení nebo nedostupný dotčený člen nadále blokuje uložení.
- Vyvolejte nejasnou odpověď na lokální uložení. **Zopakovat stejný požadavek** musí ověřit či zopakovat přesně původní požadavek; mezitím nejde změnit výběr ani poslat jiný. Opakované klepnutí nesmí odeslat dvě uložení současně. Zavření po nejasné odpovědi nevrací případné provedené uložení; při probíhajícím ukládání nejde relaci zavřít. Pozdní odpověď po opuštění relace nesmí zavřít nově otevřenou správu nebo zasáhnout nový účet.

## Oprava a vrácení

- Na dalším testovacím výkazu změňte jako CrewHead hodiny nebo kilometry, uveďte důvod a dotčenou směnu a zvolte **Odeslat úpravy crew k potvrzení**. Crew musí vidět opravu a potvrdit celé kolo. Teprve potom CrewHead předává výkaz COO.
- Vyzkoušejte **Vrátit celé kolo** s důvodem. Po opravě a novém odeslání musí být předchozí vrácení stále v historii; nové schvalování však pracuje pouze s aktuálním kolem.
- Během otevřeného výkazu změňte účet nebo testovací roli. Předchozí obsah a rozpracovaná akce nesmějí zůstat přístupné pod novou identitou.
- Přihlaste se také jako jiný COO než určený schvalovatel. Výkaz nesmí navyšovat jeho osobní počet „čeká na mě“ ani nabídnout schválení; případné zobrazení v celkovém přehledu slouží jen k prohlížení.
- Pokus o úpravu propojení po odeslání výkazu musí být zablokovaný. Již odeslaná sada směn se nesmí dodatečně změnit. Nově přiřazená směna zůstává mimo aktuální schvalování, dokud nepřijde další kolo.

## Co tato etapa neobsahuje

Výběr libovolných schválených akcí jednoho člověka na společnou fakturu je další samostatná etapa. Zatím se tímto postupem nenahrává ani nevystavuje faktura, nevytěžují se údaje z PDF a nic se neposílá účetní nebo do PowerApps.

# Propojené směny — ověření v aplikaci

Tento postup je připravený pro testování po aktualizaci vývojové aplikace v prostředí s již nasazenou podporou propojených směn. Sám o sobě nepotvrzuje, že je změna už v simulátoru nebo telefonu. Použijte vyhrazené testovací akce a účty; schválení se skutečně ukládá.

## Příprava

Připravte tři samostatné směny: přípravy, instalace a deinstalace. Prvního člověka přiřaďte pouze na přípravy a instalaci, druhého na instalaci a deinstalaci. Pro propojení není nutný člověk společný všem třem směnám. Jejich výkazy musí být zatím koncepty, bez historie schvalování a faktur. Všechny směny mají mít stejného určeného schvalovatele COO, odlišného od člena crew.

## Základní průchod

1. Jako CrewHead nebo COO otevřete **Akce → Propojit směny** v liště správy přehledu. Výběr začíná prázdný; vyhledejte a označte všechny tři související směny a uložte propojení. Nabídka není omezená člověkem, měsícem ani filtrem přehledu. Propojení platí pro všechny skutečně přiřazené lidi a nikoho na směnu nepřiřazuje. Jobnumber není identifikátor propojení; případné propojení různých projektů vyžaduje výslovné potvrzení. Ověřte stejný vstup na mobilu i desktopu.
2. Přihlaste se jako první člověk. Otevřete evidenci z příprav a potom z instalace. V obou případech musí být tentýž společný editor se dvěma částmi. Deinstalace se mu vůbec nezobrazí.
3. Vyplňte hodiny, cestu a případné jídlo samostatně u každé části. Použijte **Uložit rozpracované části**, zavřete editor a znovu otevřete. Údaje musí zůstat zachované. Rozpracované části mohou být neúplné; odeslání neúplného výkazu musí konkrétní chybu označit.
4. Po doplnění obou částí zvolte **Odeslat vše ke kontrole**. V přehledu CrewHead má být jedna společná karta s oběma směnami, rozpisem a součtem. Otevření z jedné části nesmí zbytek společného výkazu skrýt.
5. Jako CrewHead zkontrolujte celý výkaz a zvolte **Předat celé kolo ke schválení**. Jako určený COO zvolte **Schválit celé kolo**. COO může hodiny prohlížet, ale ne přepisovat. Obě části musí přejít do schváleného stavu současně.
6. Ověřte, že samotným schválením nevznikla faktura ani se nezměnily účtenky. Druhý člověk má vlastní evidenci a vlastní schvalování, nezávislé na prvním.

## Umístění správy a osobní přehled

- Před prvním odesláním otevřete detail kterékoliv propojené akce. Musí zobrazit všechny členy propojení a **Upravit propojení**, se všemi uloženými členy již označenými. Detail nepropojené akce nenabízí další hlavní tlačítko pro vytváření.
- Vyhledávání podle názvu nebo jobnumber nesmí odznačit dříve vybrané směny. Nové propojení s méně než dvěma členy nelze uložit. Vyzkoušejte také neobsazené testovací směny: ani ty nepotřebují společného člena crew.
- V detailu prvního člověka obsahuje neinteraktivní informace **Společná evidence** pouze názvy právě přiřazených směn: přípravy a instalaci. Deinstalace se do jeho osobní informace nesmí přidat ani kvůli historickému výkazu. Informace neotevírá správu; v detailu crew není tlačítko pro vytvoření, úpravu ani zrušení propojení.
- Otevřete vytváření z přehledu a pak přejděte do detailu akce; původní dialog musí zaniknout. Při přechodu mezi detaily různých akcí nesmí zůstat otevřený dialog předchozí akce nebo se do nového propsat její pozdní odpověď.
- Při souběžné úpravě jiným správcem vyvolejte konflikt a použijte **Obnovit data a ponechat výběr**. Po načtení aktuálních dat musí rozpracovaný výběr zůstat v témže dialogu; předchozí potvrzení se ruší a je nutné znovu označit **Zkontroloval jsem výběr po obnovení dat**. Pokud původní propojení zaniklo nebo dotčený člen není dostupný, uložení zůstává zablokované i po této kontrole.
- Vyzkoušejte také chybu při obnovování po konfliktu. Dialog i výběr musejí zůstat zachované, neověřená data nesmějí dovolit uložení. Opakujte **Obnovit data a ponechat výběr** ve stejném dialogu; po úspěšném načtení je znovu nutná kontrola výběru.
- Se zavřeným dialogem změňte propojení v druhé relaci a znovu načtěte data. Přehled v detailu musí zobrazit novou skupinu i změny členů téže skupiny; po odpojení akce musí zmizet. Pozdní odpověď předchozího načítání nesmí původní přehled obnovit.

## Oprava a vrácení

- Na dalším testovacím výkazu změňte jako CrewHead hodiny nebo kilometry, uveďte důvod a dotčenou směnu a zvolte **Odeslat úpravy crew k potvrzení**. Crew musí vidět opravu a potvrdit celé kolo. Teprve potom CrewHead předává výkaz COO.
- Vyzkoušejte **Vrátit celé kolo** s důvodem. Po opravě a novém odeslání musí být předchozí vrácení stále v historii; nové schvalování však pracuje pouze s aktuálním kolem.
- Během otevřeného výkazu změňte účet nebo testovací roli. Předchozí obsah a rozpracovaná akce nesmějí zůstat přístupné pod novou identitou.
- Přihlaste se také jako jiný COO než určený schvalovatel. Výkaz nesmí navyšovat jeho osobní počet „čeká na mě“ ani nabídnout schválení; případné zobrazení v celkovém přehledu slouží jen k prohlížení.
- Pokus o úpravu propojení po odeslání výkazu musí být zablokovaný. Již odeslaná sada směn se nesmí dodatečně změnit. Nově přiřazená směna zůstává mimo aktuální schvalování, dokud nepřijde další kolo.

## Co tato etapa neobsahuje

Výběr libovolných schválených akcí jednoho člověka na společnou fakturu je další samostatná etapa. Zatím se tímto postupem nenahrává ani nevystavuje faktura, nevytěžují se údaje z PDF a nic se neposílá účetní nebo do PowerApps.

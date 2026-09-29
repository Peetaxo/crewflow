# Propojené směny — ověření v aplikaci

Tento postup je připravený pro testování po nasazení databázové změny a aktualizaci vývojové aplikace. Sám o sobě nepotvrzuje, že je změna už v simulátoru nebo telefonu. Použijte vyhrazené testovací akce a účty; schválení se skutečně ukládá.

## Příprava

Připravte tři samostatné směny: přípravy, instalace a deinstalace. Prvního člověka přiřaďte pouze na přípravy a instalaci, druhého na všechny tři. Jejich výkazy musí být zatím koncepty, bez historie schvalování a faktur. Všechny směny mají mít stejného určeného schvalovatele COO, odlišného od člena crew.

## Základní průchod

1. Jako CrewHead nebo COO otevřete detail druhého člověka (přiřazeného na všechny tři směny) a **Propojit směny**. Vyberte všechny tři související směny a uložte propojení. Nabídka vychází ze směn daného člověka; uložené propojení ale platí pro všechny přiřazené lidi a nikoho na směnu nepřiřazuje. Jobnumber není identifikátor propojení; případné propojení různých projektů vyžaduje výslovné potvrzení.
2. Přihlaste se jako první člověk. Otevřete evidenci z příprav a potom z instalace. V obou případech musí být tentýž společný editor se dvěma částmi. Deinstalace se mu vůbec nezobrazí.
3. Vyplňte hodiny, cestu a případné jídlo samostatně u každé části. Použijte **Uložit rozpracované části**, zavřete editor a znovu otevřete. Údaje musí zůstat zachované. Rozpracované části mohou být neúplné; odeslání neúplného výkazu musí konkrétní chybu označit.
4. Po doplnění obou částí zvolte **Odeslat vše ke kontrole**. V přehledu CrewHead má být jedna společná karta s oběma směnami, rozpisem a součtem. Otevření z jedné části nesmí zbytek společného výkazu skrýt.
5. Jako CrewHead zkontrolujte celý výkaz a zvolte **Předat celé kolo ke schválení**. Jako určený COO zvolte **Schválit celé kolo**. COO může hodiny prohlížet, ale ne přepisovat. Obě části musí přejít do schváleného stavu současně.
6. Ověřte, že samotným schválením nevznikla faktura ani se nezměnily účtenky. Druhý člověk má vlastní evidenci a vlastní schvalování, nezávislé na prvním.

## Oprava a vrácení

- Na dalším testovacím výkazu změňte jako CrewHead hodiny nebo kilometry, uveďte důvod a dotčenou směnu a zvolte **Odeslat úpravy crew k potvrzení**. Crew musí vidět opravu a potvrdit celé kolo. Teprve potom CrewHead předává výkaz COO.
- Vyzkoušejte **Vrátit celé kolo** s důvodem. Po opravě a novém odeslání musí být předchozí vrácení stále v historii; nové schvalování však pracuje pouze s aktuálním kolem.
- Během otevřeného výkazu změňte účet nebo testovací roli. Předchozí obsah a rozpracovaná akce nesmějí zůstat přístupné pod novou identitou.
- Přihlaste se také jako jiný COO než určený schvalovatel. Výkaz nesmí navyšovat jeho osobní počet „čeká na mě“ ani nabídnout schválení; případné zobrazení v celkovém přehledu slouží jen k prohlížení.
- Pokus o úpravu propojení po odeslání výkazu musí být zablokovaný. Již odeslaná sada směn se nesmí dodatečně změnit. Nově přiřazená směna zůstává mimo aktuální schvalování, dokud nepřijde další kolo.

## Co tato etapa neobsahuje

Výběr libovolných schválených akcí jednoho člověka na společnou fakturu je další samostatná etapa. Zatím se tímto postupem nenahrává ani nevystavuje faktura, nevytěžují se údaje z PDF a nic se neposílá účetní nebo do PowerApps.

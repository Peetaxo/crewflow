# Invoice Workflow Design

**Datum:** 2026-04-15

## Cíl

Navrhnout finální workflow sekce `Faktury` tak, aby:
- seznam faktur zobrazoval jen skutečně vytvořené faktury
- schválené timelogy čekající na fakturaci nebyly zaměňované za faktury
- jedna faktura mohla obsahovat více `job_number`
- jedna faktura mohla obsahovat více timelogů jednoho kontraktora
- uživatel měl před vytvořením faktury kontrolu nad tím, co do ní půjde

## Stavový model

### Timelog

Timelog má tyto relevantní stavy:
- `draft`
- `pending_ch`
- `pending_coo`
- `approved`
- `invoiced`
- `paid`
- `rejected`

Význam:
- `approved` = timelog je interně schválený a připravený k fakturaci
- `invoiced` = timelog už byl zařazen do konkrétní faktury
- `paid` = timelog patří do faktury, která byla zaplacená

Důležité:
- `approved` je stav **timelogu**
- není to stav faktury
- schválený timelog ještě neznamená, že faktura existuje

### Faktura

Faktura používá jen tyto stavy:
- `draft`
- `sent`
- `paid`

Význam:
- `draft` = faktura už existuje, ale ještě nebyla finálně odeslaná
- `sent` = faktura byla odeslaná
- `paid` = faktura byla zaplacená

V této verzi se nepoužije:
- `disputed`

Důvod:
- po interním schválení přes `crewhead` a `COO` nechceme přidávat další rozporovací business flow

## Hlavní UX princip

Sekce `Faktury` bude zobrazovat pouze skutečně vytvořené faktury.

Nebudou se zde zobrazovat:
- schválené timelogy čekající na fakturaci
- pseudo-faktury
- automaticky vytvořené návrhy bez vědomého create flow

To znamená:
- `approved` timelog je vstup do fakturace
- `draft invoice` je až výstup vědomého vytvoření faktury

## Hlavní obrazovka Faktury

Stránka `Faktury` bude obsahovat:
- seznam existujících faktur
- filtrování / vyhledávání jako dnes
- tlačítko `Vytvořit fakturu`

Seznam bude postavený jen nad tabulkou `invoices` a jejími navázanými položkami.

## Create Flow

Po kliknutí na `Vytvořit fakturu` se otevře create flow.

### Krok 1: Seznam kontraktorů připravených k fakturaci

Uživatel nejdřív neuvidí jednotlivé timelogy, ale seznam kontraktorů, kteří mají něco schváleného k fakturaci.

Pro každého kontraktora se zobrazí:
- jméno
- počet schválených timelogů
- počet navázaných schválených účtenek
- orientační součet k vyplacení

### Krok 2: Batch Preview konkrétního kontraktora

Po výběru kontraktora systém:
- předvybere jeho `approved` timelogy
- předvybere relevantní `approved` účtenky
- seskupí preview podle `job_number`

V preview uživatel uvidí:
- skupiny podle `job_number`
- hodiny
- km
- účtenky
- celkové částky
- konkrétní timelogy a účtenky, které do batch spadají

### Krok 3: Ruční doladění výběru

Uživatel může:
- odebrat konkrétní timelog
- odebrat konkrétní účtenku

V první verzi nebude možné:
- ručně upravovat spočítané částky
- ručně přepisovat položky faktury
- ručně editovat `invoice_items`

To znamená, že první verze je:
- kontrola výběru
- ne ruční účetní editor

### Krok 4: Vytvoření faktury

Po potvrzení vznikne:
- jedna invoice hlavička
- více `invoice_items` seskupených podle `job_number`
- vazby `invoice_timelogs`
- volitelně vazby `invoice_receipts`

Teprve po úspěšném vytvoření faktury se:
- vybrané timelogy přepnou na `invoiced`
- vybrané účtenky přepnou na `attached`

## Datový model

### Faktura jako billing batch

Jedna faktura reprezentuje:
- jednoho kontraktora
- jednu konkrétní výplatní dávku

Faktura tedy není:
- 1:1 na timelog
- 1:1 na `job_number`

### Položky faktury

Faktura může obsahovat více `job_number`.

Každý `job_number` se v rámci faktury projeví jako samostatná položka v `invoice_items`.

### Vazby

Použité vazby:
- `invoice_items` = shrnuté položky faktury podle `job_number`
- `invoice_timelogs` = přesné timelogy zahrnuté do faktury
- `invoice_receipts` = přesné účtenky zahrnuté do faktury

## Co v této verzi nebude

- automatické vytváření faktury při `COO` schválení
- zobrazování pseudo-faktur v seznamu
- stav `disputed`
- ruční editace položek draft faktury
- míchání více kontraktorů do jedné faktury

## Otevřená rozhodnutí

Momentálně nejsou žádná otevřená rozhodnutí, která by blokovala implementaci první verze.

Další kroky:
1. upravit `InvoicesView`, aby zobrazoval jen skutečné faktury
2. přidat create flow pro fakturaci jednoho kontraktora
3. napojit write flow na `invoice_items`, `invoice_timelogs`, `invoice_receipts`
4. otestovat end-to-end chování v Supabase

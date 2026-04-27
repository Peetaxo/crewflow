# Self-Billing Invoice PDF Design

## Goal

Vytvorit produkcne pouzitelny self-billing PDF doklad pro faktury, kde dodavatel je clen crew z `profiles` a odberatel je firma/klient z `clients`.

Prvni verze podporuje pouze dodavatele, ktery neni platcem DPH.

## Current Context

Aplikace uz umi vytvorit fakturu jako billing batch:

- jedna invoice hlavicka v `invoices`
- polozky podle job number v `invoice_items`
- vazby na vykazy v `invoice_timelogs`
- vazby na uctenky v `invoice_receipts`

Faktura je vytvarena z vybranych schvalenych timelogu a uctenek. Po uspesnem vytvoreni se timelogy prepnou na `invoiced` a uctenky na `attached`.

Aktualni model jeste neuklada PDF, cislo faktury ani snapshot fakturacnich udaju.

## Accounting Scope

Doklad je self-billing faktura:

- `profiles` = dodavatel
- `clients` = odberatel
- PDF musi obsahovat text `Vystaveno odberatelem`
- PDF musi obsahovat text `Dodavatel neni platcem DPH`
- DPH se v prvni verzi nepocita, nezobrazuje a neuklada

Jedna faktura reprezentuje prave jednoho dodavatele a prave jednoho odberatele.

Pokud budou v budoucnu vybrane polozky patrit vice odberatelum, system vytvori vice faktur. Prvni verze tento split nemusi implementovat, ale datovy model s nim nesmi byt v rozporu.

## Legal/Accounting Baseline

Prvni verze cili na ucetni doklad pro neplatce DPH podle ceskeho prostredi.

Minimalni obsah PDF:

- oznaceni dokladu: `Faktura`
- evidencni cislo faktury
- datum vystaveni
- datum uskuteneni plneni
- dodavatel: jmeno/firma, adresa, ICO, bankovni ucet
- odberatel: nazev, adresa, ICO, pripadne DIC
- predmet plneni a rozsah
- polozky faktury podle job number / akce
- celkova castka k uhrade
- mena: `CZK`
- text `Vystaveno odberatelem`
- text `Dodavatel neni platcem DPH`

Reference:

- Zakon o ucetnictvi, § 11: ucetni doklad musi obsahovat oznaceni dokladu, obsah ucetniho pripadu a ucastniky, castku nebo cenu/mnozstvi, okamzik vyhotoveni a okamzik uskutečněni ucetniho pripadu.
- Zakon o DPH, § 29: relevantni pro pozdejsi DPH variantu, ale prvni verze DPH nepodporuje.

## Data Model Changes

### `invoices`

Pridat metadata:

- `invoice_number text unique not null`
- `issue_date date not null`
- `taxable_supply_date date not null`
- `due_date date null`
- `currency text not null default 'CZK'`
- `supplier_snapshot jsonb not null`
- `customer_snapshot jsonb not null`
- `pdf_path text null`
- `pdf_generated_at timestamptz null`

`supplier_snapshot` bude obsahovat hodnoty z `profiles` v okamziku vystaveni:

```json
{
  "profileId": "uuid",
  "name": "Jan Novak",
  "ico": "12345678",
  "dic": null,
  "bankAccount": "123456789/0100",
  "billingStreet": "Ulice 1",
  "billingZip": "110 00",
  "billingCity": "Praha",
  "billingCountry": "Ceska republika",
  "vatPayer": false
}
```

`customer_snapshot` bude obsahovat hodnoty z `clients` v okamziku vystaveni:

```json
{
  "clientId": "uuid",
  "name": "Next Level s.r.o.",
  "ico": "12345678",
  "dic": "CZ12345678",
  "street": "Ulice 2",
  "zip": "110 00",
  "city": "Praha",
  "country": "Ceska republika"
}
```

Snapshoty jsou dulezite proto, aby se PDF ani historicka faktura nezmenily po pozdejsi uprave profilu dodavatele nebo klienta.

### `invoice_items`

Prvni verze muze vyuzit soucasna pole:

- `job_number`
- `event_id`
- `hours`
- `amount_hours`
- `km`
- `amount_km`
- `amount_receipts`
- `total_amount`

Pokud bude potreba presnejsi text polozky v PDF, prida se pozdeji `description text null`. Pro v1 neni nutne, protoze popis lze slozit z job number a navazane akce.

### Supabase Storage

Pridat bucket:

- `invoice-pdfs`

Doporucena cesta souboru:

```text
invoices/{invoiceId}/{invoiceNumber}.pdf
```

PDF se nebude generovat v browseru. Browser bude pouze volat Supabase Edge Function a nasledne stahovat hotovy soubor.

## Invoice Numbering

Prvni verze zavede ciselne rady pro self-billing faktury podle dodavatele a roku.

Format:

```text
SF-YYYY-PRIJMENI-J-0001
```

Priklad:

```text
SF-2026-NOVAK-T-0001
```

`PRIJMENI` se bere z `profiles.last_name`. `J` je prvni pismeno z `profiles.first_name`. Pro cislo faktury a Storage path se obe hodnoty normalizuji do ASCII uppercase slug hodnot bez mezer a diakritiky.

Sekvence `0001` se pocita samostatne pro kombinaci rok + dodavatel. Prvni faktura dodavatele Tomas Novak v roce 2026 bude `SF-2026-NOVAK-T-0001`, dalsi `SF-2026-NOVAK-T-0002`.

Generovani cisla musi byt server-side, aby nevznikly duplicity pri soubeznem vytvareni faktur.

Prvni implementace muze pouzit databazovou funkci nebo transakcni insert pres Edge Function. Pokud zustane vytvareni faktury ve frontend service, musi se cislovani resit pres RPC funkci v Supabase.

## Generation Flow

### Create Invoice

Pri vytvoreni faktury aplikace:

1. vytvori `invoices` zaznam
2. vytvori `invoice_items`
3. vytvori vazby `invoice_timelogs` a `invoice_receipts`
4. ulozi `supplier_snapshot`
5. ulozi `customer_snapshot`
6. ulozi `invoice_number`, `issue_date`, `taxable_supply_date`, `currency`
7. prepne timelogy na `invoiced`
8. prepne uctenky na `attached`

PDF nemusi vzniknout automaticky v tom samem kroku, ale faktura po vytvoreni musi mit vsechna data potrebna pro pozdejsi reprodukovatelne PDF.

### Generate PDF

Supabase Edge Function `generate-invoice-pdf`:

1. prijme `invoiceId`
2. overi opravneni prihlaseneho uzivatele
3. nacte fakturu, `invoice_items`, vazby, snapshot dodavatele a snapshot odberatele
4. vygeneruje PDF
5. ulozi PDF do Storage bucketu `invoice-pdfs`
6. aktualizuje `invoices.pdf_path` a `invoices.pdf_generated_at`
7. vrati podepsanou URL nebo metadata pro stazeni

### Download PDF

Aplikace:

1. pokud `pdf_path` existuje, zobrazi `Stahnout PDF`
2. pokud `pdf_path` neexistuje, zobrazi `Vygenerovat PDF`
3. po vygenerovani aktualizuje seznam faktur a nabidne download

## PDF Layout

PDF bude jednoduche, ucetne citelne a bez marketingove grafiky.

Struktura:

1. Nadpis `Faktura`
2. Cislo faktury, datum vystaveni, datum plneni, splatnost
3. Blok `Dodavatel`
4. Blok `Odberatel`
5. Viditelny text `Vystaveno odberatelem`
6. Tabulka polozek:
   - job number
   - akce nebo popis
   - hodiny
   - castka za hodiny
   - km
   - cestovne
   - uctenky
   - celkem
7. Souhrn `Celkem k uhrade`
8. Bankovni ucet dodavatele
9. Text `Dodavatel neni platcem DPH`

## UI Changes

V `InvoicesView` bude u kazde faktury:

- pro fakturu bez PDF: tlacitko `Vygenerovat PDF`
- pro fakturu s PDF: tlacitko `Stahnout PDF`
- pri generovani loading stav
- pri chybe toast s jasnou zpravou

V prvni verzi se PDF generuje rucne tlacitkem. Automaticke generovani po `Vytvorit a poslat` se prida az po overeni pipeline.

## Validation Rules

PDF nelze vygenerovat, pokud chybi:

- `invoice_number`
- dodavatelovo jmeno/firma
- dodavatelovo ICO
- dodavatelova fakturacni adresa
- dodavateluv bankovni ucet
- odberateluv nazev
- odberatelovo ICO
- odberatelova adresa
- alespon jedna invoice item polozka
- celkova castka vetsi nez 0

Chyba musi uzivateli rict, co je potreba doplnit. Napriklad:

```text
PDF nelze vygenerovat. Dodavateli chybi bankovni ucet.
```

## Out of Scope for v1

- DPH faktury
- vice odberatelu v jedne fakture
- automaticke deleni jedne davky do vice faktur
- dobropisy
- zalohove faktury
- proforma faktury
- QR platba
- odesilani PDF e-mailem
- export do ucetniho systemu
- rucni editace polozek faktury

## Testing Strategy

Unit/integration testy:

- faktura ulozi supplier/customer snapshot pri vytvoreni
- chybejici fakturacni udaje zablokuji generovani PDF
- existujici `pdf_path` zobrazi `Stahnout PDF`
- chybejici `pdf_path` zobrazi `Vygenerovat PDF`
- PDF generation service vola Edge Function s `invoiceId`
- po uspesnem vygenerovani se aktualizuje faktura v UI

Manualni test:

1. vytvorit fakturu pro kontraktora s kompletnimi fakturacnimi udaji
2. kliknout `Vygenerovat PDF`
3. overit, ze se PDF ulozi do Supabase Storage
4. stahnout PDF z aplikace
5. overit obsah PDF: dodavatel, odberatel, cislo faktury, data, polozky, celkem, bankovni ucet, texty `Vystaveno odberatelem` a `Dodavatel neni platcem DPH`

## Open Decisions Before Implementation

Pred implementaci je nutne potvrdit:

1. splatnost: navrh 14 dni od vystaveni
2. ktery `client` je odberatel pro polozky faktury, pokud cesta `invoice_item -> event -> project -> client` nebude u vsech dat jednoznacna
3. jestli ma PDF vznikat pouze na tlacitko, nebo automaticky po `Vytvorit a poslat` v pozdejsi fazi

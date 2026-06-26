# Event Detail Hours Export Design

## Cil

Dotahnout existujici detail akce do prvniho plne pouzitelneho provozniho kroku: organizator vidi, kdo je prihlaseny, kdo je potvrzeny, komu chybi casy, ktere casy cekaji na schvaleni, a muze z akce vygenerovat rozpis hodin pro dalsi zpracovani.

Tento krok navazuje na workflow, ktere uz v aplikaci existuje: prihlasky na akci, potvrzena crew, timelogy a schvalovani casu. Nejde o velky redesign detailu akce ani o novy paralelni proces.

## Rozsah V1

V1 prida do detailu akce dve veci:

- prehledny stav kazdeho potvrzeneho clena crew,
- export rozpisu hodin z konkretni akce do XLSX.

Stav potvrzene crew se bude odvozovat ze soucasnych dat. Aby se nepotkavalo potvrzeni cloveka na akci se schvalenim jeho hodin, V1 bude rozlisovat tyto stavy:

- `potvrzeno`: clovek je potvrzen na budouci akci a casy zatim nejsou vyzadovane,
- `chybi casy`: akce uz zacala nebo skoncila a potvrzeny clovek nema zadny vykazany pracovni blok, pripadne ma timelog bez dni,
- `ceka na schvaleni`: existuje timelog ve stavu `draft`, `pending_ch` nebo `pending_coo`,
- `cas schvalen`: existuje timelog ve stavu `approved`, `invoiced` nebo `paid`,
- `zamítnuto`: existuje timelog ve stavu `rejected`.

Pokud ma jeden clovek na akci vic timelogu, stav se vyhodnoti podle nejdulezitejsi otevrene prace: nejdrive `rejected`, potom `ceka na schvaleni`, potom `chybi casy`, potom `cas schvalen`, nakonec `potvrzeno`.

## UI

Primarni misto zustava `EventDetailView`.

Sekce `Prirazena Crew` dostane u kazdeho clena crew citelny stavovy badge a zakladni souhrn:

- pocet vykazanych hodin,
- aktualni stav timelogu,
- rychlou akci pro otevreni nebo vytvoreni timelogu.

V hlavicce nebo prave casti workflow detailu pribude akce `Exportovat rozpis hodin`. Tato akce bude dostupna pro role, ktere mohou spravovat akce nebo schvalovat vykazy. Crew role export neuvidi.

Pred exportem UI ukaze lehke varovani, pokud:

- nekdo z potvrzene crew nema zadane casy,
- existuji neschvalene timelogy,
- existuje zamitnuty timelog,
- nektery casovy blok vede pres pulnoc.

Varovani export nezablokuje. Je to kontrola pro organizatora, ne tvrde pravidlo.

## Export XLSX

Export ma byt podobny prilozene tabulce `Hodiny - EIT018.xlsx`, ale datove cistsi:

- kazdy radek obsahuje skutecne jmeno cloveka, ne pomlcku,
- hodiny se pocitaji z normalizovanych radku,
- souhrn nepocita z vizualnich sloucenych bunek,
- kontrolni list jasne ukaze chybejici nebo neschvalena data.

Workbook bude mit minimalne tri listy:

1. `Rozpis hodin`
   - akce, job number, klient, mesto,
   - jmeno,
   - datum,
   - den,
   - typ prace,
   - od,
   - do,
   - pocet hodin,
   - stav timelogu,
   - sazba,
   - castka.

2. `Souhrn`
   - jmeno,
   - pocet dni,
   - celkem hodin,
   - sazba,
   - celkem Kc,
   - stav.

3. `Kontrola`
   - potvrzeni lide bez casu,
   - timelogy cekajici na schvaleni,
   - zamitnute timelogy,
   - bloky pres pulnoc,
   - radky bez sazby nebo bez profile id.

Nazev souboru bude stabilni a citelny, napr. `rozpis-hodin-<job>-<nazev-akce>.xlsx`.

## Data Flow

Export se bude skladat z existujicich dat detailu akce:

- `Event` pro metadata akce,
- `EventCrewAssignment` nebo odvozena prirazena crew,
- `Contractor` pro jmeno a sazbu,
- `Timelog` a `TimelogDay` pro vykazane casy.

V implementaci vznikne cista doménova vrstva pro pripravu exportnich radku. UI ji pouze zavola s daty z detailu akce. Exportni vypocet hodin musi pouzivat stejnou logiku jako zbytek aplikace: rozdil `od` / `do`, vcetne prace pres pulnoc.

Samotne vygenerovani XLSX bude oddelene od mapovani dat, aby slo testovat vypocty bez prace se souborem.

## Error Handling

Export nesmi spadnout na nekompletnich datech. Pokud chybi sazba, jmeno, cas nebo contractor profil, radek se bud vynecha z financniho souctu, nebo se oznaci v listu `Kontrola`. UI musi ukazat srozumitelnou chybu jen pri skutecnem selhani generovani nebo stazeni souboru.

Vypocet pres pulnoc je povoleny a musi byt explicitne oznaceny v kontrole, protoze v puvodnim Excelu je to realny pouzivany pripad.

## Testovani

Testy maji pokryt:

- odvozeni stavu potvrzene crew z kombinace assignmentu a timelogu,
- rozdil mezi budouci potvrzenou akci a rozbehnutou/minulou akci bez casu,
- vypocet hodin vcetne bloku pres pulnoc,
- generovani radku pro `Rozpis hodin`,
- generovani souhrnu po lidech,
- kontrolni vystupy pro chybejici casy a neschvalene timelogy,
- viditelnost exportni akce jen pro spravcovske role.

UI testy se zameri na existujici detail akce a overi, ze nove stavy nerusi schvalovani ani otevreni timelog modal.

## Mimo rozsah V1

V1 neresi:

- velky redesign detailu akce do kanbanu,
- samoobsluzny portal mimo existujici aplikaci,
- automaticke rozesilani exportu,
- import schvalenych hodin z Excelu zpet do aplikace,
- fakturacni workflow nad ramec pouziti hodin a sazby v exportu,
- zmeny databazoveho modelu, pokud statusy pujdou spolehlive dopoctit ze stavajicich dat.

## Akceptacni kriteria

- Organizator v detailu akce vidi u kazdeho potvrzeneho clena crew, zda chybi casy, ceka se na schvaleni, nebo jsou casy schvalene.
- Organizator muze z detailu akce vygenerovat XLSX s rozpisem hodin a souhrnem po lidech.
- Export obsahuje kontrolni list s chybejicimi nebo rizikovymi daty.
- Vypocet hodin odpovida existujicim timelogum a podporuje praci pres pulnoc.
- Crew role nevidi exportni akci.
- Stavajici workflow prihlasky, potvrzeni crew a schvalovani timelogu zustane funkcni.

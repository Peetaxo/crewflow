# Supabase Schema Proposal

Tento navrh je pripraveny pro aktualni stav aplikace Crewflow.
Je to doporuceny mezikrok pred skutecnym prepnuti frontendu na Supabase.

Nic z tohoto souboru se samo neprovede. Slouzi k odsouhlaseni.

## Cile

- zachovat model, kde kazdy clen crew ma svuj login
- nebourat soucasne role a RLS
- pridat podporu pro:
  - jednoduchy tag `Spolehlivy`
  - ciselne hodnoceni clena crew 1-5
- srovnat JSON pole u `events`, aby lepe sedela na frontend
- nemenit ted zbytecne tabulky, ktere uz davaji smysl

## Co ponechat beze zmeny

Tyto casti vypadaji dobre a doporucuji je ted nemenit:

- `app_role`
- `user_roles`
- `clients`
- `projects`
- `event_assignments`
- `timelogs`
- `timelog_days`
- `invoices`
- `receipts`
- `candidates`
- vazba `profiles.user_id -> auth.users.id`
- zakladni RLS logika podle `has_role(auth.uid(), ...)` a `current_profile_id()`

## Co zmenit ted

### 1. `profiles`

Soucasny stav:

- mas `reliability numeric(3,2)`

Problem:

- neni jasne, jestli to znamena score, procenta nebo hvezdicky
- frontend potrebuje dve ruzne veci:
  - jednoduchy tag `Spolehlivy`
  - ciselne hodnoceni 1-5

Doporuceni:

- pridat `reliable boolean not null default false`
- pridat `rating numeric(2,1)`
- pridat check constraint na `rating` mezi 1.0 a 5.0
- stare `reliability` zatim nechat po prechodnou dobu

Proc stare `reliability` hned nesmazat:

- je bezpecnejsi nejdriv doplnit nova pole
- frontend a mapovaci vrstva se muzou upravit bez rizika
- az potom se da stare pole odstranit

### 2. `events.day_types`

Soucasny stav:

- `day_types jsonb default '[]'`

Problem:

- frontend s nim zachazi jako s mapou `datum -> typ dne`
- pro mapu je vhodnejsi objekt, ne pole

Doporuceni:

- zmenit default na `'{}'::jsonb`

### 3. `events.phase_schedules`

Soucasny stav:

- `phase_schedules jsonb default '[]'`

Problem:

- frontend ceka strukturu typu `typ -> pole slotu`
- opet jde spis o objekt nez o obycejne JSON pole

Doporuceni:

- zmenit default na `'{}'::jsonb`

### 4. `events.crew_filled`

Soucasny stav:

- existuje `crew_filled`
- a zaroven `event_assignments`

Problem:

- stejna informace muze byt vedena na dvou mistech

Doporuceni ted:

- zatim ponechat `crew_filled`
- frontend tim bude jednodussi
- pozdeji rozhodnout:
  - bud pocitat z `event_assignments`
  - nebo synchronizovat triggerem

Tohle bych ted nemenil, jen si to poznamenejme jako dalsi krok.

## Co nemenit ted, ale sledovat

### `profiles`

Do budoucna se mozna bude hodit:

- `active boolean`
- `nickname text`
- `city text`

Ale tohle ted neni nutne, protoze appka to umi resit i z aktualnich poli.

### `events`

Pokud budes chtit casem lepsi konzistenci, bude davat smysl:

- `client_id` misto nebo vedle `client_name`

Zatim bych ale `client_name` nechal, protoze frontend s nim uz pracuje.

## Doporucena implementace po poradi

1. Upravit schema podle SQL draftu.
2. Upravit frontend typy a mapovani:
   - `reliable`
   - `rating`
3. Zapnout read-only nacitani z `clients`, `projects`, `events`, `profiles`.
4. Az potom resit zapis a auth flow.

## Rozhodnuti k potvrzeni

Pokud souhlasis, dalsi krok bude:

- pripravit finalni SQL ke spusteni v Supabase SQL Editoru
- upravit frontend typy a mapovani na nova pole

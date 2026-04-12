# Supabase Review

Tento soubor shrnuje aktualni stav navrhu backendu pro Crewflow a zmeny,
ktere doporucuji udelat pred ostrym prepnuti frontendu na Supabase data.

## Co sedi uz ted

- Role v `app_role` odpovidaji frontendu: `crew`, `crewhead`, `coo`.
- Zakladni tabulky pro `clients`, `projects`, `events`, `timelogs`,
  `timelog_days`, `invoices`, `receipts`, `candidates` a `user_roles`
  davaji smysl.
- RLS je navrzene konzistentne: bezny crew vidi svoje zaznamy, CrewHead vidi
  sirsi prehled a COO ma plnou spravu.
- Rozhodnuti, ze kazdy clen crew ma vlastni login, dobre sedi na tabulku
  `profiles(user_id -> auth.users.id)`.

## Co doporucuji upravit po konzultaci

### 1. `profiles`

Frontend dnes potrebuje jak jednoduchy tag `Spolehlivy`, tak i ciselne
hodnoceni 1-5.

Doporuceni:

- pridat `reliable boolean not null default false`
- mit `rating numeric(2,1)` nebo `rating integer`

Soucasne pole `reliability numeric(3,2)` je nejasne. Neni zrejme, jestli ma
znamenat procenta, score nebo hvezdicky. Lepsi je rozdelit tyto dva koncepty.

### 2. `events.day_types` a `events.phase_schedules`

Frontend cekal objektove mapovani, zatimco schema ma defaulty:

- `day_types jsonb default '[]'`
- `phase_schedules jsonb default '[]'`

Doporuceni:

- `day_types` default `{}` pokud ma jit o mapu `datum -> typ`
- `phase_schedules` default `{}` pokud ma jit o mapu `typ -> pole slotu`

### 3. `events.crew_filled`

Mas soucasne:

- `event_assignments`
- `events.crew_filled`

To znamena, ze cast informace je odvoditelna a muze se rozjet. Na zacatek to
lze nechat, ale dlouhodobe bych doporucil:

- bud `crew_filled` pocitat z `event_assignments`
- nebo pridat trigger, ktery ho bude drzet synchronizovane

## Doporuceny dalsi postup

1. Nechat frontend zatim bezet nad lokalnimi seed daty.
2. Pridat login pres Supabase Auth.
3. Po prihlaseni nacitat role a profil aktualniho uzivatele.
4. Teprve potom prepnout jednotlive entity z `src/data.ts` na skutecne dotazy.

## Prvni bezpecna faze integrace

V projektu je pripraveno:

- `.env.example`
- `.env.local`
- `src/lib/supabase.ts`
- `src/lib/database.types.ts`
- `src/lib/supabase-mappers.ts`

To znamena, ze muzeme bezpecne navazat dalsi krok:

- prihlaseni uzivatele
- nacteni `profiles` + `user_roles`
- nasledne read-only nacitani dat z backendu

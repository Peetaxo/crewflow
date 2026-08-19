# Cílené schvalování výkazů – návrh databázového kontraktu

**Datum:** 2026-08-19
**Stav:** Čeká na produktové schválení; není určeno k nasazení

## Výchozí stav

Linked Supabase projekt neobsahuje tabulku `public.timelog_approvals` ani funkce `send_timelog_to_approvers` a `resolve_timelog_approval`. Stará mobilní migrace proto nemůže být bezpečně převzata. Mění existující trigger oprávnění, používá široký `search_path = public`, tiše zahazuje neplatné příjemce a nemá optimistickou verzi ani idempotentní identitu požadavku.

Současné schvalování zůstává funkční: Crew odešle výkaz CH, CH jej pošle COO a COO jej schválí. Tento návrh pouze popisuje budoucí rozšíření, ve kterém CH vybere konkrétního finálního schvalovatele.

## Doporučené chování

1. Crew odešle výkaz do `pending_ch`.
2. CH výkaz zkontroluje a vybere jeden nebo více konkrétních interních profilů s rolí CrewHead nebo COO. CH nesmí vybrat sebe ani autora výkazu.
3. Databáze atomicky vytvoří nové kolo schválení a přesune výkaz do `pending_coo`.
4. Každý vybraný schvalovatel rozhodne pouze o svém vlastním řádku.
5. Jediné vrácení ukončí celé aktivní kolo a přesune výkaz do `rejected` s poznámkou pro Crew.
6. Výkaz přejde do `approved` až po souhlasu všech vybraných schvalovatelů.
7. Cílené schválení samo nevytvoří fakturu. Fakturace zůstane samostatnou, výslovnou finanční operací COO.

## Datový model

Nová tabulka `public.timelog_approvals`:

- `id uuid primary key` – UUID vytvořené klientem před prvním requestem;
- `approval_round_id uuid not null` – stabilní UUID kola vytvořené klientem;
- `timelog_id uuid not null references public.timelogs(id) on delete cascade`;
- `approver_profile_id uuid not null references public.profiles(id) on delete restrict`;
- `requested_by_profile_id uuid not null references public.profiles(id) on delete restrict`;
- `status text not null` s hodnotami `pending`, `approved`, `returned`;
- `request_note text not null default ''`;
- `resolution_note text not null default ''`;
- `requested_at`, `resolved_at`, `superseded_at`, `updated_at` jako `timestamptz`.

Aktivní řádky mají unikátní dvojici `(timelog_id, approver_profile_id)` a unikátní trojici `(approval_round_id, timelog_id, approver_profile_id)`. Přímý `INSERT`, `UPDATE` a `DELETE` není povolen rolím `anon` ani `authenticated`.

## Atomická API

### `list_timelog_final_approvers`

Read-only `SECURITY DEFINER` funkce vrátí přesné UUID a zobrazované jméno oprávněných interních profilů. Vyžaduje autentizaci, existující výkaz a roli CrewHead nebo COO. Nevrací autora výkazu ani volajícího.

### `send_timelog_to_approvers_atomic`

Vstup obsahuje UUID výkazu, očekávané `updated_at`, klientské UUID kola, přesnou množinu UUID schvalovatelů a volitelnou poznámku. Funkce:

- zamkne výkaz a aktivní kola v deterministickém pořadí;
- vyžaduje stav `pending_ch` a roli CrewHead nebo COO;
- odmítne prázdnou množinu, duplicity, neexistující profil, Crew profil, autora i volajícího;
- nikdy tiše neodstraní neplatné UUID;
- atomicky superseduje staré kolo, vloží přesně požadované řádky a přepne výkaz na `pending_coo`;
- při opakování stejného `approval_round_id` se stejným payloadem vrátí původní výsledek, při jiném payloadu vrátí stabilní konflikt.

### `resolve_timelog_approval_atomic`

Vstup obsahuje UUID approval řádku, očekávané verze výkazu i approval řádku, akci `approved|returned` a poznámku. Funkce:

- zamkne výkaz a celé aktivní kolo;
- ověří, že volající je přesně přiřazený schvalovatel a jeho manažerská role stále platí;
- odmítne již vyřešený nebo supersedovaný řádek;
- po `returned` superseduje zbytek kola a nastaví výkaz na `rejected`;
- po posledním `approved` nastaví výkaz na `approved`, ale přes interní marker potlačí automatické vytvoření faktury;
- vrátí přesnou aktuální podobu výkazu a všech řádků aktivního kola.

Všechny endpointy mají `search_path = ''`, kvalifikované názvy, přesné signatury a `EXECUTE` pouze pro `authenticated`. Pomocné trigger funkce nemají žádného non-owner grantee.

## RLS a ochrana obcházení

- Approval řádky smějí číst autor výkazu, zadavatel, konkrétní schvalovatel a COO; ostatní cizí CrewHead je neuvidí.
- Přímé DML nad approval tabulkou je zakázané všem API rolím.
- Přímý přechod `pending_ch -> pending_coo` bude po nasazení cíleného workflow zablokován; povolí jej pouze marker atomického send RPC.
- Přímý přechod `pending_coo -> approved|rejected` bude povolen pouze markerem resolve RPC.
- Běžná editace draftu, oprava Crew a současné atomické CRUD výkazů zůstanou beze změny.

## Klient a obnova po ztracené odpovědi

Klient použije stabilní UUID výkazu, kola i approval řádků. Send i resolve poběží ve sdílené lifecycle frontě. Po nejednoznačné síťové chybě načte autoritativně výkazy a approval řádky; stejný request se může bezpečně zopakovat bez duplicity. UI nikdy nezobrazí syrovou PostgreSQL/RLS zprávu, pouze stabilní českou doménovou chybu.

## Povinné ověření před nasazením

- clean replay celé tracked historie;
- přesné katalogové kontroly tabulky, FK, UNIQUE, RLS, ACL, signatur, `prosecdef` a `proconfig`;
- verifier spuštěný jako `authenticated` pro Crew, CrewHead i COO;
- adversarial testy cizího schvalovatele, self-approval, neplatného UUID, prázdné množiny, stale verze, dvojkliku, souběžného return/approve a přímého REST bypassu;
- důkaz, že dokončení cíleného kola nevytvoří fakturu ani nezmění účtenky;
- klientské testy přesné množiny UUID, ztracené odpovědi, cache recovery a skrytí cizích approval řádků.

## Rozhodnutí požadované od uživatele

Doporučení je schválit výše popsanou variantu: všichni vybraní musí souhlasit, jediné vrácení kolo ukončí a fakturace proběhne až samostatně přes COO. Do schválení se databázová migrace ani cílené approval UI nevytváří.

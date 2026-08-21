# Centrální načtení počátečních dat aplikace

**Datum:** 2026-08-21  
**Stav:** schválený návrh

## Kontext

Po přihlášení aplikace správně počká na Supabase session, profil a roli. Potom ale vykreslí první obrazovku dříve, než se dokončí načtení dat potřebných pro Přehled. Crew proto krátce vidí nulové částky, žádné směny a prázdné seznamy; skutečné hodnoty se doplní až následně.

Současný `AppDataBootstrap` pouze resetuje hydratační stav v efektu spuštěném po prvním vykreslení. Jednotlivé služby pak načítají data líně a nezávisle. Přihlášení je tedy hotové, ale aplikační data ještě nejsou připravená.

## Cíl

Před prvním vykreslením přihlášené aplikace načíst konzistentní společný základ dat:

- akce a jejich lifecycle vazby,
- výkazy a jejich dny,
- Crew profily a sazby,
- projekty a klienty potřebné pro popis akcí a výpočty Přehledu.

Během tohoto načítání se zobrazí již schválené animované logo Nodu bez textu. Logo nebude mít umělou minimální dobu zobrazení.

## Rozsah

### Součást řešení

- centrální bootstrap po přihlášení a při změně role,
- čekání na všechny základní datové sady před zobrazením `AppLayout`,
- zneplatnění starého načítání při odhlášení, změně uživatele nebo role,
- deduplikace souběžných požadavků,
- chybový stav s akcí **Zkusit znovu**,
- synchronizace lokálního snapshotu a React Query cache před prvním vykreslením,
- testy úspěchu, chyby, opakování a změny session.

### Mimo rozsah

- umělé zpomalování rychlého přihlášení,
- změna vzhledu schválené animace,
- přednačítání všech dat Flotily, Skladu, Náboru, Faktur nebo Účtenek,
- změny databázového schématu, RLS nebo produkčního nasazení.

## Architektura

### 1. Awaitable bootstrap základních dat

Vznikne úzká orchestrace počátečního načtení. Ta nejprve resetuje hydratační ochrany a dotazovací cache pro nový datový rozsah a potom paralelně spustí existující načítací cesty pro akce, výkazy, Crew a projekty.

Jednotlivé služby zpřístupní awaitable vstupy, které:

- používají stávající mapování a session/epoch ochrany,
- sdílejí již rozběhnutý promise místo druhého požadavku,
- označí datovou sadu jako připravenou až po úspěšném commitu,
- při chybě ji ponechají opakovatelnou.

Bootstrap nebude odvozovat připravenost z délky polí. Prázdný seznam může být platný výsledek; rozhodující je dokončený načítací pokus.

### 2. Datová brána v React stromu

`AppDataBootstrap` se změní z neviditelného efektu na bránu obalující `AppLayout`:

1. nepřihlášený stav resetuje lokální Supabase rozsah,
2. přihlášený stav zahájí bootstrap pro konkrétní kombinaci uživatel + role,
3. během bootstrapu vrací `AppLoadingMark`,
4. po úspěchu vykreslí děti,
5. po chybě vykreslí stabilní chybovou kartu s tlačítkem **Zkusit znovu**.

`AppProvider` zůstane nad bránou, aby byla role a navigační preference připravena, ale `AppLayout` se nevykreslí před daty.

### 3. Session a role bezpečnost

Každý bootstrap ponese vlastní generaci a identitu datového rozsahu. Výsledek se smí přijmout pouze tehdy, pokud stále odpovídá aktuálnímu uživateli a roli.

Při odhlášení, změně uživatele nebo role se:

- zvýší generace bootstrapu,
- zruší nebo zneplatní staré dotazy,
- vyprázdní data předchozího rozsahu,
- zahájí nový bootstrap.

Pozdní dokončení starého požadavku nesmí skrýt loader, přepsat cache ani zobrazit data předchozí session.

### 4. Chybové chování

Selhání kterékoliv základní datové sady neotevře Přehled s falešnými nulami. Brána zobrazí uživatelsky srozumitelnou chybu a tlačítko **Zkusit znovu**.

Technický detail chyby zůstane pouze v diagnostickém logu; syrová Supabase nebo RLS zpráva se uživateli nezobrazí. Opakování použije nový bootstrap pokus a nezdědí zamítnutý promise.

Méně důležité sekce se nadále mohou hydratovat líně po otevření a jejich chyba neblokuje první obrazovku.

## Datový tok

1. Supabase Auth načte session, profil a roli.
2. `AppShell` přestane používat auth loader a vytvoří přihlášený strom.
3. Centrální datová brána zachytí uživatele a roli.
4. Brána resetuje předchozí datový rozsah.
5. Paralelně načte základní datové sady.
6. Každá služba commitne pouze výsledek odpovídající aktuální epoše.
7. Po dokončení všech sad brána atomicky přejde z loga na `AppLayout`.
8. Přehled se poprvé vykreslí se skutečnými částkami, směnami a vazbami.

## Testování

### Automatické testy

- Přihlášená aplikace během odloženého bootstrapu zobrazí logo a nevykreslí `AppLayout`.
- Dokončení pouze části základních sad loader neskrývá.
- Po dokončení všech sad se `AppLayout` vykreslí jednou s připraveným snapshotem.
- Rychlý úspěch nepřidává minimální prodlevu.
- Prázdné, ale úspěšně načtené datové sady jsou považované za připravené.
- Selhání zobrazí chybový stav a nezobrazí falešný Přehled.
- **Zkusit znovu** zahájí nový pokus a po úspěchu aplikaci otevře.
- Odhlášení, změna uživatele a změna role zneplatní starý výsledek.
- Lokální datový režim se vykreslí bez Supabase bootstrapu.

### Ruční ověření

- přihlášení v iOS simulátoru,
- zavření a opětovné otevření aplikace s uloženou session,
- změna role Crew / CH / COO,
- simulace pomalejší sítě,
- ověření, že první zobrazené částky a směny jsou již konečné.

## Akceptační kritéria

- Po přihlášení se nikdy nezobrazí Přehled s dočasnými nulami způsobenými nedokončenou hydratací.
- Animované logo zůstane viditelné přesně po dobu potřebnou k načtení základních dat.
- Při rychlém načtení může logo jen krátce probliknout.
- Změna session nebo role nemůže commitnout data předchozího rozsahu.
- Chyba načtení nevede k nekonečnému loaderu ani k syrové databázové zprávě.
- Řešení nevyžaduje databázovou migraci ani produkční deploy.

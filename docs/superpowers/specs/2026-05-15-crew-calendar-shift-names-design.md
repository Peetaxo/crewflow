# Crew Calendar Shift Names Design

## Cil

Pridat do sekce Crew jednoduchy read-only kalendar, ktery rychle ukaze, kteri lide jsou zapsani na akcich ve zvolenem obdobi.

Primarni obsah kalendare jsou **jmena lidi**, ne nazvy akci. Akce slouzi jako detail az po kliknuti na konkretni jmeno.

## Kontext

Sekce `Akce` uz dnes umi zobrazovat akce a jejich obsazeni. Novy Crew kalendar proto nema byt dalsi akciovy seznam. Ma byt opacna optika:

- otevru Crew,
- kliknu na tlacitko kalendare vedle `+ Novy clen`,
- vidim v kalendari aktivni jmena lidi na smenach,
- po kliknuti na jmeno zjistim, na jake akci je clovek zapsany.

Kalendar neresi dostupnost, dovolene ani hledani volnych lidi. Volny clovek se v kalendari pro danou smenu jednoduse nezobrazuje.

## Navrh UX

### Vstup

V hlavicce Crew pribude tlacitko `Kalendar smen` s ikonou kalendare. Otevre samostatny pohled v ramci Crew a nabidne navrat zpet na seznam lidi.

### Hlavni pohled

Vychozi pohled bude mesicni kalendar s tydennimi radky. V bunce nebo pres vice dni se zobrazi pouze jmenne stitky aktivnich prirazeni:

- `Petr Jouda`
- `Karel Vomacka`
- `Lucie Novakova`

Vice-denni prirazeni se ma chovat jako kalendarovy rozsah. Pokud je Petr zapsany 16.5.-18.5., v kalendari bude viditelne, ze jeho stitek patri k tomuto rozsahu. Label zustava jmeno, rozsah je vizualni nebo sekundarni metadata.

Pokud je v jednom dni mnoho lidi, kalendar ukaze prvnich nekolik jmen a zbytek jako `+N dalsich`; klik na den nebo `+N` otevre detail dne.

### Detail po kliknuti

Klik na jmeno otevre maly popover/detail:

- jmeno clena crew,
- nazev akce,
- datum nebo rozsah dat,
- casy smeny, pokud existuji,
- mesto akce, pokud existuje,
- tlacitko `Otevrit akci`.

Tlacitko `Otevrit akci` prepne aplikaci do sekce Akce a otevře detail konkretni akce.

### Filtrovani

Prvni verze ma obsahovat jen nezbytne filtry:

- posun mesice predchozi/dalsi,
- hledani podle jmena,
- volitelne filtr podle akce nebo job numberu, pokud to vyjde prirozene z existujicich dat.

Filtry podle dostupnosti, dovolene, role nebo vytizenosti nejsou soucasti prvni verze.

## Datovy model a data flow

Source of truth pro kalendar jsou existujici prirazeni na smeny:

- `timelogs.days` pro presne dny a casy konkretniho clena crew,
- `events` pro nazev, mesto a navigaci do detailu akce,
- `contractors` pro jmeno, avatar/inicialy a barvy,
- `eventCrewAssignments` pouze jako fallback, pokud pro prirazeni jeste neni dostupny timelog detail.

Implementace vytvori odvozeny model typu `CrewCalendarAssignment`:

- `contractorProfileId`,
- `contractorName`,
- `eventId` / `eventSupabaseId`,
- `eventName`,
- `dateFrom`,
- `dateTo`,
- `timeFrom` / `timeTo`, pokud lze odvodit,
- `days`.

Vice zaznamu stejneho clena na stejne akci se seskupi do rozsahu jen tehdy, kdyz dny navazuji a patri ke stejne akci. Pokud ma clovek v jednom dni vice ruznych akci, kalendar ukaze vice samostatnych stitku se stejnym jmenem; rozliseni je v detailu po kliknuti.

## Testovaci scenare

- Crew list zobrazi tlacitko `Kalendar smen` vedle `+ Novy clen`.
- Kalendar zobrazi jmena lidi z `timelogs.days` v odpovidajicich dnech.
- Vice-denni smena je zobrazena jako souvisly rozsah nebo ekvivalentne citelny rozsah pres dane dny.
- Klik na jmeno otevře detail s akci a tlacitkem `Otevrit akci`.
- `Otevrit akci` nastavi aplikaci na detail spravne akce.
- Vyhledani podle jmena omezi kalendar jen na odpovidajici lidi.
- Den s vice prirazenymi lidmi nez se vejde ukaze `+N dalsich` a detail dne.
- Kalendar nezobrazuje lidi bez smeny jako volne radky.

## Explicitni rozhodnuti

- Prvni verze je read-only.
- Hlavni label v kalendari je jmeno clena crew, ne nazev akce.
- Akce se zobrazi az v detailu po kliknuti.
- Neimplementovat dovolene, dostupnost ani samostatny seznam volnych lidi.
- Nezavadet novou databazovou tabulku; kalendar se sklada z existujicich dat.

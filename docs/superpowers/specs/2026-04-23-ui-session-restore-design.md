# UI Session Restore Design

**Datum:** 2026-04-23

## Cíl

Zajistit, aby aplikace po nechtěném reloadu způsobeném Safari, in-app browserem nebo jiným browser lifecycle chováním obnovila:
- aktuální sekci aplikace
- otevřený detail
- filtry a view nastavení
- rozpracované formuláře a otevřené modaly

Současně nesmí dojít k tomu, že by se při běžném přepnutí na jiný tab a zpět dělalo nějaké aktivní obnovování nebo reset.

## Problém

Rozpracovaný UI stav je dnes držený hlavně v React `useState` v [AppContext.tsx](/Users/peetax/Projekty/crewflow/src/context/AppContext.tsx).

To funguje správně, pokud browser tab ponechá živý v paměti.

V Safari a in-app browser scénářích se ale může stát, že:
- uživatel jen přepne na jiný tab nebo jinou aplikaci
- browser mezitím původní stránku uspí, zahodí nebo znovu inicializuje
- při návratu už nevznikne pokračování původní JS instance, ale nově načtená stránka

Výsledek:
- zmizí rozpracovaný modal
- zmizí rozepsané formuláře
- appka se vrátí do výchozího UI stavu

## Požadované chování

### Normální návrat do stejného tabu

Pokud browser tab ponechá živý:
- nesmí se dělat žádná speciální obnova
- UI musí zůstat přesně tak, jak bylo opuštěné

To znamená:
- žádný `focus`-driven reset
- žádný `visibilitychange` restore flow
- žádná reinitializace UI stavu jen proto, že se tab znovu stal aktivní

### Návrat po reloadu / obnovení stránky browserem

Pokud browser mezitím stránku reálně znovu načte:
- při bootstrapu aplikace se má obnovit poslední uložený UI snapshot pro danou session
- uživatel se má vrátit do stejné sekce a ke stejné rozdělané práci

## Návrh řešení

Použít `sessionStorage` jako per-tab/per-session záložní úložiště pouze pro UI kontext a draft stav.

`sessionStorage` zde neslouží jako náhrada běžného React stavu.

Slouží jen jako fallback pro případ, kdy browser zničí původní in-memory stav a vytvoří novou instanci stránky.

## Co se bude ukládat

Do UI snapshotu se uloží:
- `currentTab`
- `searchQuery`
- `timelogFilter`
- `projectFilter`
- `selectedContractorId`
- `selectedEventId`
- `selectedProjectIdForStats`
- `selectedClientIdForStats`
- `eventTab`
- `eventsViewMode`
- `eventsCalendarMode`
- `eventsFilter`
- `eventsCalendarDate`
- `editingTimelog`
- `editingReceipt`
- `editingProject`
- `editingClient`

Tím se pokryje:
- aktuální navigační kontext
- výběr detailu
- rozpracované modaly a jejich formulářové hodnoty

## Co se ukládat nebude

Neukládají se:
- query cache
- načtená business data z `events`, `timelogs`, `receipts`, `invoices`, `projects`, `clients`, `crew`
- potvrzovací dialogy jako `deleteConfirm`
- transient auth stav
- jakýkoliv serverový source-of-truth snapshot

Důvod:
- tato data už mají vlastní source of truth v Supabase / Query vrstvě
- ukládání těchto dat by zbytečně míchalo UI restore s datovou synchronizací

## Lifecycle pravidla

### Uložení snapshotu

UI snapshot se bude přepisovat při změně kteréhokoliv perzistovaného UI pole.

Mechanika:
- serializace poběží v `AppContext`
- zapisuje se jen malý UI objekt
- snapshot se vždy zapisuje jako celá verze payloadu, ne po jednotlivých klíčích

### Obnova snapshotu

Při mountu `AppContext`:
- zkusí se načíst snapshot ze `sessionStorage`
- pokud je validní a kompatibilní s aktuální verzí payloadu, použije se jako initial state
- pokud je neplatný, ignoruje se a appka startuje z defaultů

### Vyčištění snapshotu

Snapshot se smaže:
- při sign-out
- při chybě deserializace
- při nekompatibilní verzi payloadu

## Formát snapshotu

Snapshot bude verzovaný:

```ts
type PersistedUiSessionV1 = {
  version: 1;
  state: {
    currentTab: string;
    searchQuery: string;
    timelogFilter: string;
    projectFilter: string;
    selectedContractorId: number | null;
    selectedEventId: number | null;
    selectedProjectIdForStats: string | null;
    selectedClientIdForStats: number | null;
    eventTab: string;
    eventsViewMode: 'list' | 'calendar';
    eventsCalendarMode: 'month' | 'week';
    eventsFilter: 'upcoming' | 'past' | 'all';
    eventsCalendarDate: string;
    editingTimelog: Timelog | null;
    editingReceipt: ReceiptItem | null;
    editingProject: Project | null;
    editingClient: Client | null;
  };
};
```

## Bezpečnost a validace

Obnova musí být defenzivní:
- parse musí být obalený `try/catch`
- neznámá verze payloadu se ignoruje
- chybějící nebo neplatná pole spadnou na default
- snapshot nesmí způsobit pád appky

## Scope implementace

1. Přidat helper pro serializaci a deserializaci UI session snapshotu.
2. Napojit initial restore do `AppContext`.
3. Napojit průběžné ukládání do `sessionStorage`.
4. Vyčistit snapshot při sign-out.
5. Přidat regresní testy pro:
   - restore validního snapshotu
   - ignorování rozbitého snapshotu
   - smazání snapshotu při sign-out

## Co tato změna neřeší

- neřeší perzistenci business dat
- neřeší offline režim
- neřeší sdílení stavu mezi taby
- neřeší dlouhodobé obnovení po zavření browser session

## Dopad na UX

Po implementaci bude chování následující:
- při běžném přepnutí na jiný tab a zpět se nic zvláštního neděje
- pokud browser appku mezitím znovu načte, uživatel se vrátí do stejné sekce a ke stejné rozdělané práci

To znamená, že aplikace bude působit konzistentně i v Safari / IAB scénářích, kde browser lifecycle není plně pod kontrolou aplikace.

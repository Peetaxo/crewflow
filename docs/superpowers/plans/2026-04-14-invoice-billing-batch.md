# Invoice Billing Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nahradit stavajici model `1 invoice = 1 timelog` za billing batch model, kde jedna faktura obsahuje vice job number a vice schvalenych timelogu jednoho kontraktora.

**Architecture:** Supabase schema se rozsiruje o `invoice_items` a `invoice_timelogs`, stary trigger `timelog -> invoice` se vypina a invoice write flow se presune do `invoices.service.ts`. UI zustane beze zmen; service vrstva bude vytvaret invoice hlavicku, polozky a vazby na timelogy, a teprve potom prepne vybrane timelogy na `invoiced`.

**Tech Stack:** React, TypeScript, Supabase Postgres, lokalni store/service vrstva, Vitest

---

## File Map

- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\supabase\invoice-batch-migration-draft.sql`
  Schema draft pro `invoice_items`, `invoice_timelogs`, volitelnou `invoice_receipts` a odstraneni stareho triggeru.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\lib\database.types.ts`
  Dopsat nove tabulky a jejich typy po aplikaci migrace.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`
  Prepsat read/write logiku na billing batch model.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\timelogs\services\timelogs.service.ts`
  Pridat helper pro oznaceni konkretni sady timelogu jako `invoiced`.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\receipts\services\receipts.service.ts`
  Pokud zustane potreba, oznacit konkretni sadu receipts jako `attached`/`reimbursed`.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\views\InvoicesView.tsx`
  Jen pokud bude potreba drobna adaptace cteni nove struktury bez zmeny UI.
- Test: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.test.ts`
  Regression testy pro billing batch seskupeni a status prechody.

### Task 1: Uzamknout schema rozhodnuti

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\supabase\invoice-batch-migration-draft.sql`

- [ ] Zkontrolovat a schvalit SQL draft pro:
  - `invoice_items`
  - `invoice_timelogs`
  - `invoice_receipts` jako volitelnou tabulku
  - odstraneni triggeru `trg_timelog_approved`
- [ ] Aplikovat SQL rucne v Supabase SQL editoru.
- [ ] Oveřit, ze v databazi existuji nove tabulky a trigger uz neni aktivni.

Run:
```sql
select trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'timelogs';
```

Expected:
- `trg_timelog_approved` uz se nevraci

### Task 2: Dopsat DB typy

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\lib\database.types.ts`

- [ ] Dopsat `invoice_items` a `invoice_timelogs` do `Database.public.Tables`.
- [ ] Pokud bude v DB aplikovana i `invoice_receipts`, dopsat ji take.
- [ ] Zachovat existujici `invoices` tabulku kvuli prechodne kompatibilite.

Run:
```bash
npm run build
```

Expected:
- build prochazi bez type erroru

### Task 3: Napsat failing test pro billing batch generovani

**Files:**
- Create: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.test.ts`

- [ ] Pridat test, kde dva schvalene timelogy stejneho kontraktora patri pod dva ruzne `job_number`.
- [ ] Ocekavat jednu invoice hlavicku, dve `invoice_items` a dve vazby v `invoice_timelogs`.
- [ ] Ocekavat, ze az po vytvoreni faktury se konkretni timelogy oznaci jako `invoiced`.

Run:
```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected:
- FAIL, dokud neni prepsana service

### Task 4: Prepsat invoice write flow

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\timelogs\services\timelogs.service.ts`

- [ ] V `generateInvoices()` vybirat schvalene timelogy jednoho kontraktora jako billing batch.
- [ ] Seskupit polozky podle `job_number`, ne podle `event + contractor`.
- [ ] V Supabase rezimu vytvorit:
  - jednu `invoices` hlavicku
  - vice `invoice_items`
  - vazby `invoice_timelogs`
- [ ] Teprve po uspesnem zapisu oznacit konkretni timelogy jako `invoiced`.
- [ ] V lokalnim rezimu zachovat stejne chovani, jen na novem modelu.

Run:
```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected:
- PASS

### Task 5: Upravit read model faktur

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`

- [ ] Nacitat invoice hlavicky spolu s `invoice_items` a `invoice_timelogs`.
- [ ] Pro stavajici UI vratit kompatibilni shape:
  - totals z hlavicky
  - lookup contractor/event
  - fallback, pokud jeste existuji stare legacy invoice zaznamy
- [ ] Nezavadet zmenu UI.

Run:
```bash
npm run build
```

Expected:
- build prochazi a `InvoicesView` stale funguje

### Task 6: Smoke test workflow

**Files:**
- No code changes

- [ ] Realny test v appce:
  - schvalit dva timelogy stejneho kontraktora
  - jeden pod `AK001`, druhy pod `AK002`
  - vygenerovat jednu fakturu
- [ ] Oveřit v Supabase:
  - vznikla jedna invoice hlavicka
  - vznikly dve invoice_items
  - vznikly dve invoice_timelogs vazby
  - oba timelogy maji `status = invoiced`

Run:
```sql
select * from public.invoices order by created_at desc limit 5;
select * from public.invoice_items order by created_at desc limit 10;
select * from public.invoice_timelogs order by created_at desc limit 10;
```

Expected:
- data odpovidaji jednomu billing batchi

## Self-Review

- Spec coverage: pokryto schema, write flow, read flow i smoke test.
- Placeholder scan: zadne TBD nebo neurcite kroky.
- Type consistency: nove tabulky i service kroky pouzivaji stejne nazvy `invoice_items` a `invoice_timelogs`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-invoice-billing-batch.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

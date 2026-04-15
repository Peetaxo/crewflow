# Invoice Create Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upravit sekci `Faktury` tak, aby zobrazovala jen skutečně vytvořené faktury a vytváření nové faktury probíhalo přes kontrolovaný create flow nad schválenými timelogy a účtenkami jednoho kontraktora.

**Architecture:** Hlavní seznam faktur zůstane postavený nad `invoices`, ale tlačítko pro vytváření už nebude okamžitě generovat batch. Místo toho otevře create modal se seznamem kontraktorů připravených k fakturaci, následným preview seskupeným podle `job_number` a potvrzením vytvoření jedné faktury. Service vrstva dodá read model pro kandidáty k fakturaci i finální write akci.

**Tech Stack:** React, TypeScript, Supabase Postgres, lokální store/service vrstva, Vitest

---

## File Map

- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`
  Dodat read model pro kontraktory připravené k fakturaci, preview batch a finální create akci nad výběrem položek.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\types.ts`
  Dodat typy pro invoice create kandidáty a preview model, pokud budou potřeba mimo service soubor.
- Create: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\components\modals\InvoiceCreateModal.tsx`
  Modal pro dvoukrokový create flow: výběr kontraktora a preview fakturační dávky.
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\views\InvoicesView.tsx`
  Odebrat okamžité generování batchů, otevřít create modal a držet seznam jen nad skutečnými fakturami.
- Test: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.test.ts`
  Dopsat testy pro preview kandidátů a create flow se selektivním výběrem timelogů/účtenek.

### Task 1: Dopsat service API pro create flow

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\types.ts`

- [ ] Přidat typ pro kontraktora připraveného k fakturaci.
- [ ] Přidat typ pro batch preview seskupený podle `job_number`.
- [ ] Přidat service funkce:
  - `getInvoiceCreateCandidates()`
  - `getInvoiceCreatePreview(contractorId)`
  - `createInvoiceFromSelection(...)`
- [ ] Zachovat existující `getInvoices()` a `approveInvoice()` bez změny veřejného chování.

Run:
```bash
npm run build
```

Expected:
- build prochází a UI ještě není rozbité

### Task 2: Dopsat failing testy pro nový create flow

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.test.ts`

- [ ] Přidat test, že `getInvoiceCreateCandidates()` vrací jen kontraktory se schválenými timelogy nebo účtenkami.
- [ ] Přidat test, že `getInvoiceCreatePreview(contractorId)` seskupí položky podle `job_number`.
- [ ] Přidat test, že `createInvoiceFromSelection(...)` umí vytvořit fakturu jen z podmnožiny schválených položek.

Run:
```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected:
- FAIL, dokud není service doplněná

### Task 3: Implementovat create kandidáty a preview

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`

- [ ] Vrátit seznam kontraktorů připravených k fakturaci s:
  - jménem
  - počtem schválených timelogů
  - počtem schválených účtenek
  - orientační celkovou částkou
- [ ] Vrátit preview pro jednoho kontraktora:
  - skupiny podle `job_number`
  - konkrétní timelogy
  - konkrétní účtenky
  - součty hodin, km, účtenek a total
- [ ] Ujistit se, že preview neprovádí žádný zápis.

Run:
```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected:
- preview testy procházejí

### Task 4: Implementovat selektivní vytvoření faktury

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\features\invoices\services\invoices.service.ts`

- [ ] Upravit write flow tak, aby místo “všechno approved” vzal explicitní výběr:
  - `selectedTimelogIds`
  - `selectedReceiptIds`
- [ ] Z výběru vytvořit jednu fakturu pro jednoho kontraktora.
- [ ] Vytvořit:
  - `invoices`
  - `invoice_items`
  - `invoice_timelogs`
  - `invoice_receipts` pokud jsou zvolené účtenky
- [ ] Teprve po úspěšném zápisu přepnout vybrané timelogy na `invoiced` a vybrané účtenky na `attached`.

Run:
```bash
npm test -- src/features/invoices/services/invoices.service.test.ts
```

Expected:
- všechny invoice service testy procházejí

### Task 5: Přidat create modal

**Files:**
- Create: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\components\modals\InvoiceCreateModal.tsx`

- [ ] Vytvořit modal se dvěma stavy:
  - seznam kontraktorů připravených k fakturaci
  - preview dávky konkrétního kontraktora
- [ ] Umožnit:
  - vybrat kontraktora
  - odškrtnout konkrétní timelog
  - odškrtnout konkrétní účtenku
  - potvrdit vytvoření faktury
- [ ] V první verzi nepřidávat ruční editaci částek ani položek.

Run:
```bash
npm run build
```

Expected:
- modal se zkompiluje a nic dalšího nerozbije

### Task 6: Přepojit InvoicesView

**Files:**
- Modify: `C:\Users\HelpO\Downloads\crewflow-main\_git_seed\src\views\InvoicesView.tsx`

- [ ] Nahradit přímé `generateInvoices()` otevřením `InvoiceCreateModal`.
- [ ] V seznamu nadále zobrazovat jen skutečně vytvořené faktury.
- [ ] Zachovat stávající UI seznamu faktur, pokud to jde bez zbytečných změn.
- [ ] Zachovat `approveInvoice(...)` jako akci nad existující fakturou.

Run:
```bash
npm run build
```

Expected:
- stránka Faktury běží a create flow se otevírá přes modal

### Task 7: End-to-end smoke test

**Files:**
- No code changes

- [ ] Otevřít `Faktury`
- [ ] Kliknout `Vytvořit fakturu`
- [ ] Vybrat kontraktora se schválenými timelogy
- [ ] Odebrat jednu položku z preview
- [ ] Vytvořit fakturu
- [ ] Ověřit v Supabase:
  - vznikla jedna invoice hlavička
  - `invoice_items` odpovídají výběru
  - `invoice_timelogs` odpovídají výběru
  - jen vybrané timelogy mají `status = invoiced`

Run:
```sql
select * from public.invoices order by created_at desc limit 5;
select * from public.invoice_items order by created_at desc limit 20;
select * from public.invoice_timelogs order by created_at desc limit 20;
```

Expected:
- data odpovídají přesně potvrzenému výběru v modalu

## Self-Review

- Spec coverage: pokryto create kandidáty, preview, selektivní write i UI napojení.
- Placeholder scan: žádné TBD ani neurčitá místa.
- Type consistency: všude používáme stejnou terminologii `invoice_items`, `invoice_timelogs`, `create preview`, `candidates`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-invoice-create-flow.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

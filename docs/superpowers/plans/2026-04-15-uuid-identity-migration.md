# UUID Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Převést aplikaci z implicitních číselných identit a heuristik typu `contractors[0]` na skutečnou UUID identitu z backendu, nejdřív pro lidi/auth a potom pro zbývající doménové vazby.

**Architecture:** Migraci rozdělíme na dvě bezpečné fáze. Fáze A zavede UUID jako source of truth pro identitu přihlášeného člověka, ale dočasně ponechá legacy číselné `id`/`cid` jako kompatibilní bridge. Fáze B odstraní bridge a přepne UI, AppContext a service vrstvu na UUID napříč contractor/profile vztahy.

**Tech Stack:** React, TypeScript, Supabase Auth, Supabase Postgres, lokální app store (`app-data.ts`), feature services

---

## Scope Check

Plný požadavek „vše na UUID“ zasahuje dvě oddělené oblasti:

1. **Identity / auth / crew linkage**
   - `profiles.id`
   - `profiles.user_id`
   - `contractors[0]`
   - `cid === 1`
   - dev login
   - „moje data“

2. **Entity linkage across the rest of the app**
   - `selectedContractorId`
   - `cid`, `eid`
   - tabulkové lookupy
   - event/project/client/internal selections

Tenhle plán pokrývá obě oblasti, ale striktně ve dvou fázích. **Fáze A musí být dokončená a stabilní dřív, než začneme s Fází B.**

## File Structure

### Files with current UUID blockers

- `src/app/providers/AuthProvider.tsx`
  - Dnes načítá reálný auth profil přes `user_id`, ale dev login i veřejné API dál pracují s číselným `contractor.id`.

- `src/lib/app-data.ts`
  - Dnes při Supabase hydrataci převádí UUID řádky na `index + 1`, čímž vzniká křehký bridge a ztrácí se skutečná identita.

- `src/types.ts`
  - Dnes modeluje `Contractor.id`, `Timelog.cid`, `ReceiptItem.cid`, `Invoice.cid` jako `number`.

- `src/features/crew/services/crew.service.ts`
  - Dnes vrací `contractors` s číselným `id`, detail crew i lookupy filtrují podle `id: number`.

- `src/features/timelogs/services/timelogs.service.ts`
  - Dnes mapuje `contractor_id -> cid:number`.

- `src/features/receipts/services/receipts.service.ts`
  - Dnes mapuje `contractor_id -> cid:number`.

- `src/features/invoices/services/invoices.service.ts`
  - Dnes drží celé batchování a write flow nad `cid:number`, přitom pro Supabase insert už stejně dělá mapování na profile UUID.

- `src/views/MyShiftsView.tsx`
  - Dnes určuje „mne“ přes `const me = contractors[0]`.

- `src/views/TimelogsView.tsx`
  - Dnes `scope === 'mine'` filtruje přes `timelog.cid === 1`.

- `src/views/ReceiptsView.tsx`
  - Dnes `scope === 'mine'` filtruje přes `receipt.cid === 1` a nový draft receipt vytváří s `1` nebo `contractors[0].id`.

- `src/views/InvoicesView.tsx`
  - Dnes `scope === 'mine'` filtruje přes `invoice.cid === 1`.

- `src/views/SettingsView.tsx`
  - Dnes určuje „můj profil“ přes `safeContractors[0]`.

- `src/views/MyShiftsView.tsx`
- `src/components/layout/Sidebar.tsx`
  - Dnes badge počty pro „my-*“ drží přes `cid === 1`.

- `src/context/AppContext.tsx`
  - Dnes drží `selectedContractorId: number | null`, což je legacy UI selection contract.

### Files likely touched in Fázi B

- `src/views/CrewView.tsx`
- `src/views/CrewDetailView.tsx`
- `src/views/EventDetailView.tsx`
- `src/components/modals/AssignCrewModal.tsx`
- `src/components/modals/TimelogEditModal.tsx`
- `src/components/modals/ReceiptEditModal.tsx`
- `src/views/ApprovalsView.tsx`
- `src/views/ProjectStatsView.tsx`
- `src/views/DashboardView.tsx`

### Tests to update or add

- `src/features/timelogs/services/timelogs.service.test.ts`
- `src/features/invoices/services/invoices.service.test.ts`
- new focused auth/identity tests only if needed by current test harness

---

## Phase A: UUID as Source of Truth for Current User

### Task 1: Add explicit UUID identity fields without removing legacy numeric IDs

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/supabase-mappers.ts`
- Modify: `src/lib/app-data.ts`
- Test: `src/features/timelogs/services/timelogs.service.test.ts`
- Test: `src/features/invoices/services/invoices.service.test.ts`

- [ ] **Step 1: Extend TypeScript models with UUID identity fields**

Add these fields while keeping current numeric fields temporarily:

```ts
type Contractor = {
  id: number;
  profileId: string;
  userId?: string | null;
  // existing fields...
};

type Timelog = {
  id: number;
  cid: number;
  contractorProfileId: string;
  // existing fields...
};

type ReceiptItem = {
  id: number;
  cid: number;
  contractorProfileId: string;
  // existing fields...
};

type Invoice = {
  id: string;
  cid: number;
  contractorProfileId: string;
  // existing fields...
};
```

- [ ] **Step 2: Preserve UUIDs during Supabase hydration**

In `src/lib/app-data.ts`, keep numeric compatibility IDs but stop discarding UUIDs:

```ts
const contractors = profileRows.map((row) => ({
  ...mapContractor(row),
  id: profileIdMap.get(row.id) ?? Number.NaN,
  profileId: row.id,
  userId: row.user_id,
}));

const timelogs = timelogRows.map((row) => ({
  ...mapTimelog(row, timelogDayRowsByTimelogId.get(row.id) ?? []),
  id: timelogIdMap.get(row.id) ?? Number.NaN,
  eid: eventIdMap.get(row.event_id) ?? Number.NaN,
  cid: profileIdMap.get(row.contractor_id) ?? Number.NaN,
  contractorProfileId: row.contractor_id,
}));
```

Apply the same pattern to receipts and invoices.

- [ ] **Step 3: Mirror the same UUID metadata in direct service hydrators**

In:
- `src/features/timelogs/services/timelogs.service.ts`
- `src/features/receipts/services/receipts.service.ts`
- `src/features/invoices/services/invoices.service.ts`
- `src/features/crew/services/crew.service.ts`

ensure each Supabase read path preserves `profileId` / `contractorProfileId`, not only the legacy number bridge.

- [ ] **Step 4: Update tests to assert UUID metadata survives hydration**

Extend existing tests with expectations like:

```ts
expect(timelog.contractorProfileId).toBe('profile-uuid-1');
expect(invoice.contractorProfileId).toBe('profile-uuid-1');
expect(contractor.profileId).toBe('profile-uuid-1');
```

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts
npm test -- src/features/invoices/services/invoices.service.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/app-data.ts src/lib/supabase-mappers.ts src/features/crew/services/crew.service.ts src/features/timelogs/services/timelogs.service.ts src/features/receipts/services/receipts.service.ts src/features/invoices/services/invoices.service.ts src/features/timelogs/services/timelogs.service.test.ts src/features/invoices/services/invoices.service.test.ts
git commit -m "Zavedeni UUID metadata pro identity lidi"
```

### Task 2: Expose current authenticated profile identity from auth layer

**Files:**
- Modify: `src/app/providers/AuthProvider.tsx`
- Test: reuse manual auth smoke test

- [ ] **Step 1: Extend auth context with explicit identity fields**

Add:

```ts
interface AuthContextType {
  currentProfileId: string | null;
  currentUserId: string | null;
  currentContractorId: number | null;
  // existing fields...
}
```

- [ ] **Step 2: Resolve profile identity for real Supabase login**

When `profiles` row is loaded by `user_id`, also persist:

```ts
const profileId = profileResult.data?.id ?? null;
setCurrentProfileId(profileId);
setCurrentUserId(nextSession.user.id);

const contractor = (getContractors() ?? []).find((item) => item.profileId === profileId);
setCurrentContractorId(contractor?.id ?? null);
```

- [ ] **Step 3: Resolve profile identity for dev login**

Replace dev session storage:

```ts
type StoredDevSession = {
  id: number;
  profileId: string;
  userId: string | null;
  name: string;
  email: string;
  role: Role;
};
```

and store/load `profileId`.

- [ ] **Step 4: Make dev login options carry both numeric and UUID identity**

```ts
type DevLoginOption = {
  id: number;
  profileId: string;
  name: string;
  email: string;
};
```

- [ ] **Step 5: Run build and manual login smoke test**

Manual check:
- Supabase login exposes profile
- dev login still works
- role stays unchanged

Run:

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/providers/AuthProvider.tsx
git commit -m "Expose authenticated profile identity"
```

### Task 3: Replace `contractors[0]` and `cid === 1` in mine-scoped UI with auth identity

**Files:**
- Modify: `src/views/MyShiftsView.tsx`
- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/ReceiptsView.tsx`
- Modify: `src/views/InvoicesView.tsx`
- Modify: `src/views/SettingsView.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Replace “me” in `MyShiftsView`**

Use auth identity instead of first contractor:

```ts
const { currentProfileId } = useAuth();
const me = safeContractors.find((item) => item.profileId === currentProfileId) ?? null;
const meProfileId = me?.profileId ?? null;

const myTimelogs = safeTimelogs.filter((timelog) => timelog.contractorProfileId === meProfileId);
```

- [ ] **Step 2: Replace mine filters in Timelogs / Receipts / Invoices**

Update:

```ts
const baseTimelogs = scope === 'mine'
  ? timelogs.filter((timelog) => timelog.contractorProfileId === currentProfileId)
  : timelogs;
```

Do the same in:
- `ReceiptsView.tsx`
- `InvoicesView.tsx`

- [ ] **Step 3: Replace sidebar “my-*” counters**

Change:

```ts
safeTimelogs.filter((t) => t.contractorProfileId === currentProfileId && ...)
safeInvoices.filter((i) => i.contractorProfileId === currentProfileId && ...)
safeReceipts.filter((r) => r.contractorProfileId === currentProfileId && ...)
```

- [ ] **Step 4: Replace Settings “my profile” heuristic**

Change:

```ts
const me = safeContractors.find((item) => item.profileId === currentProfileId) ?? null;
```

instead of `safeContractors[0]`.

- [ ] **Step 5: Run build and manual smoke tests**

Manual checks:
- `Moje směny`
- `Moje timelogy`
- `Moje účtenky`
- `Moje faktury`
- Settings profile
- Sidebar counters

Run:

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/views/MyShiftsView.tsx src/views/TimelogsView.tsx src/views/ReceiptsView.tsx src/views/InvoicesView.tsx src/views/SettingsView.tsx src/components/layout/Sidebar.tsx
git commit -m "Nahradit mine scope auth UUID identitou"
```

---

## Phase B: Remove contractor numeric identity from crew-facing UI contracts

### Task 4: Migrate contractor selection state from `number` to `profileId`

**Files:**
- Modify: `src/context/AppContext.tsx`
- Modify: `src/views/CrewView.tsx`
- Modify: `src/views/CrewDetailView.tsx`
- Modify: `src/features/crew/services/crew.service.ts`

- [ ] **Step 1: Change selection state contract**

Replace:

```ts
selectedContractorId: number | null;
setSelectedContractorId: (id: number | null) => void;
```

with:

```ts
selectedContractorProfileId: string | null;
setSelectedContractorProfileId: (id: string | null) => void;
```

- [ ] **Step 2: Update crew detail lookup**

Add service helper:

```ts
export const getCrewByProfileId = (profileId: string | null): CrewMember | null => (
  profileId == null ? null : (getLocalAppState().contractors ?? []).find((member) => member.profileId === profileId) ?? null
);
```

Use this in `CrewDetailView`.

- [ ] **Step 3: Update row click handlers**

Replace:

```ts
onClick={() => setSelectedContractorId(contractor.id)}
```

with:

```ts
onClick={() => setSelectedContractorProfileId(contractor.profileId)}
```

- [ ] **Step 4: Run build and crew smoke test**

Run:

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/context/AppContext.tsx src/views/CrewView.tsx src/views/CrewDetailView.tsx src/features/crew/services/crew.service.ts
git commit -m "Prepnuti crew selection na profile UUID"
```

### Task 5: Replace remaining contractor-facing UI lookups with UUID-aware helpers

**Files:**
- Modify: `src/components/modals/TimelogEditModal.tsx`
- Modify: `src/components/modals/ReceiptEditModal.tsx`
- Modify: `src/components/modals/AssignCrewModal.tsx`
- Modify: `src/views/ApprovalsView.tsx`
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/ProjectStatsView.tsx`
- Modify: `src/views/EventDetailView.tsx`

- [ ] **Step 1: Keep current UI display, change internal contractor matching**

Pattern:

```ts
const contractor = contractors.find((item) => item.profileId === timelog.contractorProfileId)
  ?? contractors.find((item) => item.id === timelog.cid)
  ?? null;
```

Use the UUID branch first everywhere contractor lookup is display-only.

- [ ] **Step 2: Update assigned crew matching in event flows**

In `AssignCrewModal.tsx`, build assigned sets from `contractorProfileId` when available before falling back to `cid`.

- [ ] **Step 3: Run build and smoke test read-only screens**

Manual check:
- approvals
- project stats
- dashboard pending lists
- event detail
- edit modals

Run:

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/TimelogEditModal.tsx src/components/modals/ReceiptEditModal.tsx src/components/modals/AssignCrewModal.tsx src/views/ApprovalsView.tsx src/views/DashboardView.tsx src/views/ProjectStatsView.tsx src/views/EventDetailView.tsx
git commit -m "UUID aware contractor lookups in UI"
```

### Task 6: Migrate service write paths away from numeric contractor bridge

**Files:**
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/features/invoices/services/invoices.service.ts`
- Test: `src/features/timelogs/services/timelogs.service.test.ts`
- Test: `src/features/invoices/services/invoices.service.test.ts`

- [ ] **Step 1: Resolve contractor row IDs from `contractorProfileId` first**

Whenever service writes to Supabase, replace:

```ts
const contractorRowId = profileIdMap.get(invoice.cid);
```

with:

```ts
const contractorRowId = invoice.contractorProfileId
  ?? profileIdMap.get(invoice.cid)
  ?? null;
```

Apply the same principle to timelog and receipt writes.

- [ ] **Step 2: Stop generating write intent from `cid === 1` assumptions**

Any “current user” write flow must read:

```ts
const { currentProfileId } = useAuth();
```

or receive explicit UUID-backed selection input.

- [ ] **Step 3: Add regression expectations**

Examples:

```ts
expect(payload.contractor_id).toBe('profile-uuid-1');
expect(createdInvoice.contractorProfileId).toBe('profile-uuid-1');
```

- [ ] **Step 4: Run focused tests and build**

Run:

```bash
npm test -- src/features/timelogs/services/timelogs.service.test.ts
npm test -- src/features/invoices/services/invoices.service.test.ts
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/features/timelogs/services/timelogs.service.ts src/features/receipts/services/receipts.service.ts src/features/invoices/services/invoices.service.ts src/features/timelogs/services/timelogs.service.test.ts src/features/invoices/services/invoices.service.test.ts
git commit -m "Prepnuti contractor write flow na UUID"
```

---

## Phase C: Remove numeric bridge from contractor linkage

### Task 7: Rename legacy fields and make UUID the primary contractor relation

**Files:**
- Modify: `src/types.ts`
- Modify: all files still reading `cid`

- [ ] **Step 1: Replace legacy contractor relation field names**

End state:

```ts
type Timelog = {
  contractorId: string;
}

type ReceiptItem = {
  contractorId: string;
}

type Invoice = {
  contractorId: string;
}
```

Legacy `cid` stays only if a temporary codemod step is needed, but must be removed before this task closes.

- [ ] **Step 2: Global replace by domain, not by blind search**

Order:
- timelogs
- receipts
- invoices
- views
- tests

- [ ] **Step 3: Remove fallback branches**

Delete all code shaped like:

```ts
item.profileId === row.contractorProfileId || item.id === row.cid
```

and keep only UUID branches.

- [ ] **Step 4: Run full build + highest-value smoke tests**

Run:

```bash
npm run build
```

Manual smoke:
- login
- moje sekce
- approvals
- create invoice flow
- send/paid invoice flow
- timelog submit/approve flow

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Odstraneni numeric contractor bridge"
```

---

## Risks to Watch

1. **Dev login**
   - Dnes je pořád vázaný na numeric contractor ID.
   - Pokud se neprovede Task 2 správně, rozbije se testovací login režim.

2. **Mine filters**
   - Dnes běží přes `cid === 1`.
   - Tohle je největší runtime regresní riziko v `TimelogsView`, `ReceiptsView`, `InvoicesView`, `Sidebar`, `MyShiftsView`.

3. **Store hydration**
   - `app-data.ts` dnes dělá `index + 1`.
   - Pokud se UUID metadata nepřenesou do snapshotu konzistentně, UI bude mít míchané identity.

4. **Invoice write flow**
   - Už dnes částečně mapuje numeric -> UUID.
   - Při poloviční migraci hrozí dvojité nebo špatné mapování contractora.

5. **Crew detail navigation**
   - `selectedContractorId` je dnes UI contract.
   - Přepnutí na UUID musí být provedeno koordinovaně s view i contextem.

---

## Self-Review

**Spec coverage:** Plán pokrývá:
- odstranění `contractors[0]`
- odstranění `cid === 1`
- zavedení skutečné auth identity
- přechod AppContext crew selection na UUID
- přechod write flow na UUID-backed contractor relation
- finální odstranění numeric bridge

**Placeholder scan:** Nejsou použity `TODO`, `TBD`, „nějak upravit“ ani odkazy bez konkrétního souboru nebo kroku.

**Type consistency:** Plán záměrně používá:
- `profileId` pro identitu řádku v `profiles`
- `userId` pro vazbu na `auth.users`
- `contractorProfileId` jako přechodové pole v doménových modelech
- finální `contractorId: string` až v poslední fázi

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-uuid-identity-migration.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

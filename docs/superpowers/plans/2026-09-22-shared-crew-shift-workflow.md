# Shared Crew Shift Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Umožnit produkci propojit související směny a dát každému přiřazenému členovi crew jednu společnou evidenci a jedno atomické kolo odeslání/schválení, aniž by se tím vytvořila faktura.

**Architecture:** Zavést samostatnou doménu `shift-workflows`, která nevyužívá historické `billing_groups`. Propojení ukládá jen přesné UUID akcí; společný editor nad nimi pracuje s kanonickými výkazy konkrétního člověka. Odeslání vytvoří neměnné kolo s přesným seznamem výkazů a všechny zápisy i změny stavů proběhnou v jedné databázové transakci přes úzce zaměřené `SECURITY INVOKER` RPC. Nepropojená směna dál funguje jako jednopoložkový kontext. Starý trigger automatické faktury se odstraní, takže schválené hodiny zůstanou `approved` až do samostatné fakturační operace.

**Tech Stack:** React 18, TypeScript 5.8, Vite 8, TanStack Query 5, Vitest/Testing Library, Supabase JS 2, PostgreSQL 17, RLS, pgTAP, Capacitor iOS.

---

## Implementation checkpoint — 2026-09-23

User selected variant 1 (subagent-driven implementation). Worktree now includes current `main` (`dd18900`) through merge `25a3353`. Preserve the unrelated dirty main-checkout files; they were not merged or edited.

The following verified current-code adaptations override older illustrative code below:

- Targeted approvals are already implemented by `20260914135908_targeted_event_approval.sql`: CH hands off to the event's configured single COO, whose profile **and auth-user identity** are frozen. Keep those rules and existing legacy-report compatibility. Do not reimplement a parallel approval system.
- A shared submission round freezes the exact person's timelog set. It is separate from targeted `approval_round_id`, which must remain unique per timelog. Reuse existing batch handoff/resolution internals behind exact-set guards. All configured approvers in a shared handoff must be compatible; otherwise explain the conflict without choosing the anchor's approver or silently dropping members.
- Current permissions keep COO read-only for hour contents. The shared correction path is CH at `pending_ch`; do not implement the obsolete illustrative COO correction row below. CH handoff action is named `handoff`, distinct from COO `approve`.
- Guard old RPCs/direct writes as well as new wrappers, so a shared round cannot be advanced one member at a time. Do not rely on caller-writable session settings as authorization. Review lock ordering against existing event deletion and assignment mutations; current handoff deliberately locks timelogs without locking events afterward.
- `trg_timelog_approved` is already removed by the targeted approval migration. Task 6 therefore verifies separation from invoicing; it must not create duplicate suppression or change explicit invoicing.
- Preserve schedule-v2 blank times, free days, and multiple slots. Reuse `assertTimelogComplete` for submitted evidence, while allowing incomplete draft sections.
- The old billing Docker context no longer exists. The verified local-only schema fixture is container `crewflow-event-form-db`, image `public.ecr.aws/supabase/postgres:17.6.1.104`, no mounts, bound only to `127.0.0.1:55439`. Its persistent schema-only pre-feature backup is `/Users/peetax/Projekty/crewflow-local-backups/mobile-event-form/schema-before-20260904.sql`. Inspect migration state before replaying anything.
- Routine local implementation, tests, main integration, and development-device refresh remain within the approved workflow. New remote Staff schema rollout still requires the concrete scope approval specified by the accepted design, after local implementation and verification.

Task 0: isolated worktree and previous baseline verified; fresh main incorporated. Task 1: implemented at `74d3322` + `657b74a`, independent spec and quality reviews approved; 76 model tests pass. Required frozen round `eventIds` were added alongside `timelogIds` so missing/replaced singleton reports cannot make an active round disappear. Tasks 3–4 database foundation are underway. No new remote schema change has been made.

Checkpoint update: Tasks 3–4 database foundation is implemented in `e22e15b` + `da5bcfd` and independently approved by spec and quality reviews. A positive internal `expected_item_count` preserves the original round cardinality and rejects partial history loss. The actual role/ACL/transaction/concurrency evidence is in `supabase/tests/shared_shift_workflows.verification.md`. Public read/membership JSON is authoritative; new-workflow input ID is null and the server allocates the ID. Generated database types are deferred until lifecycle RPCs settle.

Task 2 privacy slice `ef2a04b` + `0683d9e` is independently reviewed (40 tests). It removes evidence from session storage, masks/retire callbacks immediately on identity/role change, and scrubs legacy storage after commit rather than mutating a repeatable render initializer. Client gateway/local adapter/selection/query-scope work `7e0a4ef` + `964e34f` + `91c40bd` is now independently approved by spec and quality reviews (157 focused tests). Query reload uses the captured query key/read function rather than a mutable observer, including layout-effect calls during an identity change. The last full suite passed 122 files / 1,481 tests before the following UI work.

Task 5 server lifecycle is committed in `0e5683e` and undergoing independent spec review. Its authoritative protocol/evidence is in `supabase/tests/shared_shift_workflows.verification.md`; use that rather than the old illustrative RPC arguments below. Task 7 crew management UI is implemented locally and entering review: exact assignment-based candidates, retained existing members, affected-source preflight, explicit move/cross-project acknowledgement, immutable retry, conflict reload preserving selection with a new review, and scope/person-keyed editor retirement. CrewDetail shows management and per-card link badges; EventDetail no longer mounts the legacy billing editor. Historical billing files/data are retained. Latest related run: 239 tests in 11 files; focused lint clean; app typecheck has the same 116 pre-existing diagnostics (one test line offset only). Shared evidence controller/form, lifecycle client integration, device/visual verification, and final remote rollout approval remain outstanding. This is not yet a completed feature or a deployed app update.

Local test-harness note: Vite 8/Rolldown configuration bundling intermittently stalled before Vitest's RUN banner. A process sample showed an idle event loop and waiting Rolldown workers; the same original configuration runs through Vite's supported runner loader. No repository configuration was changed. Reliable command from this worktree: `node --input-type=module -e 'globalThis.__dirname = process.cwd(); process.argv = ["node", "vitest", "run", "--maxWorkers=1", "--configLoader=runner"]; await import("./node_modules/vitest/vitest.mjs");'`. The temporary global supplies the existing config's `__dirname` under the runner. Two verified stalled test processes were stopped; neither app previews nor other tasks were stopped.

Fresh baseline evidence: the single-worker suite at the merged baseline passed all **117 pre-existing files / 1,314 pre-existing tests**. The run also picked up Task 1's intentionally RED tests (46 failures, 18 passes), so it is not a passing feature-suite result. Actual app typecheck (`tsc -p tsconfig.app.json --noEmit`) still reports pre-existing broad diagnostics; root reference-only `tsc --noEmit` is not valid verification. Isolated database `crewflow_shared_shift_tests` was cloned from the empty `crewflow_approval_green` schema in the local container; the current rollback-only `targeted-event-approval.sql` passed there. Never alter the source databases as part of shared-workflow tests.

Implementation order adjustment: after Task 1 reviews, establish the schema/read/membership server contract (Tasks 3–4) before the client gateway in Task 2. This avoids designing the client against obsolete approval RPC assumptions. Public RPCs remain invoker wrappers; where an unforgeable private write capability is needed, follow the existing targeted-approval architecture (narrow private definer with authoritative actor/role/exact-set checks and revoked default ACL), not caller-writable session settings or broad table write grants.

## Rozsah a pevné hranice

Tento plán implementuje pouze etapu 1 schváleného návrhu v `docs/superpowers/specs/2026-09-04-shared-crew-workflow-and-invoice-selection-design.md`:

- produkce (`crewhead`, `coo`) propojí související směny z detailu člena crew;
- člen crew z libovolné své propojené směny otevře stejný editor;
- editor ukáže pouze směny, na které je tento člověk skutečně přiřazen;
- rozpracované části se ukládají společně a odesílají jako jedno přesné kolo;
- CrewHead a COO schvalují nebo vracejí vždy celé aktuální kolo jedním atomickým krokem;
- schválení hodin nevystaví fakturu, nepřipojí účtenky a nic nepošle účetní.

Mimo rozsah zůstávají individuální výběr podkladů pro fakturu, nahrání/vytěžení faktury, PowerApps integrace a změna určování schvalovatelů. Existující tabulky `billing_groups*` a jejich data se nemažou ani automaticky nepřevádějí. Nové vzdálené schéma vyžaduje konkrétní schválení rozsahu po lokálním ověření. Běžná integrace do `main` a aktualizace vývojových instalací se řídí schváleným pracovním postupem a `AGENTS.md`.

## Doménový kontrakt

Použij tyto názvy konzistentně v TypeScriptu, SQL i UI:

```ts
export type ShiftWorkflowId = string;

export interface ShiftWorkflow {
  id: ShiftWorkflowId;
  eventIds: string[];
  updatedAt: string;
}

export type ShiftWorkflowRoundStatus =
  | 'pending_ch'
  | 'pending_crew_confirmation'
  | 'pending_coo'
  | 'approved'
  | 'rejected';

export interface ShiftWorkflowRound {
  id: string;
  workflowId: ShiftWorkflowId | null;
  contractorProfileId: string;
  status: ShiftWorkflowRoundStatus;
  eventIds: string[];
  timelogIds: string[];
  note: string;
  updatedAt: string;
}

export interface ShiftWorkflowContext {
  workflowId: ShiftWorkflowId | null;
  contractorProfileId: string;
  anchorEventId: string;
  eventIds: string[];
  timelogs: Timelog[];
  activeRound: ShiftWorkflowRound | null;
}
```

Pravidla:

1. Jedna akce může být nejvýše v jednom aktivním propojení.
2. Žádný název skupiny se neukládá; popisek se odvozuje z názvů směn, datumů a jobnumber bez duplicitního názvu.
3. Kontext crew vzniká průnikem členství propojení a autoritativního přiřazení konkrétního profilu. Nepřiřazená směna se nesmí ani vrátit z crew read RPC.
4. Nepropojená směna má `workflowId: null` a jedinou část, ale používá stejný editor a stejný kontrakt odeslání.
5. Odeslané kolo zmrazí přesnou množinu `timelog_id`. Později přidané přiřazení do něj nevstoupí.
6. Změna propojení je povolena jen pokud všechny výkazy všech lidí na dotčených akcích jsou stále `draft`, nemají žádnou historii kola a nejsou v `invoice_timelogs`.
7. Každé uložení, odeslání a rozhodnutí porovnává očekávané `updated_at`; konflikt jediné části ruší celou transakci.
8. `rejected` zachová hodnoty a důvod. Nové odeslání založí nové kolo; staré kolo a jeho akce zůstanou v historii.
9. `pending_ch -> pending_crew_confirmation` je společná korekce CrewHead. Crew ji po případném doplnění potvrdí zpět do `pending_ch` v témže kole; action log zachová oba kroky a celý schvalovací řetězec začne znovu od CrewHead. COO hodnoty hodin nemění.
10. `pending_coo -> approved` ponechá každý výkaz ve stavu `approved`. Stav `invoiced` nastaví až existující explicitní vytvoření faktury.

## Task 0: Zajistit opakovatelný výchozí stav a bezpečné pracovní prostředí

**Files:**

- Verify: `AGENTS.md`
- Verify: `package.json`
- Verify: `supabase/tests/billing_groups.verification.md`
- Verify: `docs/superpowers/specs/2026-09-04-shared-crew-workflow-and-invoice-selection-design.md`

- [ ] **Step 1: Pracuj pouze v připraveném worktree**

Použij:

```bash
cd /Users/peetax/Projekty/crewflow/.worktrees/shared-crew-workflow
git status --short --branch
git rev-parse --show-toplevel
```

Expected: branch `codex/shared-crew-workflow-plan`; žádná změna mimo plán. Před implementací zkontroluj, zda `main` nepřidal novější změny, a případnou integraci proveď bez přepsání uživatelských úprav v `ios/App/App/Info.plist`, `src/views/TimelogsView.tsx` a `src/views/TimelogsView.test.tsx`.

- [ ] **Step 2: Zopakuj výchozí testy řízeně**

```bash
npm test -- --run --maxWorkers=1 --reporter=dot
```

Expected baseline: `101 passed`, `988 passed`. Paralelní běh je v tomto prostředí známý zdroj pětisekundových timeoutů, proto není rovnocenným baseline důkazem.

- [ ] **Step 3: Ověř aktuální Supabase CLI místo hádání příkazů**

```bash
supabase --version
supabase migration new --help
supabase db reset --help
supabase test db --help
supabase db lint --help
supabase db advisors --help
supabase gen types --help
```

Expected: všechny později použité příkazy a přepínače existují v nainstalované verzi. Před SQL implementací znovu zkontroluj aktuální Supabase changelog a dokumentaci migrací, RLS a databázových testů. Zohledni změnu z roku 2026: Data API vyžaduje explicitní `GRANT`; RLS samotné tabulku nezpřístupní.

Repozitář záměrně nemá `supabase/config.toml`. Databázové testy proto nepouštěj z rootu proti neznámému či připojenému projektu. Použij výhradně disposable lokální harness popsaný v `supabase/tests/billing_groups.verification.md`, ověř jeho prázdný feature state a lokální loopback spojení, nebo předem vytvoř nový stejně izolovaný harness. Každý níže uvedený `supabase db reset`, `supabase test db`, lint, advisor a type-generation příkaz se spouští v tomto disposable harnessu nad kopií aktuálních repo migrací; nikdy ne s `--linked`.

- [ ] **Step 4: Commitni pouze případnou aktualizaci plánu, ne aplikační kód**

```bash
git add docs/superpowers/plans/2026-09-22-shared-crew-shift-workflow.md
git commit -m "docs: plan shared crew shift workflow"
```

## Task 1: Přidat čistý doménový model a resolver společného kontextu

**Files:**

- Create: `src/features/shift-workflows/shift-workflows.model.ts`
- Create: `src/features/shift-workflows/shift-workflows.model.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Napiš selhávající modelové testy**

Pokryj minimálně:

```ts
it('resolves the same workflow from every linked assigned event', () => {
  expect(resolveShiftWorkflowContext(fixtureFrom('prep')))
    .toEqual(resolveShiftWorkflowContext(fixtureFrom('install')));
});

it('omits linked events where the contractor has no assignment', () => {
  expect(resolveShiftWorkflowContext(twoOfThree).eventIds)
    .toEqual(['event-prep', 'event-install']);
});

it('returns an implicit singleton for an unlinked event', () => {
  expect(resolveShiftWorkflowContext(single).workflowId).toBeNull();
});

it('does not infer a workflow from equal job numbers, names or dates', () => {
  expect(resolveShiftWorkflowContext(equalMetadata).eventIds)
    .toEqual(['event-a']);
});

it('sorts sections by event start and UUID for a stable editor', () => {
  expect(resolveShiftWorkflowContext(unsorted).eventIds)
    .toEqual(['event-prep', 'event-install', 'event-deinstall']);
});
```

- [ ] **Step 2: Spusť test a ověř RED**

```bash
npm test -- --run src/features/shift-workflows/shift-workflows.model.test.ts --reporter=dot
```

Expected: FAIL, protože modul a resolver ještě neexistují.

- [ ] **Step 3: Implementuj model bez Reactu a bez přístupu k databázi**

Exportuj:

```ts
export const resolveShiftWorkflowContext = (input: {
  anchorEventId: string;
  contractorProfileId: string;
  workflows: ShiftWorkflow[];
  assignments: EventCrewAssignment[];
  events: Event[];
  timelogs: Timelog[];
  rounds: ShiftWorkflowRound[];
}): ShiftWorkflowContext;

export const formatShiftWorkflowLabel = (
  context: ShiftWorkflowContext,
  events: Event[],
): string;

export const validateShiftWorkflowSubmission = (
  context: ShiftWorkflowContext,
): Array<{ eventId: string; message: string }>;
```

Resolver musí používat stabilní `event.supabaseId`, `timelog.supabaseId` a `contractorProfileId`. Lokální číselná ID používej jen pro zobrazení a mapování existujících dat, nikdy jako vzdálené oprávnění.

- [ ] **Step 4: Ověř GREEN**

```bash
npm test -- --run src/features/shift-workflows/shift-workflows.model.test.ts --reporter=dot
npx tsc --noEmit
```

Expected: oba příkazy projdou.

- [ ] **Step 5: Commit**

```bash
git add src/features/shift-workflows/shift-workflows.model.ts src/features/shift-workflows/shift-workflows.model.test.ts src/types.ts
git commit -m "feat: model shared shift workflows"
```

## Task 2: Přidat scope-safe čtení, lokální adaptér a cache

**Files:**

- Create: `src/features/shift-workflows/shift-workflows.gateway.ts`
- Create: `src/features/shift-workflows/shift-workflows.gateway.test.ts`
- Create: `src/features/shift-workflows/shift-workflows.local.ts`
- Create: `src/features/shift-workflows/shift-workflows.local.test.ts`
- Create: `src/features/shift-workflows/useShiftWorkflows.ts`
- Create: `src/features/shift-workflows/useShiftWorkflows.test.tsx`
- Modify: `src/context/AppContext.tsx`
- Modify: `src/context/AppContext.test.tsx`
- Modify: `src/context/ui-session-storage.ts`
- Modify: `src/context/ui-session-storage.test.ts`

- [ ] **Step 1: Napiš failing testy kontraktu čtení**

Požadované případy:

```ts
it('keys cached workflow data by authenticated user and effective role', () => {
  expect(shiftWorkflowQueryKey({ userId: 'u1', role: 'crew' }))
    .not.toEqual(shiftWorkflowQueryKey({ userId: 'u1', role: 'coo' }));
});

it('rejects malformed or over-broad crew snapshots', async () => {
  gatewayResult.groups[0].events.push(unassignedEvent);
  await expect(readShiftWorkflowSnapshot(crewScope)).rejects.toThrow(
    'Propojené směny se nepodařilo bezpečně načíst.',
  );
});

it('clears workflow queries and closes evidence on role change or sign out', async () => {
  // Assert modal target is null and prior scope query data was removed.
});

it('does not persist timelog contents in ui session storage', () => {
  expect(serializeUiSession(sessionWithOpenEvidence)).not.toContain('contractorProfileId');
});
```

- [ ] **Step 2: Ověř RED**

```bash
npm test -- --run \
  src/features/shift-workflows/shift-workflows.gateway.test.ts \
  src/features/shift-workflows/shift-workflows.local.test.ts \
  src/features/shift-workflows/useShiftWorkflows.test.tsx \
  src/context/AppContext.test.tsx \
  src/context/ui-session-storage.test.ts --reporter=dot
```

- [ ] **Step 3: Implementuj explicitní gateway a query scope**

Gateway nesmí volat tabulky přímo. Použij jediný read RPC:

```ts
export interface ShiftWorkflowScope {
  userId: string;
  profileId: string | null;
  role: Role;
}

export const shiftWorkflowQueryKey = (scope: ShiftWorkflowScope) => [
  'shift-workflows',
  scope.userId,
  scope.profileId ?? 'no-profile',
  scope.role,
] as const;

export async function readShiftWorkflowSnapshot(
  scope: ShiftWorkflowScope,
): Promise<ShiftWorkflowSnapshot> {
  const { data, error } = await requireSupabase().rpc('read_shift_workflows');
  if (error) throw mapShiftWorkflowError(error);
  return parseShiftWorkflowSnapshot(data, scope);
}
```

Lokální adaptér musí zrcadlit stejnou viditelnost, idempotenci a konflikty. Nesmí být benevolentnější než server jen proto, že běží bez Supabase.

- [ ] **Step 4: Zabraň návratu starého editoru po změně identity**

`editingTimelog` se už nesmí serializovat do `ui-session-storage`. Při změně autentizovaného uživatele nebo testovací role nastav `setEditingTimelog(null)` a odstraň předchozí query scope. Vývojový přepínač rolí zůstává, ale není bezpečnostní hranicí.

- [ ] **Step 5: Ověř GREEN a commit**

```bash
npm test -- --run \
  src/features/shift-workflows/shift-workflows.gateway.test.ts \
  src/features/shift-workflows/shift-workflows.local.test.ts \
  src/features/shift-workflows/useShiftWorkflows.test.tsx \
  src/context/AppContext.test.tsx \
  src/context/ui-session-storage.test.ts --reporter=dot
npx tsc --noEmit
git add src/features/shift-workflows src/context/AppContext.tsx src/context/AppContext.test.tsx src/context/ui-session-storage.ts src/context/ui-session-storage.test.ts
git commit -m "feat: load shift workflows by authenticated scope"
```

## Task 3: Vytvořit databázové schéma pro propojení a neměnná kola

**Files:**

- Create via Supabase CLI: migration ending in `shared_shift_workflows.sql`
- Create: `supabase/tests/shared_shift_workflows.test.sql`
- Modify after local type generation: `src/lib/database.types.ts`

- [ ] **Step 1: Nejprve napiš pgTAP kontrakt, který na starém schématu selže**

Test musí očekávat tyto objekty:

```sql
public.shift_workflows
public.shift_workflow_events
public.shift_workflow_state
public.shift_workflow_requests
public.shift_workflow_rounds
public.shift_workflow_round_items
public.shift_workflow_round_actions
public.read_shift_workflows()
public.save_shift_workflow_atomic(...)
public.save_shift_workflow_drafts_atomic(...)
public.submit_shift_workflow_round_atomic(...)
public.transition_shift_workflow_round_atomic(...)
```

Přidej assertions pro RLS, explicitní ACL, cizího crew uživatele, CrewHead, COO, anonymní roli a nemožnost přímých zápisů do všech sedmi tabulek.

- [ ] **Step 2: Ověř RED proti lokální disposable databázi**

Nejprve zjisti podporované CLI příkazy v Tasku 0, pak spusť lokální stack/reset a:

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
```

Expected: test selže pouze kvůli chybějícím novým objektům.

- [ ] **Step 3: Nech CLI vytvořit název migrace**

```bash
supabase migration new shared_shift_workflows
```

Použij přesnou cestu vypsanou CLI pro celý zbytek implementace. Nevymýšlej timestamp ručně.

- [ ] **Step 4: Implementuj tabulky, klíče a indexy v jedné transakční migraci**

Minimální schéma:

```sql
create table public.shift_workflows (
  id uuid primary key,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shift_workflow_events (
  event_id uuid primary key references public.events(id) on delete restrict,
  workflow_id uuid not null references public.shift_workflows(id) on delete restrict,
  position integer not null check (position >= 0),
  unique (workflow_id, position)
);
create index shift_workflow_events_workflow_id_idx
  on public.shift_workflow_events(workflow_id, position, event_id);

create table public.shift_workflow_rounds (
  id uuid primary key,
  workflow_id uuid references public.shift_workflows(id) on delete restrict,
  contractor_id uuid not null references public.profiles(id) on delete restrict,
  status public.timelog_status not null check (
    status in ('pending_ch','pending_crew_confirmation','pending_coo','approved','rejected')
  ),
  review_note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shift_workflow_rounds_contractor_idx
  on public.shift_workflow_rounds(contractor_id, created_at desc);

create table public.shift_workflow_round_items (
  round_id uuid not null references public.shift_workflow_rounds(id) on delete restrict,
  timelog_id uuid not null references public.timelogs(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  position integer not null check (position >= 0),
  released_at timestamptz,
  primary key (round_id, timelog_id),
  unique (round_id, position)
);
create unique index shift_workflow_round_items_one_active_round_idx
  on public.shift_workflow_round_items(timelog_id)
  where released_at is null;
```

`shift_workflow_state` drží optimistickou revizi pro změny členství. `shift_workflow_requests` ukládá `request_id`, `actor_id`, přesný payload a přesný result pro idempotentní opakování. `shift_workflow_round_actions` ukládá `round_id`, `actor_id`, volitelné `event_id` označující dotčenou část, `action`, `from_status`, `to_status`, `note` a `created_at`; nemění historická rozhodnutí.

- [ ] **Step 5: Přidej RLS a explicitní oprávnění**

Všem novým tabulkám zapni RLS, zruš implicitní práva `public` a `anon`. Protože RPC jsou `SECURITY INVOKER`, přiděl `authenticated` jen nezbytná tabulková práva, ale každý přímý write zablokuj RLS a guard triggerem vyžaduj úzký transakční marker, který nastavuje pouze konkrétní RPC po ověření role, vlastnictví a exact setu. Marker není autorizace; autoritativní role a row predicates musí platit současně. Manager smí číst celé propojení, crew jen svoje průniky a kola. RPC budou `SECURITY INVOKER`, `SET search_path = ''`, se schema-qualified názvy. `EXECUTE` odeber `public, anon` a přiděl explicitně pouze `authenticated`.

- [ ] **Step 6: Implementuj `read_shift_workflows()` bez úniku cizích dat**

Manager result obsahuje všechna propojení a relevantní kola. Crew result smí obsahovat jen:

```sql
where round_row.contractor_id = public.current_profile_id()
   or exists (
     select 1
     from public.event_assignments assignment
     where assignment.event_id = member.event_id
       and assignment.profile_id = public.current_profile_id()
   )
```

Funkce musí vracet stabilní `[]`, nikoli `null`, a deterministicky řadit workflow, eventy, kola, položky i akce.

- [ ] **Step 7: Ověř schéma, vygeneruj typy a commitni**

```bash
supabase db reset
supabase test db supabase/tests/shared_shift_workflows.test.sql
supabase db lint --local --schema public --level warning --fail-on error
supabase db advisors --local
supabase gen types --local --lang typescript --schema public > /private/tmp/crewflow-shift-workflows.database.types.ts
```

Porovnej dočasný soubor s `src/lib/database.types.ts`, přenes pouze autoritativně vygenerovaný výsledek a zkontroluj diff. Expected: schéma se od nuly přehraje, pgTAP projde, nevznikne nový security advisor finding a TypeScript typy obsahují všech sedm tabulek a pět RPC.

```bash
git add supabase/migrations supabase/tests/shared_shift_workflows.test.sql src/lib/database.types.ts
git commit -m "feat: add shared shift workflow schema"
```

## Task 4: Implementovat atomické propojení směn a jeho konfliktní pravidla

**Files:**

- Modify: CLI-created `supabase/migrations/*_shared_shift_workflows.sql`
- Expand: `supabase/tests/shared_shift_workflows.test.sql`
- Create: `supabase/tests/shared_shift_workflows.concurrency.mjs`
- Create: `src/features/shift-workflows/shift-workflow-mutation-rpc.service.ts`
- Create: `src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts`

- [ ] **Step 1: Přidej failing SQL a klientské testy změny členství**

SQL scénáře:

- Crew nesmí vytvořit, změnit ani smazat propojení.
- CrewHead a COO mohou propojit dvě či více přesně identifikovaných akcí.
- Stejné jobnumber nic nepropojí automaticky; různá jobnumber nejsou blokace.
- Přesun eventu z jiného workflow vyžaduje `confirm_moves = true`.
- Cross-project propojení vyžaduje `confirm_cross_project = true`.
- Odstraněný člen musí mít také očekávanou verzi; chybějící nebo extra klíč je konflikt.
- Jakýkoliv non-`draft` timelog, existující round item nebo `invoice_timelogs` blokuje změnu všech dotčených eventů.
- Chybějící/neviditelný event vrátí obecnou nedostupnost, ne informaci o cizí akci.
- Stejný `request_id` + stejný payload vrátí totožný výsledek; jiný payload je invalid.
- Selhání po zápisu headeru vrátí celou transakci včetně request ledgeru a revize.

Klientský parser nesmí přijmout částečný či typově chybný JSON.

- [ ] **Step 2: Ověř RED**

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
npm test -- --run src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts --reporter=dot
```

- [ ] **Step 3: Implementuj `save_shift_workflow_atomic`**

Kontrakt:

```sql
public.save_shift_workflow_atomic(
  p_request_id uuid,
  p_workflow_id uuid,
  p_event_ids uuid[],
  p_expected_revision integer,
  p_event_versions jsonb,
  p_confirm_cross_project boolean,
  p_confirm_moves boolean,
  p_delete boolean
) returns jsonb
```

Postup uvnitř jedné transakce:

1. ověř autentizaci a autoritativní `crewhead|coo` přes `public.has_role`;
2. zamkni singleton revizi;
3. vyřeš idempotentní replay až po shodě aktéra i přesného payloadu;
4. seřaď a `FOR SHARE` zamkni všechny současné i nové eventy;
5. vyžaduj přesnou množinu version keys a shodu `events.updated_at`;
6. zamkni všechny timelogy dotčených eventů a povol jen `draft` bez round/history/invoice vazby;
7. ověř potvrzení přesunu a cross-project dopadu;
8. zapiš header/membership, revizi a request ledger;
9. vrať `{request_id, workflow_id, revision}`.

Použij úzký interní marker pro ochranu přímých zápisů stejně jako u stávajících billing groups, ale nepovažuj jej za autorizaci. Autoritativní role, RLS, exact-set validace a locky zůstávají povinné.

- [ ] **Step 4: Implementuj klientský RPC wrapper**

```ts
export async function saveShiftWorkflowAtomicRpc(
  input: SaveShiftWorkflowRpcInput,
): Promise<{ requestId: string; workflowId: string; revision: number }>;
```

Mapuj jen známé tokeny (`shift_workflow_invalid`, `unauthorized`, `conflict`, `blocked`, `move_confirmation`, `cross_project_confirmation`, `unavailable`) na české doménové zprávy. Neočekávaný raw database error zaloguj jen interně a uživateli vrať obecnou zprávu.

- [ ] **Step 5: Dokaž skutečný souběh dvou spojení**

`shared_shift_workflows.concurrency.mjs` musí spustit dvě lokální PostgreSQL session nad prázdnou disposable feature state:

- A vezme lock a zapíše revizi N+1 bez commitu;
- B se prokazatelně objeví v `pg_stat_activity` jako čekající na lock;
- po commitu A se B vrátí `40001 shift_workflow_conflict`;
- snapshot neobsahuje žádný header, member, request ani revision z B;
- cleanup odstraní pouze přesně ověřené syntetické fixtures.

- [ ] **Step 6: Ověř GREEN a commit**

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
node supabase/tests/shared_shift_workflows.concurrency.mjs
npm test -- --run src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts --reporter=dot
git add supabase/migrations supabase/tests/shared_shift_workflows.test.sql supabase/tests/shared_shift_workflows.concurrency.mjs src/features/shift-workflows/shift-workflow-mutation-rpc.service.ts src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts
git commit -m "feat: save linked shifts atomically"
```

## Task 5: Implementovat atomické drafty, odeslání a společné rozhodnutí

**Files:**

- Modify: CLI-created `supabase/migrations/*_shared_shift_workflows.sql`
- Expand: `supabase/tests/shared_shift_workflows.test.sql`
- Expand: `supabase/tests/shared_shift_workflows.concurrency.mjs`
- Modify: `src/features/shift-workflows/shift-workflow-mutation-rpc.service.ts`
- Modify: `src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts`
- Create: `src/features/shift-workflows/shift-workflows.service.ts`
- Create: `src/features/shift-workflows/shift-workflows.service.test.ts`
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Modify: `src/features/timelogs/services/timelogs-atomic-write.service.test.ts`

- [ ] **Step 1: Napiš failing testy přesné množiny a all-or-nothing chování**

Pokryj:

```ts
it('saves empty later sections as drafts without submitting them implicitly', async () => {});
it('submits every visible assigned section in one request', async () => {});
it('does not submit when one section is empty or invalid', async () => {});
it('recovers by refetching after an ambiguous network response', async () => {});
it('does not claim success unless the complete expected round is observed', async () => {});
it('rejects an approval response missing one round item', async () => {});
it('creates a new round after a returned round is corrected', async () => {});
```

SQL doplň o Crew, CrewHead a COO role, chybějící assignment, podvržený contractor, jeden stale `updated_at`, extra/missing timelog ID, dvojklik, přidané přiřazení po odeslání a souběžné schválení/vrácení.

- [ ] **Step 2: Ověř RED**

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
npm test -- --run \
  src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts \
  src/features/shift-workflows/shift-workflows.service.test.ts \
  src/features/timelogs/services/timelogs-atomic-write.service.test.ts --reporter=dot
```

- [ ] **Step 3: Implementuj společné ukládání draftů**

Kontrakt:

```sql
public.save_shift_workflow_drafts_atomic(
  p_request_id uuid,
  p_workflow_id uuid,
  p_contractor_id uuid,
  p_anchor_event_id uuid,
  p_timelogs jsonb
) returns jsonb
```

Každý element `p_timelogs` obsahuje `id|null`, `event_id`, `expected_updated_at|null`, `expected_status`, `km`, `note` a normalizované `days`. Server sám odvodí přesnou povolenou množinu přiřazených eventů z workflow a profilu; klientská pole ji nesmí rozšířit. Draft save dovolí `days: []` jen u `draft`. Vlastník může bezpečně doplnit data v `pending_crew_confirmation`, ale bez změny stavu a bez vynechání části; následné `confirm` proběhne přes round transition. Seřaď locky podle event UUID a timelog UUID. Zapiš či vytvoř všechny kanonické timelogy a jejich dny jako celek. Odpověď musí obsahovat přesně jeden autoritativní výsledek pro každý vstup.

Validace musí přijmout všechny skutečné hodnoty `public.timelog_type`, včetně `pripravy`. V téže forward migraci nahraď hardcoded validaci v `save_timelog_atomic`, aby i nepropojená přípravná směna používala stejný úplný enum. Přidej pgTAP regresi pro linked i single-event `pripravy`.

- [ ] **Step 4: Implementuj odeslání a zmrazení kola**

Kontrakt:

```sql
public.submit_shift_workflow_round_atomic(
  p_request_id uuid,
  p_round_id uuid,
  p_workflow_id uuid,
  p_contractor_id uuid,
  p_anchor_event_id uuid,
  p_timelogs jsonb
) returns jsonb
```

Server musí:

1. odvodit exact set z aktuálního přiřazení a workflow;
2. vyžadovat přesnou shodu vstupu s exact setem;
3. zvalidovat neprázdné dny, časy, typy, km a současná pravidla evidence každé části;
4. uložit všechny aktuální hodnoty;
5. vytvořit jedno kolo a jeho exact round items;
6. provést `draft|rejected -> pending_ch` a vytvořit nové kolo;
7. zapsat action `submitted` nebo `resubmitted`;
8. při jediné chybě vrátit vše.

Pokud `workflow_id is null`, server povolí právě anchor event a jeho vlastní přiřazený timelog. Nepovolí libovolný klientský seznam.

- [ ] **Step 5: Implementuj rozhodnutí nad existujícím kolem**

Kontrakt:

```sql
public.transition_shift_workflow_round_atomic(
  p_request_id uuid,
  p_round_id uuid,
  p_expected_round_updated_at timestamptz,
  p_targets jsonb,
  p_action text,
  p_note text,
  p_affected_event_id uuid,
  p_corrections jsonb
) returns jsonb
```

Povolené přechody:

| Actor | Current | Action | Next |
|---|---|---|---|
| CrewHead | `pending_ch` | `handoff` | `pending_coo` |
| CrewHead | `pending_ch` | `correct` | `pending_crew_confirmation` |
| CrewHead | `pending_ch` | `return` | `rejected` |
| Crew | `pending_crew_confirmation` | `confirm` | stejné kolo `pending_ch` |
| COO | `pending_coo` | `approve` | `approved` |
| COO | `pending_coo` | `return` | `rejected` |

`return` a `correct` vyžadují neprázdnou poznámku a `p_affected_event_id`, který musí patřit do kola. `correct` může v `p_corrections` změnit hodnoty přesné množiny částí a uloží before snapshot pro potvrzení crew; změna dat i stavu je jedna transakce. Crew může své `pending_crew_confirmation` hodnoty bezpečně doplnit přes batch save a `confirm` vrátí stejné kolo do `pending_ch`. Při `approved` nebo `rejected` nastav `released_at` na všech round items. Všechny cílové výkazy musí mít očekávaný stav i verzi a množina musí přesně odpovídat round items.

- [ ] **Step 6: Sjednoť klientskou službu a recovery**

`shift-workflows.service.ts` bude jediná aplikační cesta pro linked save/submit/approve/return. Použij existující `runTimelogMutation`/query invalidaci, ale mutation key musí zahrnout všechny UUID seřazené deterministicky. Po timeoutu nebo nejasné odpovědi načti autoritativní snapshot a označ úspěch pouze tehdy, pokud přesné `request_id`, `round_id`, všechny timelogy, verze a výsledné stavy odpovídají očekávání. Jinak vrať zprávu vyžadující obnovu.

- [ ] **Step 7: Dokaž souběžné rozhodnutí**

Rozšiř Node concurrency proof o dvě session nad stejným `pending_ch` kolem. Jedna schválí, druhá vrátí. Druhá musí čekat na lock a následně selhat konfliktem; žádný výkaz, round action ani `released_at` nesmí být částečný.

- [ ] **Step 8: Ověř GREEN a commit**

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
node supabase/tests/shared_shift_workflows.concurrency.mjs
npm test -- --run \
  src/features/shift-workflows/shift-workflow-mutation-rpc.service.test.ts \
  src/features/shift-workflows/shift-workflows.service.test.ts \
  src/features/timelogs/services/timelogs-atomic-write.service.test.ts --reporter=dot
npx tsc --noEmit
git add supabase/migrations supabase/tests/shared_shift_workflows.test.sql supabase/tests/shared_shift_workflows.concurrency.mjs src/features/shift-workflows src/features/timelogs/services/timelogs.service.ts src/features/timelogs/services/timelogs-atomic-write.service.test.ts
git commit -m "feat: submit and approve shift rounds atomically"
```

## Task 6: Odstranit automatickou fakturu ze schválení hodin

**Files:**

- Modify: CLI-created `supabase/migrations/*_shared_shift_workflows.sql`
- Expand: `supabase/tests/shared_shift_workflows.test.sql`
- Create: `src/features/timelogs/services/approval-without-invoice-migration.test.ts`
- Modify: `src/features/timelogs/services/timelogs.service.test.ts`
- Modify: `src/features/uuid-write-flows.integration.test.ts`
- Modify: `src/features/invoices/services/approval-timelog-sync.service.test.ts`
- Verify: `src/features/invoices/services/invoices.service.ts`
- Verify: `src/features/invoices/services/invoices.service.test.ts`
- Verify: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`

- [ ] **Step 1: Napiš regresní testy před změnou triggeru**

SQL test musí vložit `pending_coo` timelog s dny a schválenými účtenkami, provést oprávněné finální schválení a ověřit:

```sql
select is((select status from public.timelogs where id = :timelog),
          'approved'::public.timelog_status,
          'final approval leaves hours approved');
select is((select count(*) from public.invoices where timelog_id = :timelog),
          0::bigint,
          'final approval creates no invoice');
select is((select count(*) from public.invoice_timelogs where timelog_id = :timelog),
          0::bigint,
          'final approval attaches no invoice');
select is((select status from public.receipts where id = :receipt),
          'approved'::public.receipt_status,
          'final approval does not attach receipts');
```

Přidej druhý scénář pro stávající single-event cestu, protože zákaz automatické faktury platí i mimo propojení.

- [ ] **Step 2: Ověř RED**

```bash
supabase test db supabase/tests/shared_shift_workflows.test.sql
npm test -- --run src/features/timelogs/services/approval-without-invoice-migration.test.ts --reporter=dot
```

Expected: současný `trg_timelog_approved` změní stav na `invoiced` a vytvoří invoice rows.

- [ ] **Step 3: V nové migraci odpoj pouze automatické fakturování**

```sql
drop trigger if exists trg_timelog_approved on public.timelogs;
drop function if exists public.handle_timelog_approved();
```

Nesahej do historické migrace `20260817074631_timelog_assignment_lifecycle.sql`; nová forward migration mění výsledné schéma. Ponech `enforce_timelog_update_permissions` a ověř, že přímý `pending_coo -> approved` stále vyžaduje COO a že nové round RPC nepřeskakuje role. Pokud kvůli exact-round markeru upravíš permission trigger, marker musí být pevně pojmenovaný, nastavitelný pouze uvnitř konkrétního RPC a vždy obnovený i při výjimce.

- [ ] **Step 4: Ověř explicitní fakturační cestu**

Existing `createInvoiceFromSelection` musí dál:

- přijmout pouze `approved` podklady;
- vytvořit `invoice_timelogs` bez duplicit;
- změnit jen skutečně vybrané výkazy na `invoiced`;
- zachovat rozpis více jobnumber.

Neměň ji na přípravný výběr a nepřidávej automatické volání po schválení.

Aktualizuj testy importu/synchronizace, které dnes mockují nebo očekávají `invoiced` bez explicitního vytvoření faktury: po importu schválených hodin musí očekávat `approved`. Parser RPC nadále přijímá všechny platné statusy, ale business flow už nesmí vydávat automatické `invoiced` za správný výsledek schválení.

- [ ] **Step 5: Ověř GREEN a commit**

```bash
supabase db reset
supabase test db supabase/tests/shared_shift_workflows.test.sql
npm test -- --run \
  src/features/timelogs/services/approval-without-invoice-migration.test.ts \
  src/features/timelogs/services/timelogs.service.test.ts \
  src/features/uuid-write-flows.integration.test.ts \
  src/features/invoices/services/approval-timelog-sync.service.test.ts \
  src/features/invoices/services/invoices.service.test.ts \
  src/features/events/services/event-assignment-lifecycle-migration.test.ts --reporter=dot
git add supabase/migrations supabase/tests/shared_shift_workflows.test.sql src/features/timelogs/services/approval-without-invoice-migration.test.ts src/features/timelogs/services/timelogs.service.test.ts src/features/uuid-write-flows.integration.test.ts src/features/invoices/services/approval-timelog-sync.service.test.ts
git commit -m "fix: keep approved hours separate from invoices"
```

## Task 7: Přesunout správu propojení do detailu crew

**Files:**

- Create: `src/features/shift-workflows/ShiftWorkflowEditor.tsx`
- Create: `src/features/shift-workflows/ShiftWorkflowEditor.test.tsx`
- Create: `src/features/shift-workflows/ShiftWorkflowSummary.tsx`
- Modify: `src/views/CrewDetailView.tsx`
- Create: `src/views/CrewDetailView.shift-workflows.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.test.tsx`
- Keep: `src/features/billing-groups/*`

- [ ] **Step 1: Napiš failing UI testy přesunu**

Scénáře:

```ts
it('shows Propojit směny only to CrewHead and COO in crew detail', () => {});
it('lists the selected person shifts with name, jobnumber and date once', () => {});
it('warns that linking affects every assigned crew member', () => {});
it('requires confirmation for moving a shift or crossing projects', () => {});
it('explains why a submitted or invoiced shift cannot be linked', () => {});
it('does not render EventBillingSection in event detail', () => {});
it('does not delete or convert historical billing groups', () => {});
```

- [ ] **Step 2: Ověř RED**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowEditor.test.tsx \
  src/views/CrewDetailView.shift-workflows.test.tsx \
  src/views/EventDetailView.test.tsx --reporter=dot
```

- [ ] **Step 3: Implementuj jednoduchý editor v detailu crew**

V sekci `Směny` přidej manažerskou akci `Propojit směny`. Dialog:

- předvybere aktuální workflow vybrané směny;
- nabídne směny aktuálního člověka a zachová již připojené členy workflow;
- zobrazuje `Název směny · JOB`, pod tím datum; stejný název projektu neopakuje;
- nemá povinné pole názvu skupiny;
- před uložením ukáže přesný dopad na eventy a upozornění na ostatní přiřazené lidi;
- vyžádá výslovné potvrzení přesunu/cross-project dopadu;
- při konfliktu obnoví snapshot, zachová uživatelův výběr a vyžádá nové potvrzení;
- disabled položku vysvětlí textem, ne pouze šedou barvou.

Na kartách směn ukaž nenápadný štítek `Propojeno: 3 směny`, ale nepoužívej výraz „fakturační skupina“.

- [ ] **Step 4: Odstraň starý editor pouze z detailu akce**

Odstraň import a oba rendery `EventBillingSection` z `EventDetailView.tsx`. Soubory, SQL a data `billing_groups` ponech. Nevytvářej automatickou migraci z historických skupin. Přidej test, že načtení starých billing group dat nezmění nový workflow snapshot.

- [ ] **Step 5: Ověř responzivní chování a GREEN**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowEditor.test.tsx \
  src/views/CrewDetailView.shift-workflows.test.tsx \
  src/views/EventDetailView.test.tsx --reporter=dot
npx tsc --noEmit
npm run build
git add src/features/shift-workflows/ShiftWorkflowEditor.tsx src/features/shift-workflows/ShiftWorkflowEditor.test.tsx src/features/shift-workflows/ShiftWorkflowSummary.tsx src/views/CrewDetailView.tsx src/views/CrewDetailView.shift-workflows.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx
git commit -m "feat: manage linked shifts from crew detail"
```

## Task 8: Postavit jeden editor evidence pro více přiřazených směn

**Files:**

- Create: `src/features/shift-workflows/ShiftWorkflowTimelogEditor.tsx`
- Create: `src/features/shift-workflows/ShiftWorkflowTimelogEditor.test.tsx`
- Create: `src/components/modals/TimelogSectionEditor.tsx`
- Create: `src/components/modals/TimelogSectionEditor.test.tsx`
- Modify: `src/components/modals/MobileTimelogEditModal.tsx`
- Modify: `src/components/modals/MobileTimelogEditModal.test.tsx`
- Modify: `src/components/modals/TimelogEditModal.tsx`
- Modify: `src/components/modals/TimelogEditModal.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/TimelogsView.test.tsx`

- [ ] **Step 1: Napiš failing akceptační testy editoru**

```ts
it('opens the same three-section workflow from prep, install and deinstall', () => {});
it('renders only two sections when the crew member lacks the third assignment', () => {});
it('never requests or hides an unassigned section in crew mode', () => {});
it('keeps each shift dates, hours, km and notes separate', () => {});
it('autosaves drafts without silently submitting an empty later section', () => {});
it('submits all displayed eligible sections with one confirmation', () => {});
it('blocks the complete submit and identifies the invalid section', () => {});
it('shows the same context from Event detail and Timelogs overview', () => {});
it('closes and removes data after role change or sign out', () => {});
```

- [ ] **Step 2: Ověř RED**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowTimelogEditor.test.tsx \
  src/components/modals/TimelogSectionEditor.test.tsx \
  src/components/modals/MobileTimelogEditModal.test.tsx \
  src/components/modals/TimelogEditModal.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/TimelogsView.test.tsx --reporter=dot
```

- [ ] **Step 3: Nejdřív vytáhni znovupoužitelnou sekci jednoho výkazu**

`MobileTimelogEditModal.tsx` má rozsáhlou logiku jednoho výkazu. Nevkládej do něj druhou kopii celé logiky. Vytáhni řízený komponent:

```ts
interface TimelogSectionEditorProps {
  event: Event;
  timelog: Timelog;
  contractor: Contractor;
  readOnly: boolean;
  errors: string[];
  onChange(next: Timelog): void;
}
```

Komponent spravuje pole, kalendář a validaci jedné směny; orchestrace autosave/submit zůstane v nadřazeném workflow editoru. Neprovádí vlastní síťovou mutaci. Existing single editor použije tutéž sekci, aby se nerozešly výpočty, jídlo, noční čas, km, poznámky a povolené typy `pripravy|instal|provoz|deinstal` podle skutečného `TimelogType` v aktuálním checkoutu.

- [ ] **Step 4: Implementuj společný editor**

Header ukáže odvozený název, počet směn, společný stav a celkový součet. Každá přiřazená směna je samostatná rozbalitelná sekce se jménem, jobnumber, termínem a vlastními hodnotami. Tlačítka:

- `Uložit rozpracované`: atomicky uloží všechny zobrazené změněné drafty, prázdná pozdější sekce je dovolena;
- `Odeslat ke schválení`: nejprve zvaliduje všechny zobrazené sekce, ukáže přesný souhrn a jedním RPC vytvoří kolo;
- po konfliktu editor nic lokálně neprohlásí za uložené, načte autoritativní data a ukáže, která část se změnila.

Z libovolného member eventu `handleOpenEvidence` pouze nastaví anchor timelog/event; resolver z něj odvodí celý kontext. Stejný resolver použij na kartách v `TimelogsView`. Nevytvářej druhý výpočet podle jobnumber.

- [ ] **Step 5: Ověř GREEN a commit**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowTimelogEditor.test.tsx \
  src/components/modals/TimelogSectionEditor.test.tsx \
  src/components/modals/MobileTimelogEditModal.test.tsx \
  src/components/modals/TimelogEditModal.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/TimelogsView.test.tsx --reporter=dot
npx tsc --noEmit
npm run build
git add src/features/shift-workflows/ShiftWorkflowTimelogEditor.tsx src/features/shift-workflows/ShiftWorkflowTimelogEditor.test.tsx src/components/modals/TimelogSectionEditor.tsx src/components/modals/TimelogSectionEditor.test.tsx src/components/modals/MobileTimelogEditModal.tsx src/components/modals/MobileTimelogEditModal.test.tsx src/components/modals/TimelogEditModal.tsx src/components/modals/TimelogEditModal.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/views/TimelogsView.tsx src/views/TimelogsView.test.tsx
git commit -m "feat: edit linked shift evidence in one place"
```

## Task 9: Sjednotit schvalovací přehledy nad přesným kolem

**Files:**

- Create: `src/features/shift-workflows/ShiftWorkflowApprovalCard.tsx`
- Create: `src/features/shift-workflows/ShiftWorkflowApprovalCard.test.tsx`
- Modify: `src/views/TimelogsView.tsx`
- Modify: `src/views/TimelogsView.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify: `src/views/EventDetailView.test.tsx`
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/views/DashboardView.test.tsx`
- Modify: `src/views/CrewDetailView.tsx`
- Modify: `src/views/CrewDetailView.shift-workflows.test.tsx`

- [ ] **Step 1: Napiš failing testy společného schválení**

Pokryj:

```ts
it('shows one approval card for one contractor round, not three unrelated rows', () => {});
it('shows every exact round section and total before approval', () => {});
it('opens the same round from dashboard, event and timelog views', () => {});
it('lets CrewHead approve only pending_ch and COO only pending_coo', () => {});
it('returns the complete round with a required note and affected section', () => {});
it('does not include a new assignment added after submission', () => {});
it('shows a conflict without partially advancing any section', () => {});
it('leaves approved round labeled Schváleno, not Vyfakturováno', () => {});
```

- [ ] **Step 2: Ověř RED**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowApprovalCard.test.tsx \
  src/views/TimelogsView.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/DashboardView.test.tsx \
  src/views/CrewDetailView.shift-workflows.test.tsx --reporter=dot
```

- [ ] **Step 3: Vytvoř jeden prezentační model kola**

`ShiftWorkflowApprovalCard` dostane hotový `ShiftWorkflowContext`/round a callbacks. Nevyhledává si další výkazy samo. Zobrazuje:

- jméno člověka;
- názvy směn, jobnumber a datum;
- hodiny, km, stravné a cenu po směnách;
- společný součet;
- přesnou aktuální fázi;
- historii action logu a poslední důvod vrácení;
- právě oprávněné akce podle role.

Single-event kolo se zobrazí stejnou kartou s jednou částí. Starší timelogy bez round historie zůstanou ve stávajícím single-row zobrazení a nesmí se zpětně seskupit podle metadat.

- [ ] **Step 4: Přepoj všechny vstupy bez duplicitního rozhodování**

`DashboardView`, `TimelogsView`, `EventDetailView` a `CrewDetailView` použijí tentýž selector/model. Pokud event patří do kola se třemi položkami, kliknutí z kterékoliv položky otevře jedno kolo. Akce musí volat `transitionShiftWorkflowRound`, ne třikrát `updateTimelogStatus`.

Ponech kompatibilní cestu pro historické výkazy bez kola, dokud nebude výslovně rozhodnuta jejich migrace. Nikdy nespojuj starší řádky jen podle stejného člověka nebo jobnumber.

- [ ] **Step 5: Ověř GREEN a commit**

```bash
npm test -- --run \
  src/features/shift-workflows/ShiftWorkflowApprovalCard.test.tsx \
  src/views/TimelogsView.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/DashboardView.test.tsx \
  src/views/CrewDetailView.shift-workflows.test.tsx --reporter=dot
npx tsc --noEmit
npm run build
git add src/features/shift-workflows/ShiftWorkflowApprovalCard.tsx src/features/shift-workflows/ShiftWorkflowApprovalCard.test.tsx src/views/TimelogsView.tsx src/views/TimelogsView.test.tsx src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/views/DashboardView.tsx src/views/DashboardView.test.tsx src/views/CrewDetailView.tsx src/views/CrewDetailView.shift-workflows.test.tsx
git commit -m "feat: approve linked shifts as one round"
```

## Task 10: Prokázat bezpečnost, regrese a migrační dopad

**Files:**

- Create: `supabase/tests/shared_shift_workflows.verification.md`
- Modify if needed: `src/features/shift-workflows/*`
- Verify: `supabase/migrations/20260904112112_billing_groups.sql`
- Verify: `src/features/billing-groups/*`
- Verify: `src/features/invoices/services/invoices.service.ts`
- Verify: `src/features/invoices/services/invoice-customer-resolution.ts`

- [ ] **Step 1: Spusť všechny databázové důkazy z čistého lokálního stavu**

```bash
supabase db reset
supabase test db
node supabase/tests/shared_shift_workflows.concurrency.mjs
supabase db lint --local --schema public --level warning --fail-on error
supabase db advisors --local
supabase migration list --local
```

Expected:

- všechny migrace se přehrají od nuly;
- všechna pgTAP tvrzení projdou;
- concurrency proof vidí skutečné čekání na lock a loser nemá partial writes;
- žádný nový SECURITY advisor finding;
- anonymní role nemá EXECUTE ani table access;
- crew nevidí unassigned event, timelog, round ani action;
- manager nemůže přímým table write obejít RPC;
- `trg_timelog_approved` a `handle_timelog_approved()` nejsou ve výsledném schématu;
- tabulky, funkce, faktury a historická data `billing_groups*` jsou beze změny.

- [ ] **Step 2: Dokaž nedestruktivní migraci nad realistickou kopií schématu**

V disposable lokální DB před aplikací nové migrace vlož fixtures:

- starou billing group se dvěma nesouvisejícími eventy;
- jednotlivé i více-eventové faktury;
- `draft`, `pending_ch`, `pending_coo`, `approved`, `invoiced`, `paid` timelogy;
- assignmenty dvou různých lidí;
- schválené a attached účtenky.

Po migraci porovnej JSON snapshot všech původních tabulek kromě očekávané absence automatického triggeru/funkce. Žádná existující skupina se nesmí objevit v `shift_workflows`; žádný stav, hodina, cena, invoice link ani assignment se nesmí změnit.

- [ ] **Step 3: Spusť zaměřené aplikační regrese**

```bash
npm test -- --run \
  src/features/shift-workflows \
  src/features/billing-groups \
  src/features/timelogs \
  src/features/invoices/services/invoices.service.test.ts \
  src/features/invoices/services/invoice-mutation-rpc.service.test.ts \
  src/views/CrewDetailView.shift-workflows.test.tsx \
  src/views/EventDetailView.test.tsx \
  src/views/TimelogsView.test.tsx \
  src/views/DashboardView.test.tsx --reporter=dot
```

- [ ] **Step 4: Spusť celou sadu a statické kontroly**

```bash
npm test -- --run --maxWorkers=1 --reporter=dot
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: vše projde. Pokud lint vypíše existující baseline warnings, zaznamenej přesný před/počet a ověř, že změna nepřidala nový warning; chyby jsou blokující.

- [ ] **Step 5: Sepiš checkpoint bez tvrzení o produkci**

Do `supabase/tests/shared_shift_workflows.verification.md` uveď:

- přesné příkazy a jejich výsledky;
- verzi Supabase CLI/PostgreSQL;
- počet pgTAP assertions a aplikačních testů;
- souběhový důkaz;
- RLS/ACL/advisor výsledek;
- snapshot důkaz, že stará data nebyla změněna;
- jasnou větu „remote Staff nebyl změněn“;
- známé baseline warnings a lokální workaroundy;
- další rollout gates.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/shared_shift_workflows.verification.md
git commit -m "test: verify shared shift workflow end to end"
```

## Task 11: Review, schválené nasazení a zařízení

**Files:**

- Review: all branch changes
- Modify only if review finds defects: files named by the finding
- Device workflow: `AGENTS.md`

- [ ] **Step 1: Proveď review proti schválenému návrhu**

Použij `superpowers:requesting-code-review`. Reviewer musí explicitně zkontrolovat:

- rozdíl mezi provozním propojením a budoucím fakturačním výběrem;
- exact-set server validation a stabilní UUID;
- žádný únik cizích/unassigned dat;
- idempotenci, verze, lock ordering a all-or-nothing;
- role Crew/CrewHead/COO včetně korekce a vrácení;
- žádnou automatickou fakturu;
- žádnou automatickou konverzi starých billing groups;
- mobilní i desktopovou cestu;
- chování single unlinked eventu.

Oprav jen ověřené nálezy pomocí TDD a zopakuj Task 10.

- [ ] **Step 2: Zastav se před vzdálenou změnou**

Před `supabase db push`, přímým SQL na připojeném Staff projektu nebo jinou vzdálenou mutací předlož uživateli:

- přesný název nové migrace;
- seznam objektů, které přidá/odstraní;
- dopad odstranění automatického invoice triggeru;
- důkaz lokálních testů a snapshotu;
- potvrzení, že staré billing groups se nepřevádějí;
- rollback/forward-fix postup.

Vyžádej nové explicitní schválení. Dřívější souhlas s tabulkami fakturačních skupin toto nasazení nepokrývá.

- [ ] **Step 3: Po schválení nasazení ověř vzdálený výsledek read-only dotazy**

Použij pouze CLI příkazy ověřené přes `--help`. Nikdy nepoužij `supabase db reset --linked`. Po aplikaci migrace ověř:

- migration history;
- existenci a ACL/RLS nových objektů;
- absenci auto-invoice triggeru;
- nulový počet neočekávaných změn starých tabulek;
- smoke read RPC jako Crew, CrewHead a COO;
- skutečné vytvoření/link/save/submit/approve jen nad předem schválenými testovacími záznamy.

- [ ] **Step 4: Integruj do `main` bez přepsání uživatelových změn**

Použij `superpowers:finishing-a-development-branch`. Před merge/rebase znovu zkontroluj dirty stav původního checkoutu a zachovej nesouvisející změny. Po integraci:

```bash
git status --short --branch
git log -5 --oneline
npm test -- --run --maxWorkers=1 --reporter=dot
npm run build
```

- [ ] **Step 5: Aktualizuj vývojové instalace podle `AGENTS.md`**

Teprve po úspěšném merge do `main`, ověření synchronizace s `origin/main` a zachování `.env.local` spusť z čisté ověřené kopie:

```bash
npm run ios:refresh:devices
```

Reportuj zvlášť:

- simulátor: build, instalace, launch a verze commitu;
- fyzický iPhone: totéž, nebo přesně „čeká na dostupné spárované zařízení“;
- žádná produkční App Store distribuce se tím neprovádí.

- [ ] **Step 6: Manuální akceptace v simulátoru**

Otestuj dvěma rolemi a nejméně dvěma lidmi:

1. CrewHead v detailu crew propojí přípravu, instalaci a deinstalaci.
2. Crew přiřazená na všechny tři otevře z každé stejné třísekční evidence.
3. Druhá crew přiřazená jen na dvě uvidí právě dvě; třetí se neobjeví ani v síťové odpovědi.
4. Průběžné uložení přípravy dovolí doplnit instalaci později bez duplikace.
5. Neúplná část zablokuje celé odeslání a ukáže chybu u správné směny.
6. Jedno odeslání vytvoří jedno kolo; dvojklik nevytvoří druhé.
7. CrewHead schválí celé kolo, COO jej finálně schválí.
8. Výkazy skončí `approved`; nevznikne faktura ani attached receipt.
9. Vrácení zachová data/důvod a opravené odeslání vytvoří nové kolo.
10. Nepropojená směna funguje stejně jako před změnou.
11. Role switch/sign-out zavře editor a stará data nejsou dostupná.
12. Staré faktury a jejich více-jobnumber rozpis se zobrazují beze změny.

## Finální self-review plánu

- Schválený rozsah etapy 1 pokrývají Tasks 1–9; výběr podkladů pro fakturu zůstává výslovně mimo rozsah.
- Stabilní identita, exact-set validace, idempotence, optimistické verze, locky a recovery jsou pokryty Tasks 2–5.
- Role, RLS, explicitní ACL po změně Data API v roce 2026 a absence úniku nepřiřazených směn jsou pokryty Tasks 2–5 a 10.
- Jednotný vstup z libovolné směny, viditelnost pouze vlastních přiřazení, průběžné ukládání a jedna akce odeslání jsou pokryty Taskem 8.
- Jedno společné schválení bez přeskočení CrewHead/COO a neměnná historie kola jsou pokryty Tasks 5 a 9.
- Odstranění automatické faktury na serveru a zachování explicitní fakturační cesty jsou pokryty Taskem 6.
- Stará `billing_groups` data se nepřevádějí ani nemažou; UI se z detailu akce odstraní až v Tasku 7 po nové správě v detailu crew.
- Souběh, rollback, čistý reset, advisors, celé regresní testy, review, nový souhlas s remote deployem a zařízení jsou pokryty Tasks 4, 5, 10 a 11.
- V plánu nejsou nevyřešené značky ani volné produktové rozhodnutí. Implementátor má explicitní kontrakty, testy, cesty, příkazy a očekávané výsledky.

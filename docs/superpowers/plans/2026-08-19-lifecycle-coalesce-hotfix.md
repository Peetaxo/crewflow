# Lifecycle `COALESCE` Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the six production lifecycle functions containing invalid `pg_catalog.coalesce(...)` expressions, make the rollback verifier executable, and rerun every schema-first production gate before frontend deployment.

**Architecture:** Keep the applied lifecycle migration immutable. A new fail-closed migration resolves six exact `regprocedure` signatures, validates each invalid-expression count, recreates each function with only that token replaced, and verifies the repair. Static tests lock the correction scope; the runtime verifier rechecks modes, search paths, ACLs, RLS behavior, and rollback.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.95.4, SQL/PLpgSQL, Vitest, TypeScript, ESLint, Vite.

---

### Task 1: Add the failing migration contract

**Files:**
- Modify/Test: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`

- [ ] **Step 1: Add a corrective-migration reader**

```ts
const coalesceHotfixMigrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_fix_lifecycle_coalesce.sql'));

const readCoalesceHotfixMigration = () => {
  expect(coalesceHotfixMigrationFiles).toHaveLength(1);
  return readFileSync(
    join(migrationDirectory, coalesceHotfixMigrationFiles[0]),
    'utf8',
  ).toLowerCase();
};
```

- [ ] **Step 2: Require the exact repair map and valid verifier syntax**

Add one test containing this exact signature/count map:

```ts
const expectedFixes = [
  ['public.transition_receipt_statuses_atomic(jsonb,public.receipt_status,public.receipt_status)', 1],
  ['public.handle_timelog_approved()', 8],
  ['public.create_invoice_atomic(jsonb,jsonb,jsonb,jsonb)', 2],
  ['public.mark_invoice_sent_atomic(uuid,timestamptz,timestamptz)', 2],
  ['public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz)', 2],
  ['public.delete_invoice_atomic(uuid,public.invoice_status,timestamptz)', 2],
] as const;
```

Assert every tuple occurs in the new migration, it uses `pg_catalog.pg_get_functiondef`, it replaces only `pg_catalog.coalesce(` with `coalesce(`, it has a post-repair exception, and `readVerificationScript()` no longer contains `pg_catalog.coalesce(`.

- [ ] **Step 3: Run RED**

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts
```

Expected: FAIL because the corrective migration is absent and the verifier still contains invalid expressions; existing tests remain green.

### Task 2: Implement the minimal correction

**Files:**
- Create: `supabase/migrations/20260819073300_fix_lifecycle_coalesce.sql`
- Modify: `supabase/verify-timelog_assignment_lifecycle.sql`
- Test: `src/features/events/services/event-assignment-lifecycle-migration.test.ts`

- [ ] **Step 1: Create one fail-closed migration**

Use one transaction and one `DO` block with the exact six signature/count tuples. The body must resolve with `pg_catalog.to_regprocedure`, read with `pg_catalog.pg_get_functiondef`, compute the exact token count, abort on drift, execute only the replacement, and reject any remaining invalid token:

```sql
begin;
do $$
declare
  function_fix record;
  v_signature regprocedure;
  v_definition text;
  v_invalid_count integer;
begin
  for function_fix in
    select * from (values
      ('public.transition_receipt_statuses_atomic(jsonb,public.receipt_status,public.receipt_status)', 1),
      ('public.handle_timelog_approved()', 8),
      ('public.create_invoice_atomic(jsonb,jsonb,jsonb,jsonb)', 2),
      ('public.mark_invoice_sent_atomic(uuid,timestamptz,timestamptz)', 2),
      ('public.mark_invoice_paid_atomic(uuid,public.invoice_status,timestamptz,timestamptz)', 2),
      ('public.delete_invoice_atomic(uuid,public.invoice_status,timestamptz)', 2)
    ) expected(signature, invalid_count)
  loop
    v_signature := pg_catalog.to_regprocedure(function_fix.signature);
    if v_signature is null then
      raise exception 'lifecycle coalesce repair function is missing: %', function_fix.signature;
    end if;
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    v_invalid_count := (
      pg_catalog.length(v_definition)
      - pg_catalog.length(pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', ''))
    ) / pg_catalog.length('pg_catalog.coalesce(');
    if v_invalid_count <> function_fix.invalid_count then
      raise exception 'lifecycle coalesce repair source drift for %: expected %, found %',
        function_fix.signature, function_fix.invalid_count, v_invalid_count;
    end if;
    execute pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', 'coalesce(');
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    if pg_catalog.strpos(v_definition, 'pg_catalog.coalesce(') > 0 then
      raise exception 'lifecycle coalesce repair did not remove every invalid expression';
    end if;
  end loop;
end
$$;
commit;
```

- [ ] **Step 2: Correct the verifier mechanically**

Replace every exact `pg_catalog.coalesce(` in `supabase/verify-timelog_assignment_lifecycle.sql` with `coalesce(`. Do not change its fixtures, assertions, transaction, or final `ROLLBACK`.

- [ ] **Step 3: Run GREEN and commit**

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts
git add supabase/migrations/20260819073300_fix_lifecycle_coalesce.sql supabase/verify-timelog_assignment_lifecycle.sql src/features/events/services/event-assignment-lifecycle-migration.test.ts
git commit -m "fix: repair lifecycle coalesce expressions"
```

Expected: focused tests PASS and the commit contains only these three files.

### Task 3: Run local release gates

**Files:** Verify only.

- [ ] **Step 1: Run focused lifecycle coverage**

```bash
npm test -- src/features/events/services/event-assignment-lifecycle-migration.test.ts src/features/events/services/event-assignment-lifecycle.service.test.ts src/features/events/services/events.service.test.ts src/features/timelogs/services/timelogs.service.test.ts src/features/invoices/services/invoices.service.test.ts src/features/receipts/services/receipts.service.test.ts src/features/uuid-write-flows.integration.test.ts
```

Expected: zero focused failures.

- [ ] **Step 2: Run static/build gates**

```bash
npx tsc --noEmit
npx eslint src/features/events/services/event-assignment-lifecycle-migration.test.ts
npm run build
git diff --check 1962eab..HEAD
git status --short
```

Expected: every command exits zero and the worktree is clean.

### Task 4: Dry-run and deploy the corrective migration

**Files:**
- Deploy: `supabase/migrations/20260819073300_fix_lifecycle_coalesce.sql`

- [ ] **Step 1: Confirm exact scope**

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

Expected: remote history ends at `20260817074631`; dry-run lists only `20260819073300_fix_lifecycle_coalesce.sql`.

- [ ] **Step 2: Apply the correction**

```bash
supabase db push --linked
```

Expected: exactly one migration applies. Never use `--include-all`; do not deploy frontend code.

### Task 5: Re-run database gates and invariants

**Files:**
- Verify: `supabase/verify-timelog_assignment_lifecycle.sql`

- [ ] **Step 1: Run lint, advisors, and rollback verifier**

```bash
supabase db lint --linked --level error --fail-on error
supabase db advisors --linked --type security --level warn
supabase db advisors --linked --type performance --level warn
supabase db query --linked --file supabase/verify-timelog_assignment_lifecycle.sql
```

Expected: lint passes; advisor warnings are reviewed; verifier reaches its final `ROLLBACK` with no persistent fixtures.

- [ ] **Step 2: Verify production invariants**

Run exact read-only queries for duplicate `(event_id, contractor_id)` groups, `timelogs_event_contractor_unique`, and the Red Bull event/profile pair.

Expected: zero duplicate groups; exact `UNIQUE (event_id, contractor_id)`; exactly canonical Red Bull timelog `1489bcb7-b4fa-4c93-a92d-5433e725ba03`.

- [ ] **Step 3: Report the boundary**

Report actual outputs. Frontend deployment remains a separate explicit action.

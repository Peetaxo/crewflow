# Invoice overview repair implementation plan

> **For agentic workers:** Repair the approved existing behavior inline, with a failing regression before each change and a code review before integration.

**Goal:** Show the stored invoice number and complete own-invoice breakdown after a fresh login, without exposing another Crew member's invoice items.

**Architecture:** Keep invoice IDs for mutations and React keys. Display and search the stored invoice number. Restore kilometers from persisted invoice items, retaining stored monetary totals. Add a SELECT-only owner policy alongside the existing management policy, with ownership verified through the parent invoice and the authenticated profile.

**Tech stack:** React 18, Vitest, Supabase Auth/PostgREST, PostgreSQL RLS.

## 1. Display and search invoice numbers

Files: `src/views/InvoicesView.tsx`, `src/views/InvoicesView.test.tsx`.

- [x] Add regressions asserting the visible number is `SF-2026-NOVAK-T-0001` and a search for this number finds the invoice; keep the legacy ID fallback for invoices without a stored number.
- [x] Run `npm test -- src/views/InvoicesView.test.tsx` and observe the missing-number/search failures.
- [x] Display `{invoice.invoiceNumber || invoice.id}` and include `invoice.invoiceNumber?.toLowerCase().includes(query)` in the existing filter. Keep mutation arguments and React keys unchanged.
- [x] Repeat the view tests and confirm all pass.

## 2. Restore persisted travel details

Files: `src/features/invoices/services/invoices.service.ts`, `src/features/invoices/services/invoices.service.test.ts`.

- [x] Add a cold-login hydration regression with multiple persisted items, another invoice and a stale local kilometer value. Assert per-invoice kilometers are summed from its own items and the stored monetary totals are preserved.
- [x] Run the focused service tests and observe `km: 0` instead of the persisted total.
- [x] In `mapSupabaseInvoices`, override the mapper's legacy default with `km: round2(items.reduce((total, item) => total + Number(item.km ?? 0), 0))`. Include the decimal regression `10.1 + 15.2 = 25.3`.
- [x] Repeat the service regressions. Do not derive historical kilometers from today's reimbursement rate or stale local state.
- [x] Fetch every accessible invoice item before computing totals, ordered by `created_at` and unique `id`. Use `.range(offset, offset + 999)` and advance by the actual returned page length until an empty page. A regression must simulate an API cap of two rows with three items; another must reject the entire snapshot when the second page fails. Keep the other existing parallel reads unchanged.

## 3. Allow owner-only item reads

Files: a CLI-generated migration under `supabase/migrations/`, `supabase/tests/invoice-items.integration.mjs`.

- [x] Add a disposable-local-only integration regression using the existing four demo accounts and 2,056 CZK invoice. Assert owner Crew, CH and COO can read the same persisted items, Other Crew cannot read them, anonymous requests fail, and direct writes remain rejected.
- [x] Run `node supabase/tests/invoice-items.integration.mjs /private/tmp/crewflow-demo-20261012` and observe the empty owner item list.
- [x] Create the migration with `supabase migration new invoice_items_owner_read`. Add this policy, preserving the existing management policy and grants:

```sql
create policy invoice_items_select_own
on public.invoice_items
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'crew'::public.app_role)
  and exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.contractor_id = (select public.current_profile_id())
  )
);
```

- [x] Apply the SQL only to the isolated local demo, repeat the allow/deny regression and inspect grants, RLS and policy scope. Check current official Supabase guidance and advisory output before hosted rollout.

## 4. Verify and integrate

- [x] Repeat the real UI flow as COO and Crew, reload and sign in again, and retain screenshots of the number and 10 km / 56 CZK breakdown.
- [x] Run the app tests, lint and build; obtain a code review and resolve material findings.
- [ ] Merge into clean `main`, synchronize `origin/main` and deploy the verified policy to Staff. No live business fixture is created or edited.
- [ ] Run `npm run ios:refresh:devices` from a clean synchronized checkout with the existing `.env.local`; verify and report simulator and physical iPhone separately.

## Accepted design for the following increment

The user selected both own-invoice upload and self-billing. Self-billing requires confirmation for each invoice by default. The confirmation screen will explain that Crew can enable **Trvalý souhlas se self-billingem** in settings. Settings must offer explicit opt-in and revocation for future invoices. This workflow and setting belong to the next increment; this repair only restores the existing invoice overview.

## Verification evidence

- Baseline: 158 files / 1,900 app tests. Final repair: 158 files / 1,907 tests passed; lint and production web build passed. Existing broader app type-check debt remains outside this increment.
- Regressions first reproduced number/search failures, zero kilometers after hydration and empty own-item reads. Review additionally reproduced decimal artifacts and a capped item page; the final regressions cover decimal rounding, smaller API caps and later-page failure without returning partial data.
- The isolated local database suite passed 17 pgTAP assertions with all fixtures rolled back. Real SDK sessions verified owner Crew / CH / COO reads, denied Other Crew / anonymous reads, and denied direct insert/update/delete for every tested signed-in role. Stored items remained unchanged.
- COO reload and a complete Crew sign-out/sign-in showed SF-2026-CREW-D-0001 with 8 hours / 2,000 CZK, 10 km / 56 CZK and 2,056 CZK total. UI screenshots and integration JSON are saved in the disposable demo results directory outside Git.
- Code review found no remaining new P0-P2 after the two calculation findings were repaired. The reviewer independently verified that a terminal item page returns an empty list with HTTP 200.
- Staff migration invoice_items_owner_read was deployed successfully at version 20261012131746; the repository filename was aligned to that actual migration-history version. Metadata confirmed the existing management policy and the new SELECT-only owner policy. No live invoice or other business fixture was created or edited. Security advisor results were unchanged: 9 existing local findings and 5 existing hosted findings, with no new finding from this repair.

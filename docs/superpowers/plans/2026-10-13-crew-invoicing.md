# Crew Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Dispatch one implementer at a time, then a spec review and a code quality review. Steps use checkbox syntax for tracking. User approved the written design on 2026-10-13 with the correction that CH, not COO, reviews uploaded invoices. Do not ask again to approve the same scope.

**Goal:** Turn a completely approved final Crew report into exactly one invoice through own PDF upload reviewed by CH, per-invoice self-billing confirmation, or optional standing consent, with the project client as customer.

**Architecture:** Reuse canonical reports, approval rounds, invoices, invoice items and timelog links. Add persisted billing statements and document/consent history, with server-owned financial snapshots and idempotent operations. Keep unissued statements separate from invoices and protect the existing legacy creation entry point from bypassing consent. Issue standing-consent invoices durably on the server; PDF work is retryable against that same invoice.

**Tech Stack:** React 18, TanStack Query, Zod, Vitest, Supabase Auth/PostgREST/Storage/Edge Functions, PostgreSQL RLS and transactional functions.

## Accepted requirements

The authoritative product design is `docs/superpowers/specs/2026-10-13-crew-invoicing-design.md`, incorporating the user's CH correction. Normal submission means final submission for all of that person's work on the event. Daily rows do not cause daily invoices. The whole submitted shared approval round must be approved before its billing statement is ready. Separate unlinked events do not automatically merge. One invoice has one contractor, customer and CZK currency. Explicit selection of several complete statements remains available to COO, and reserves their exact source reports against duplicate issuance.

Standing consent defaults off, is granted/revoked only by the owner Crew user, captures the wording/version/actor/time and explicit non-VAT confirmation, and applies only to approvals completed after the grant. Turning it on does not issue historical statements. COO approves reports and marks payments; CH accepts/returns uploaded invoice documents. Original uploaded PDFs are private and never replaced by the self-billing generator.

## Shared boundary

Use database snake_case at the RPC boundary; map to camelCase only once in `src/features/invoice-billing/contract.ts`. The backend implementer must publish the exact verified JSON shape before frontend work begins. Required operations have these stable names; additional internal helpers must remain narrowly authorized:

```ts
type BillingScope = { userId: string; profileId: string; role: 'crew' | 'crewhead' | 'coo' };
type StatementState = 'ready' | 'blocked' | 'document_pending' | 'document_returned' | 'issued';
type DocumentDecision = 'accept' | 'return';

// get_invoice_billing_snapshot(): own Crew statements/documents/consent,
// or the existing authorized management scope. No invoice issuance as a read side effect.
// set_self_billing_consent(p_request_id, p_enabled, p_expected_updated_at,
//   p_non_vat_confirmed): owner-only versioned mutation, durable replay.
// confirm_invoice_billing(p_request_id, p_statement_id, p_expected_updated_at,
//   p_non_vat_confirmed): owner-only confirmation against the exact preview,
//   returning the original result on replay.
// review_invoice_billing_document(p_request_id, p_statement_id, p_document_id,
//   p_expected_updated_at, p_decision, p_note): CH-only; return requires a reason.
// prepare_invoice_billing_selection(p_request_id, p_timelog_ids): COO explicitly
//   freezes a complete historical/current selection; never silently reprices an
//   already frozen statement or includes only part of a shared approval round.
```

Snapshot rows need stable statement identity, contractor/user binding, exact source report IDs/versions, approval identity/time, event title/job/date, financial item/day snapshots, hours/km/hour/km/meal totals, customer and supplier snapshots, current version, blocked reason, active document ID and issued invoice ID. Documents need stable identity, immutable version/path/metadata/uploader, review decision/reason/reviewer/time. Consent needs current state/version plus append-only history. The statement itself is the versioned preview used for confirmation; changes to billing profile data must refresh that preview before issue.

## Task 1: Database statements, consent, issuance and document-review rules

**Files:**
- Create one CLI-generated migration under `supabase/migrations/` for billing statements/consent/document metadata, private helpers, public RPCs and issuance hooks.
- Create `supabase/tests/invoice-billing.test.sql` and `supabase/tests/invoice-billing.integration.mjs`.
- Modify existing database behavior only in the new migration; do not edit already-deployed migrations.

- [ ] Add a disposable-local-only SDK regression using the four accounts from `/private/tmp/crewflow-demo-20261012/demo-accounts.json`. Require localhost and `@crewflow-demo.test`; do not log credentials or send write probes to Staff.

```js
assert.equal(new URL(credentials.API_URL).hostname, '127.0.0.1');
const snapshot = await crew.client.rpc('get_invoice_billing_snapshot');
assert.equal(snapshot.error, null, 'Crew must load persisted billing state');
assert.equal(snapshot.data.consent.enabled, false, 'Consent starts disabled');
```

- [ ] Run the regression before adding the RPCs and retain the expected missing-feature failure.
- [ ] Discover current CLI commands via `--help`, generate the migration with `supabase migration new crew_invoice_billing`, and iterate using `supabase db query --local --workdir /Users/peetax/Projekty/.crewflow-demo-20261012`. Do not apply hosted migrations during implementation.
- [ ] Implement SELECT-only owner/management RLS for new public data, revoke direct insert/update/delete, and keep privileged helpers in `private` with pinned search_path and exact caller checks. Never authorize with user_metadata. Consent is always tied to the current user's one-to-one profile binding.
- [ ] Capture new final approvals on the server. Shared rounds capture only when the complete frozen round reaches approved; single-report approvals use the complete canonical report. Freeze rates, approved item/day totals including supported meal allowance, source versions and customer identity. Missing billing metadata creates a visible blocked statement while retaining approved hours. Do not let a browser invent invoice amounts.
- [ ] Keep historical approved reports out of automatic issuance. Explicit COO preparation may establish their current verified financial statement; no history-wide migration issues invoices or grants consent. Preserve existing invoice links and already-paid reports.
- [ ] Implement atomic, replayable grant/revoke/confirmation/review/explicit-selection mutations using stable request IDs and payload hashes. Lock profiles, statement/source rows and consent consistently. Enforce exact source sets; selection cannot take a partial shared round or a source reserved by another active statement/invoice.
- [ ] Issue one self-billing invoice after individual confirmation, or durably after a future full approval with valid standing consent. Save number, snapshots, items, links and invoiced source statuses together. Invoice numbering is supplier-scoped; preserve old numbers and allow different suppliers to use the same own-invoice number while rejecting same-supplier duplicates.
- [ ] Keep the existing invoice lifecycle guards for unrelated writes. Add only an unforgeable transaction-scoped private permit for exact source billing transitions needed by owner Crew confirmation and CH acceptance; do not widen generic Crew/CH status writes. Protect legacy `create_invoice_atomic` from bypassing the new request/consent path. Preserve COO payment and historical document behavior.
- [ ] Persist an invoice-PDF job for self-billing issuance. A failed PDF job does not create another invoice or number. CH review accepts the exact active uploaded version and creates an uploaded-source invoice using that original PDF; COO review attempts fail.
- [ ] Run pgTAP/SDK regressions for three days → one statement/invoice; pending/returned/partial round → no invoice; foreign/anonymous/spoofed claims denial; consent default/grant/future/revoke/replay; competing issue/upload/selection; role changes; CH acceptance/return/COO rejection; supplier number scope; rounding, meal and rate snapshot retention. Roll back isolated SQL fixtures.
- [ ] Inspect actual local grants, policies, function ACLs and advisors. Resolve every new finding. Self-review, commit only Task 1 files, report exact verified schema/RPC/JSON contracts and RED/GREEN evidence.
- [ ] Obtain spec compliance review, fix gaps, then code quality review and fix material findings before Task 2.

## Task 2: Private PDF upload and retryable generation

**Files:**
- Create `supabase/functions/upload-invoice-document/` (small request/validation module plus entry point).
- Create `supabase/functions/process-invoice-pdfs/` (worker/entry point) and deployment/configuration documentation.
- Modify `supabase/functions/generate-invoice-pdf/index.ts` with a tested uploaded-source guard.
- Create SDK/Edge integration coverage under `supabase/tests/` and focused Vitest tests for pure request validation/job behavior.

- [ ] First add failing tests for unsupported types, PDF size > 5 MiB, invalid PDF header, mismatched statement version, foreign ownership, duplicate upload/replay, and uploaded-source regeneration.

```ts
const limit = 5 * 1024 * 1024;
expect(validateInvoiceDocument({ bytes: new Uint8Array(limit + 1), type: 'application/pdf' }).ok).toBe(false);
expect(validateInvoiceDocument({ bytes: new TextEncoder().encode('not a pdf'), type: 'application/pdf' }).ok).toBe(false);
```

- [ ] Upload accepts authenticated owner Crew multipart input: request ID, statement ID/version, original invoice number/date/due date and PDF. Verify the authenticated user through Supabase Auth; load the statement with caller permissions. Enforce actual byte size and PDF header/type; reject empty number or invalid dates. Generate the storage path on the server, upload immutably (`upsert: false`) into the private invoice PDF bucket, and finalize a verified document registration bound to that caller/statement/version. No arbitrary client path is accepted as proof.
- [ ] Preserve orphan recovery without returning false success: an ambiguous upload retries the same request and resolves the saved document; conflict does not replace an existing version. Direct callers cannot register unverified file metadata through a public privileged endpoint.
- [ ] Allow owner and authorized management reads through signed URLs via records, not solely guessed directory names. Original document versions remain private and retained. Accepted uploaded invoices point to the accepted original; the generator returns a clear error for uploaded-source invoices before performing writes.
- [ ] Worker claims persisted PDF jobs, renders using the existing PDF module, uploads to the same invoice's path, and marks success/failure/retry against that invoice. Claiming and completion are narrowly authorized; no anonymous worker access or browser service key. Configure one durable server schedule using a protected server credential, without exposing it in app bundles/logs. User-accessible retry must target the same invoice and preserve number/snapshots.
- [ ] Run pure validation tests plus actual isolated-local Auth/Storage/Edge tests for allow/deny, original download identity, upload retries, returned-version replacement, worker retries and invoice identity retention. Render and inspect actual generated PDFs with the PDF skill.
- [ ] Self-review and commit Task 2 only. Spec review must pass before quality review; resolve findings before Task 3.

## Task 3: Scoped billing service, Crew choices, CH review and consent settings

**Files:**
- Create focused `src/features/invoice-billing/contract.ts`, `service.ts`, query hook and components with meaningful tests.
- Modify `src/views/InvoicesView.tsx` and tests for K fakturaci, actual invoices, CH document review and source-aware controls.
- Modify `src/views/SettingsView.tsx`, tests and the settings-section union in `src/context/` for Fakturace.
- Modify invoice domain mapping/types/database types only for the verified schema contract.
- Modify the existing explicit create-selection flow to prepare a billing selection rather than silently issue without consent.
- Modify auth data-scope retirement to clear billing queries/channels/late responses.

- [ ] Write RED tests using actual pure parsers and components with mocked I/O boundaries: malformed/foreign snapshot rejected; identity change discards late result; Crew per-invoice confirmation is explicit; standings defaults off; CH sees review actions and COO does not; owned uploads cannot offer self-billing concurrently; invoices stay separate from pending statements.

```ts
render(<BillingConsentPanel scope={crewScope} snapshot={disabledConsent} />);
expect(screen.getByRole('button', { name: 'Zapnout trvalý souhlas' })).toBeDisabled();
// Enabling requires reading/confirming the explicit non-VAT and standing-consent text.
```

- [ ] Implement strict Zod parsing of Task 1's verified shape. Query keys contain current user/profile/role. Mutations keep immutable request IDs and expected versions across retries; refresh after success/ambiguity and never display a guessed invoice. Cancel/retire work on sign-out/identity/role change.
- [ ] K fakturaci cards show event/job/date, approved daily/hour/km/meal breakdown, customer, supplier, amount, blocked reason and applicable document return note. Crew can open own PDF upload or self-billing preview; existing closed/issued data is read-only. Returned uploads retain history and allow a new version. Avoid loading foreign private data and hiding it only in CSS.
- [ ] Individual self-billing preview shows exact supplier/customer/amount/dates and explicit non-VAT confirmation. The issue action is disabled until confirmed, then calls the exact versioned operation. The information links directly to Nastavení → Fakturace.
- [ ] Settings Fakturace describes automatic issuance for future fully approved reports, requires explicit opt-in/non-VAT declaration, shows enabled date, provides revocation and preserves history. Do not implement consent by a generic editable contractor flag.
- [ ] CH can inspect the active original PDF, accept it or return it with a required reason. COO has the report/payment flow but no own-invoice acceptance/return controls. Accepted and self-billing invoices appear in the shared actual-invoice list with clear Czech source/state labels, original download and correct PDF retry behavior.
- [ ] Replace misleading legacy self-billing-running/dispute/send copy in the touched invoice UI with the actual behavior. Do not imply real email delivery or bank payment. Preserve the intentional developer role switcher and exclude fleet/receipts.
- [ ] Refresh billing data across sessions after backend changes and on app resume/focus, with current-identity channels or bounded scoped polling if Realtime cannot deliver the protected rows. Always retire subscriptions when scope changes.
- [ ] Run focused component/service tests and lint. Self-review, commit Task 3, get spec then quality review and resolve material issues.

## Task 4: Complete real demo, review and rollout

**Files:**
- Update this plan and add `docs/testing/2026-10-13-crew-invoicing.md` with concrete results.
- Save screenshots, test summaries and PDF proof under the existing disposable demo output directory, outside Git.

- [ ] Run app tests, lint and build at the final source. Run isolated pgTAP, actual SDK/Storage/Edge tests and concurrency cases. Existing broad type-check debt is documented; do not claim a clean root reference-only type check.
- [ ] Use the existing isolated Supabase demo and four test accounts. Create additional clearly named fake three-day events and reports without touching Staff business data. Complete the UI flow: Crew draft/final submit → CH return/correction/handoff → COO full approval → Crew upload → CH return → Crew corrected upload → CH accept → download original → COO mark paid.
- [ ] Complete individual self-billing → PDF → payment, then standing grant → future approval → automatic invoice/PDF, revoke → next approval waits for Crew. Reload/sign in again, use another browser session, inspect actual owner/foreign permissions and verify exactly one invoice per complete source.
- [ ] Capture and visually inspect the user-facing proof; mark the demo tabs deliverable. Independent final review must confirm CH correction, whole-report scope, consent, document integrity, amount preservation, access and race protection.
- [ ] Integrate into clean main while preserving others' published changes and original dirty checkout files. Verify merged code, synchronize origin/main without force pushing, deploy only reviewed functions/migration/schedule after checking advisors and record the actual hosted migration version. No live test invoice or consent is created.
- [ ] Use a clean synchronized installation checkout with preserved `.env.local`, run `npm run ios:refresh:devices`, and verify simulator launch/UI and physical iPhone installation/launch separately. Retry only a failed launch after unlock if needed. A failed available-device installation/launch remains outstanding.
- [ ] Update verified outcomes, publish documentation only, restore the persistent demo server to the synchronized main and preserve its test accounts. Clean up only this task's merged clean worktree. Report the actual feature, tests, deployment and device outcomes with a demo screenshot.

## Preparation evidence

- Clean starting source: `4eff3dd9b097e6bc2b1de5321924ad554658421e`.
- Baseline passed 158 files / 1,924 tests. Baseline log: `/private/tmp/crewflow-invoice-workflow-20261013/baseline-tests.log`.
- Own original checkout changes in Info.plist and TimelogsView remain untouched. Working path: `/Users/peetax/Projekty/crewflow/.worktrees/invoice-workflow`.
- Current official Supabase Storage guidance and relevant changelog entries were read during preparation. Before changes, inspect the actual local schema/function definitions and command help rather than guessing historical contracts.

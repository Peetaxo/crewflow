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

Individual self-billing previews also persist server-owned issue/due/supply dates and expiry at the next Prague business day; confirmation of an expired preview requires refresh while preserving approved money. Automatic issuance records its transaction's current Prague dates under standing consent. Accepted own invoices preserve their original issue/due dates. Superseded statements and immutable source history remain available separately from actionable statements. New invoices retain first COO payment actor/profile and server marking time.

## Task 1: Database statements, consent, issuance and document-review rules

**Files:**
- Create one CLI-generated migration under `supabase/migrations/` for billing statements/consent/document metadata, private helpers, public RPCs and issuance hooks.
- Create `supabase/tests/invoice-billing.test.sql` and `supabase/tests/invoice-billing.integration.mjs`.
- Modify existing database behavior only in the new migration; do not edit already-deployed migrations.

- [x] Add a disposable-local-only SDK regression using the four accounts from `/private/tmp/crewflow-demo-20261012/demo-accounts.json`. Require localhost and `@crewflow-demo.test`; do not log credentials or send write probes to Staff.

```js
assert.equal(new URL(credentials.API_URL).hostname, '127.0.0.1');
const snapshot = await crew.client.rpc('get_invoice_billing_snapshot');
assert.equal(snapshot.error, null, 'Crew must load persisted billing state');
assert.equal(snapshot.data.consent.enabled, false, 'Consent starts disabled');
```

- [x] Run the regression before adding the RPCs and retain the expected missing-feature failure.
- [x] Discover current CLI commands via `--help`, generate the migration with `supabase migration new crew_invoice_billing`, and iterate using `supabase db query --local --workdir /Users/peetax/Projekty/.crewflow-demo-20261012`. Do not apply hosted migrations during implementation.
- [x] Implement SELECT-only owner/management RLS for new public data, revoke direct insert/update/delete, and keep privileged helpers in `private` with pinned search_path and exact caller checks. Never authorize with user_metadata. Consent is always tied to the current user's one-to-one profile binding.
- [x] Capture new final approvals on the server. Shared rounds capture only when the complete frozen round reaches approved; single-report approvals use the complete canonical report. Freeze rates, approved item/day totals including supported meal allowance, source versions and customer identity. Missing billing metadata creates a visible blocked statement while retaining approved hours. Do not let a browser invent invoice amounts.
- [x] Keep historical approved reports out of automatic issuance. Explicit COO preparation may establish their current verified financial statement; no history-wide migration issues invoices or grants consent. Preserve existing invoice links and already-paid reports.
- [x] Implement atomic, replayable grant/revoke/confirmation/review/explicit-selection mutations using stable request IDs and payload hashes. Lock profiles, statement/source rows and consent consistently. Enforce exact source sets; selection cannot take a partial shared round or a source reserved by another active statement/invoice.
- [x] Issue one self-billing invoice after individual confirmation, or durably after a future full approval with valid standing consent. Save number, snapshots, items, links and invoiced source statuses together. Invoice numbering is supplier-scoped; preserve old numbers and allow different suppliers to use the same own-invoice number while rejecting same-supplier duplicates.
- [x] Keep the existing invoice lifecycle guards for unrelated writes. Add only an unforgeable transaction-scoped private permit for exact source billing transitions needed by owner Crew confirmation and CH acceptance; do not widen generic Crew/CH status writes. Protect legacy `create_invoice_atomic` from bypassing the new request/consent path. Preserve COO payment and historical document behavior.
- [x] Persist an invoice-PDF job for self-billing issuance. A failed PDF job does not create another invoice or number. CH review accepts the exact active uploaded version and creates an uploaded-source invoice using that original PDF; COO review attempts fail.
- [x] Preserve the standing grant captured at a future approval through legal-detail repair of those exact sources; late opt-in, revoked/replaced grants and explicit consolidation cannot auto-issue historical work. Treat missing distance as unverified and provide a narrowly authorized COO correction of invalid distance with source/version binding. Stop transient worker failures after a finite attempt budget, expose a safe reviewable failure state and recover against the same statement/invoice.
- [x] Run pgTAP/SDK regressions for three days → one statement/invoice; pending/returned/partial round → no invoice; foreign/anonymous/spoofed claims denial; consent default/grant/future/revoke/replay; competing issue/upload/selection; role changes; CH acceptance/return/COO rejection; supplier number scope; rounding, meal and rate snapshot retention. Roll back isolated SQL fixtures.
- [x] Inspect actual local grants, policies, function ACLs and advisors. Resolve every new finding. Self-review, commit only Task 1 files, report exact verified schema/RPC/JSON contracts and RED/GREEN evidence.
- [x] Obtain spec compliance review, fix gaps, then code quality review and fix material findings before Task 2.

## Task 2: Private PDF upload and retryable generation

**Files:**
- Create `supabase/functions/upload-invoice-document/` (small request/validation module plus entry point).
- Create `supabase/functions/process-invoice-pdfs/` (worker/entry point) and deployment/configuration documentation.
- Modify `supabase/functions/generate-invoice-pdf/index.ts` with a tested uploaded-source guard.
- Create SDK/Edge integration coverage under `supabase/tests/` and focused Vitest tests for pure request validation/job behavior.

- [x] First add failing tests for unsupported types, PDF size > 5 MiB, invalid PDF header, mismatched statement version, foreign ownership, duplicate upload/replay, and uploaded-source regeneration.

```ts
const limit = 5 * 1024 * 1024;
expect(validateInvoiceDocument({ bytes: new Uint8Array(limit + 1), type: 'application/pdf' }).ok).toBe(false);
expect(validateInvoiceDocument({ bytes: new TextEncoder().encode('not a pdf'), type: 'application/pdf' }).ok).toBe(false);
```

- [x] Upload accepts authenticated owner Crew multipart input: request ID, statement ID/version, original invoice number/date/due date and PDF. Verify the authenticated user through Supabase Auth; load the statement with caller permissions. Enforce actual byte size and PDF header/type; reject empty number or invalid dates. Generate the storage path on the server, upload immutably (`upsert: false`) into the private invoice PDF bucket, and finalize a verified document registration bound to that caller/statement/version. No arbitrary client path is accepted as proof.
- [x] Preserve orphan recovery without returning false success: an ambiguous upload retries the same request and resolves the saved document; conflict does not replace an existing version. Direct callers cannot register unverified file metadata through a public privileged endpoint.
- [x] Allow owner and authorized management reads through signed URLs via records, not solely guessed directory names. Original document versions remain private and retained. Accepted uploaded invoices point to the accepted original; the generator returns a clear error for uploaded-source invoices before performing writes.
- [x] Worker claims persisted PDF jobs, renders using the existing PDF module, uploads to the same invoice's path, and marks success/failure/retry against that invoice. Claiming and completion are narrowly authorized; no anonymous worker access or browser service key. Configure one durable server schedule using a protected server credential, without exposing it in app bundles/logs. User-accessible retry must target the same invoice and preserve number/snapshots.
- [x] Correct the existing renderer's costs subtotal to include supported meal allowance. Paginate larger explicit multi-source invoices so every item is visible, the summary/payment block never overlaps rows and page counts are accurate. Preserve the compact existing normal invoice design; test and visually inspect normal, boundary and long invoices.
- [x] Render full supplier/customer billing names and addresses with wrapping rather than silently clipping legal identity. Display work duration in hours/minutes so fractional-hour reports agree with the exact-minute approved amount. Cover long Czech identities and the 8h20m pricing case in actual PDF checks.
- [x] Run pure validation tests plus actual isolated-local Auth/Storage/Edge tests for allow/deny, original download identity, upload retries, returned-version replacement, worker retries and invoice identity retention. Render and inspect actual generated PDFs with the PDF skill.
- [x] Self-review and commit Task 2 only. Spec review must pass before quality review; resolve findings before Task 3.

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
- [ ] Both shared-round and standalone COO final approval display a server pricing quote and send its exact ID with the immutable approval command. Replays keep the original quote; stale quotes require a refreshed preview and a new command. Recognize public PT409 conflicts plus legacy 40001. Use exact minutes and up to two monetary decimals, including approved meal allowance.
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
- Work was paused at the user's request on 2026-10-13 and explicitly resumed on 2026-10-14. Task 1 remains unfinished until the new conflict, identity, consolidation and payment checks and both independent reviews pass.
- Browser preflight on 2026-10-14 rejected binding the existing localhost demo tab under browser URL policy. Do not circumvent that policy. Actual live UI proof remains outstanding; continue unaffected implementation and automated database/API/component verification.
- Task 1's first independent spec review reproduced four gaps at `6e86699`: standing eligibility lost during initial/legal-detail repair, null distance silently treated as zero, invalid approved distance repair available only through a DBA test bypass, and unlimited transient retries. Evidence is `/private/tmp/crewflow-spec-review-probes.sql` and `.log`; the implementation is undergoing correction before a second spec review and a separate quality review.
- Task 1's fixes are committed at `14d77413181e79baaf2a313e72c9b26dba58330f`. The second independent spec review passed with 51 rollback-only assertions, alongside 201 pgTAP checks, actual SDK repair/recovery/race checks and a fresh exact-migration preservation rehearsal. Actual permissions cover 14 protected tables and 52 pinned functions; advisors have no new notices against 93 pre-existing warnings. A separate quality review is in progress. Recovery permits immediate queued-transient wake without resetting its attempt budget; failed recovery uses a new eight-attempt generation for the same invoice.
- The first quality review reproduced a legacy draft-deletion regression: restoring an invoiced report to approved incorrectly runs approval capture while its old invoice links still exist. The full review is pending before assigning fixes. On 2026-10-14 the human was asked to explicitly reference the demo tab for later live UI verification; no answer or changed policy state has been assumed, and alternate browser/WebView workarounds remain prohibited.
- The quality review also reproduced revival and confirmation of a superseded statement after consolidation, creating an extra invoice without current source reservations. All work remains isolated and undeployed; central exact-source and superseded-state guards must be corrected before Task 2. The human replied that the tab-reference request was unclear; it was explained in plain language and deferred until the concrete demo is ready. No valid reference or policy change was received.
- The completed quality review at `14d7741` requests three fixes: superseded statement/source-reservation protection, legacy draft deletion without false approval capture, and complete invoice sequence formatting above 9,999 with bounded collisions. The same Task 1 implementer is correcting them before renewed spec and quality review. A fresh shared-round regression encountered a PostgreSQL 17.6/aarch64 SIGSEGV on its unchanged private-helper denial probe; retained engine evidence does not attribute the crash to this feature, and that regression must be completed on a healthy session after the fixes.
- Those fixes are committed at `7238ab709075fdb0e1da41c844f1b9c4812480dd`: fresh superseded mutations reject, central issuance requires exact nonempty source bindings, legacy restoration is excluded from final-approval capture, and full sequence allocation stops after 32 occupied candidates. Quoted reports retain unchanged prices/days with canonical post-approval binding plus original `quoted_report_updated_at` provenance. Fresh 237 pgTAP checks, actual SDK cases and exact migration preservation pass; the unchanged shared suite passes in the implementer's JIT-on invocation. Independent spec re-review passes 27 new plus 51 prior rollback checks; quality re-review is pending. The 93 advisor warnings remain unchanged; unused-index INFO telemetry fluctuates after test usage.
- Independent quality re-review reproduced the shared-suite engine crash again on the revoked private function's error path, so default-session reliability is still under diagnosis. Invocation modes and the Supabase `supautils` hint hook are being compared without removing assertions or changing application permissions. Upstream reports describe the same 17.6.1.106 image/error-path crash: [supabase/postgres#2112](https://github.com/supabase/postgres/issues/2112) and [supabase/supautils#214](https://github.com/supabase/supautils/issues/214). These reports guide diagnosis; matching the cause still requires local evidence.
- The reviewer isolated that engine defect locally: a minimal denied call to the unchanged private function crashes with default session-loaded `supautils`, including with JIT off; the identical admin connection/script returns the expected `42501` when only that connection's `session_preload_libraries` is empty. The complete unchanged shared suite then passes and rolls back, with all application ACL/RLS and assertions retained. No persistent database settings or grants changed. Evidence: `/private/tmp/crewflow-quality-engine-minimal-admin-{default,hookoff}.log` and `crewflow-quality-renewed-shared-admin-hookoff.log`. The implementer's earlier passing invocation explicitly attempted an empty `supautils.hint_roles` startup option and was not a completely default session; its effective value was not verified. Keep this limitation distinct from the invoicing fixes.

- Task 1 completed both independent review gates at `7238ab7`. Quality re-review has no material code findings and permits Task 2. It passed 237 billing checks plus independent six superseded and two legacy probes. Default local image denial-path instability remains separately documented; repeat default verification on a patched image when available before rollout. The controlled full shared-suite pass changes only that connection's diagnostic preload, preserving ACL/RLS/assertions and permanent settings. Task 2 begins next; no feature changes have been hosted or installed.
- Task 2 started on 2026-10-15 from `c6f3e8a`; validation/guard RED reproductions (13 failures) and initial 14-check GREEN are retained by its fresh implementer. Actual private upload, durable worker/schedule and renderer verification remain in progress. Read-only Staff metadata confirms its configured Data API role preloads `safeupdate`, while the management connection preloads `supautils`; no shared supautils or database-specific API override appears. This is a configuration-based comparison, not a hosted permission/crash probe. No hosted data, roles, settings or functions changed.
- Task 2's local harness initially delayed 19 pre-existing disposable fixture jobs before persisting their timers; cleanup then failed on UUID byte-array serialization. The exact original timer for one job was salvaged; the remaining 18 were explicitly rescheduled operationally at `2026-10-15T06:32:23.247452+00:00`, with three old running leases expired. This is not an exact historical timer restoration. Private before/after evidence, atomic/idempotent recovery and protected-table hashes confirm all non-timer job fields and invoices/items/links/statements/documents/reports remain unchanged. Evidence: `/private/tmp/crewflow-invoice-workflow-20261013/task2-recovery-result.json` and `.log`. Future harness mutations must preflight inputs, persist the exact-ID BEFORE snapshot and prove failure cleanup before running workers/schedules.
- A focused Task 2 rollback test reproduced a frozen-owner visibility gap for new statement-backed invoices/items after profile rebinding (2 of 4 failed). A narrow new parent-visibility policy makes these follow their readable statement while preserving legacy and CH/COO access; all four checks then passed. This change and actual Storage paths remain subject to Task 2's separate reviews.
- Task 2 is committed at `3c6efbe4c358531cb86fe2a0d17d46ad8d5debd6`. Actual local integration verifies immutable upload/replay, returned/replacement documents, CH acceptance, original hashes, one-invoice PDF failure/retry, and real scheduled HTTP 200 after the app is absent. Root visually inspected all five renderer proof pages plus an actual worker-produced PDF. The first independent spec review passed the product/Storage contracts and fresh 38 focused checks, but found a harness cleanup race: unscheduling Cron does not drain queued/in-flight worker HTTP, and the main test can continue during signal cleanup. The same implementer must add a real active-worker interruption proof and drain before exact timer restoration; quality review and Task 3 remain pending.
- Root fetched current published `origin/main` at `94f9092` on 2026-10-15. After Task 2's reviews, integrate it before frontend work and preserve its project/mobile changes, exact invoice item allocations, meal amounts and unknown-value provenance. No merge is attempted while the Task 2 implementer is active.
- The Task 2 cleanup fix is committed at `fb3cdb2664a3c1eb0c3ea5cd2705dfe5bb141c1e`. It adds one cleanup owner, interruption guards, exact direct/Cron request draining, an enqueue fence for late-dispatched Cron commands, and a required drain receipt before timer restoration. Meaningful unit and real late-Cron RED cases precede GREEN. Actual SIGTERM proof with a queued pg_net request and a lock-waiting Edge claim confirms both HTTP 200 bodies before all 20 captured rows restore, with no later main continuation. Full normal integration and 40 focused tests pass; the final local state has no test schedule, queued request or ledger. Spec re-review is pending before quality. Evidence: `task2-cleanup-full-integration.log`, `task2-active-interruption-final.log`, `task2-cleanup-final-state.json` in the existing private temporary evidence directory.
- Independent Task 2 spec re-review passed at `fb3cdb2`, with fresh 40/40 tests and targeted lint. The reviewer verified the direct/Cron drain ordering, exact request ledger, late-dispatch fence, required restore receipt and actual interruption/normal evidence; no remaining spec gaps or frontend interface corrections. A fresh separate quality reviewer is active. Task 3 and the integration of current main wait for that gate.

- Independent Task 2 quality review passed at `fb3cdb2` with no material findings. Fresh verification: 40 focused tests, two actual renderer tests, Deno checks for all three entry points, repository lint and whitespace checks; supplemental lost-completion probe confirms no failure callback or later claim. Both review gates are complete. Root now integrates current published main before Task 3 and verifies the merged source; no hosted writes or device updates have occurred.
- Current published main `94f9092` merged cleanly into the feature at `ac4d014c61a135ad878c14995ac4b149e18a9b56`. The integrated baseline passes all 167 files / 2,132 tests with four workers, repository lint, and the web build. The first full test run overlapped lint/build and timed out in two unchanged-by-billing view tests; both files passed all 99 checks independently at their unchanged timeouts, then the complete bounded run passed. One bounded runner stalled before its RUN banner in the restricted environment; it was sampled, terminated, and the same command passed outside that sandbox. No application/test source, assertion or timeout was changed to obtain these passes. Logs: `main-integrated-{tests,timeout-recheck,tests-bounded,tests-bounded-retry,lint,build}.log` in the private evidence directory. Task 3 starts from this verified integrated baseline.

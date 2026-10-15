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

- [x] Write RED tests using actual pure parsers and components with mocked I/O boundaries: malformed/foreign snapshot rejected; identity change discards late result; Crew per-invoice confirmation is explicit; standings defaults off; CH sees review actions and COO does not; owned uploads cannot offer self-billing concurrently; invoices stay separate from pending statements.

```ts
render(<BillingConsentPanel scope={crewScope} snapshot={disabledConsent} />);
expect(screen.getByRole('button', { name: 'Zapnout trvalý souhlas' })).toBeDisabled();
// Enabling requires reading/confirming the explicit non-VAT and standing-consent text.
```

- [x] Implement strict Zod parsing of Task 1's verified shape. Query keys contain current user/profile/role. Mutations keep immutable request IDs and expected versions across retries; refresh after success/ambiguity and never display a guessed invoice. Cancel/retire work on sign-out/identity/role change.
- [x] Both shared-round and standalone COO final approval display a server pricing quote and send its exact ID with the immutable approval command. Replays keep the original quote; stale quotes require a refreshed preview and a new command. Recognize public PT409 conflicts plus legacy 40001. Use exact minutes and up to two monetary decimals, including approved meal allowance.
- [x] K fakturaci cards show event/job/date, approved daily/hour/km/meal breakdown, customer, supplier, amount, blocked reason and applicable document return note. Crew can open own PDF upload or self-billing preview; existing closed/issued data is read-only. Returned uploads retain history and allow a new version. Avoid loading foreign private data and hiding it only in CSS.
- [x] Individual self-billing preview shows exact supplier/customer/amount/dates and explicit non-VAT confirmation. The issue action is disabled until confirmed, then calls the exact versioned operation. The information links directly to Nastavení → Fakturace.
- [x] Settings Fakturace describes automatic issuance for future fully approved reports, requires explicit opt-in/non-VAT declaration, shows enabled date, provides revocation and preserves history. Do not implement consent by a generic editable contractor flag.
- [x] CH can inspect the active original PDF, accept it or return it with a required reason. COO has the report/payment flow but no own-invoice acceptance/return controls. Accepted and self-billing invoices appear in the shared actual-invoice list with clear Czech source/state labels, original download and correct PDF retry behavior.
- [x] Replace misleading legacy self-billing-running/dispute/send copy in the touched invoice UI with the actual behavior. Do not imply real email delivery or bank payment. Preserve the intentional developer role switcher and exclude fleet/receipts.
- [x] Refresh billing data across sessions after backend changes and on app resume/focus, with current-identity channels or bounded scoped polling if Realtime cannot deliver the protected rows. Always retire subscriptions when scope changes.
- [x] Run focused component/service tests and lint. Self-review, commit Task 3, get spec then quality review and resolve material issues.

## Task 4: Complete real demo, review and rollout

**Files:**
- Aktualizovat tento plán a `docs/testing/2026-10-13-crew-invoicing.md` podle skutečných důkazů.
- Soukromé logy, snapshoty, PDF a obrazové důkazy uchovat mimo Git.

- [x] Na konečném integrovaném zdroji spustit sériově aplikaci, lint a build: 185 souborů / 2 300 testů, lint/build exit 0. Porovnat skutečný `tsconfig.app.json` s novým čistým main: 111 → 110 diagnostik, žádná nová signatura; nejde o čisté typy aplikace. Dvě nově odhalené typové chyby Task 2 úzce opravit po reprodukci a schválení.
- [x] Dokončit čtyři rollback fakturační sady: 247/247 pgTAP kontrol. Nezměněný moderní `shared-shift-rounds.sql` PASS s aktivními guards. Před každou sadou ověřit prázdný preload stejného administrátorského spojení, zachovat ACL/RLS/assertions. Starší foundation na zachovaném demu je výslovně PRECONDITION-BLOCKED, nikoli PASS; bez resetu/mazání historie/vypínání triggerů.
- [x] Sekvenčně provést skutečné Auth SDK, sedmičlenný souběh a Storage/Edge/Cron pilot. Přesně ověřit obsluhované soubory a bezpečně načíst konečný lokální Edge zdroj. Žádné hosted testovací zápisy ani `.env.local` pro fake data.
- [x] Na **Auth API úrovni** dokončit nový označený třídenní event/report: neúplný draft → konečné odeslání → CH vrácení s důvodem → Crew oprava/resubmit → CH handoff → COO přesné serverové quote/schválení → vlastní PDF → CH vrácení → opravené PDF → CH přijetí → přesný originál → COO paid. Jeden report a jedna faktura, 7 030 Kč; historie a první platební audit zachované.
- [x] Na **Auth API/Storage/Edge úrovni** dokončit individual self-billing → skutečné PDF → paid (2 083,33 Kč), standing grant → future approval → automatické PDF ze skutečného Cron, revoke → další ready podklad bez invoice/issue jobu. Nové přihlášení, cizí izolace a přesně jedna faktura na source prošly. Dvě Auth relace nejsou dva fyzické telefony ani ovládané browser relace.
- [x] Po bězích čerstvě načíst všechny čtyři účty a ověřit aktuálním frontend parserem; přesně deset starých rozpoznaných testovacích podkladů zůstává read-only, nové jsou kanonické. Historická paid faktura zůstává 2 056 Kč.
- [x] Doložit přesný úklid: 24/24 zachycených job řádků obnovených až po definitive direct/Cron drain a fence. Všech 486 původních řádků ve 27 tabulkách beze změny; konečný test Cron/worker fronta/ledger/claim dotazy 0, lifecycle triggery aktivní.
- [x] Zkontrolovat všechny tři Deno vstupy, dva skutečné renderer testy a nově vykreslenou stránku skutečného worker PDF. Implementátor i root vizuálně potvrzují čitelnost a 8 h 20 min / 2 083,33 Kč bez clippingu; původní šestistránkový PDF důkaz je oddělený.
- [x] Aktualizovat český report s maticí SQL / Auth API / React komponenta a skutečnými limity; provést samokontrolu změn Task 4.
- [ ] **PENDING – úplný skutečný UI pilot, další ovládaná browser relace a screenshot aplikace.** Browse zůstává policy denied i po výslovném povolení přesného 8098 a jednom legitimním retry. Žádný browser read/control neuspěl; bez obcházení jiným browserem/CDP/headless/OS capture/WebView. API a komponentové důkazy tento checkbox neplní.
- [x] Provést nezávislou konečnou kontrolu specifikace a kvality dokončeného automatizovaného dílu Task 4 na `a14ca37`, včetně úzkých typových oprav, pilotu, úklidu a pravdivosti reportu. Finální quality/integration review celého řešení PASS, navíc 21 souborů / 155 testů; bez zbývajícího zásadního nálezu. Blokovaný browser UI a budoucí externí výsledky tím nejsou prohlášené za dokončené.
- [x] Integrovat do čistého main, zachovat další publikované změny a původní dirty checkout, znovu ověřit 185/2300, lint/build a zveřejnit `88e2c35` na origin/main bez force push.
- [x] Nasadit obě zkontrolované migrace s původními verzemi 20261013125432 a 20261015061924; generátor ACTIVEv11 a upload ACTIVEv1, oba JWT true. Přesné otisky 15 původních tabulek/1311 řádků souhlasí. Žádný nový hosted WARN (security30→26,performance91→91), pouze20unused-indexINFO nových prázdných tabulek. Žádná živá testovací faktura ani souhlas.
- [ ] **PENDING – serverový klíč, worker a plánovač.** Automatické schválení odmítlo uložení nového externího credential, protože požaduje konkrétní výslovný souhlas. Uživatel dostal samostatnou žádost o Edge Secrets+Vault+minutový Cron; bez odpovědi neprovádět závislé kroky ani workaround. Po potvrzení nasadit worker a doložit actual hosted HTTP/Cron bez testovací faktury.
- [x] Čistá synchronizovaná instalační kopie se zachovanou `.env.local` prošla `npm run ios:refresh:devices` na88e2c35 exit0. Simulátor i fyzický iPhone13mini: build/install/launch úspěšné. Následný screenshot Staff přehledu potvrzuje nativní vykreslení; není náhradou blokovaného browser pilotu.
- [x] Doplnit skutečné dosavadní výsledky zveřejnění a zařízení, obnovit demo server na synchronizovaný main a zachovat účty.
- [ ] Po chybějícím potvrzení dokončit serverovou aktivaci, doplnit konečné důkazy a uklidit pouze tento čistý sloučený worktree. Nenahlašovat dokončení celé funkce před splněním příslušných výsledků.

## Ověřené milníky a zachované limity

- Výchozí čistý zdroj `4eff3dd9b097e6bc2b1de5321924ad554658421e` prošel 158 soubory / 1 924 testy. Jde o historický základ, nikoli konečný výsledek. Práce byla pozastavena na přání uživatele 13. 10. a výslovně obnovena 14. 10. 2026.
- Pracovní cesta je `/Users/peetax/Projekty/crewflow/.worktrees/invoice-workflow`. Původní nesouvisející změny Info.plist a TimelogsView zůstávají zachované.
- Task 1 na `7238ab709075fdb0e1da41c844f1b9c4812480dd` prošel nezávislou kontrolou specifikace i kvality. Opravené jsou zejména přesná zdrojová rezervace a superseded stav, obnova legacy draftu bez falešného schválení, číslování nad 9 999 s omezenými kolizemi, neznámé finance a autorizovaná oprava vzdálenosti. Lokální advisor baseline měla 93 původních WARN; hosted baseline je jiná plocha a vyžaduje samostatné porovnání.
- Task 2 na `fb3cdb2664a3c1eb0c3ea5cd2705dfe5bb141c1e` prošel oběma nezávislými kontrolami. Dokázal skutečný upload/verze/originál, worker retry a plánovač. Opravený harness má jediného vlastníka úklidu, stop flag, late Cron enqueue fence, exact request ledger, rozpoznané dokončení HTTP a povinný drain receipt před obnovou. Skutečné přerušení SIGTERM s čekajícím i aktivním workerem prošlo; Task 4 helpers neměnil ani nezopakoval rizikový interruption bez důvodu.
- První Task 2 harness odložil 19 původních fiktivních úloh před uložením úplného snapshotu. Jeden čas byl zachráněn přesně, zbývajících 18 bylo **nově provozně naplánováno** na `2026-10-15T06:32:23.247452Z`, tři staré running lease expirovaly. Není to přesná historická obnova. Ostatní pole úloh, faktury, položky, vazby, částky, dokumenty a reporty byly podle soukromého recovery důkazu zachované. Aktuální přesná obnova vychází z nového platného BEFORE snapshotu.
- Task 3 na `2d710f086716be5404c95345cad14142a206df22` prošel specifikací i kvalitou po regresních opravách kanonických vazeb, částek/cest, platebního výsledku, přípravy výběru, synchronizace cache, čitelných autorů a českých důvodů. Poslední quality oprava chrání upload i při změně identity během asynchronního čtení hlavičky souboru. Úmyslný developer role switcher a hlavní větví zachované finance/provenance zůstávají.
- Nejnovější ověřovaný main `2e61fa0a77699d6a4155ee83eaea57cd4289c25a` je čistě spojený v `f5ec8309e5d2f855105754d169d536358c61e390`. Task 4 finální aplikační kontroly po dvou schválených typových opravách: **185 souborů / 2 300 testů**, lint/build exit 0, skutečné app TS 111 → 110 bez nové signatury. Podrobnosti a matice jsou v českém testovacím reportu.
- Lokální image PostgreSQL `17.6.1.106` má oddělený prokázaný crash odmítnuté private funkce v session hooku `supautils`, i při JIT off. Identické odmítnutí při prázdném preloadu jednoho admin spojení správně vrátí `42501`; ACL/RLS/assertions a permanentní nastavení se nemění. Výchozí runtime není označen PASS a crash probe se neopakuje. Hostitelské `PGOPTIONS` kolem CLI je ignorované. Čtení Staff ukázalo `safeupdate` pro Data API, což je konfigurace, nikoli živý hosted test odmítnutí. Žádný Staff crash probe ani testovací účet/faktura/souhlas.
- Starší foundation na zachovaném demo postgres nesplňuje globální empty-state precondition (dvě stará kola). Vyhrazená `crewflow_shared_shift_tests` DB tu neexistuje. Žádný reset, klon clusteru, mazání historie nebo vypnutí triggerů se neprovedlo. Aktuální moderní shared lifecycle PASS a dřívější foundation důkaz zůstávají oddělené.
- Uživatel povolil přesný 8098 Browse, ale jeden legitimní retry nástroje zůstal URL/protocol policy denied. Žádné browser čtení ani ovládání, screenshot dema nebo celý UI pilot nevznikly. Nativní read-only smoke je později dokončený samostatný důkaz. Main, migrace, chráněné PDF/upload služby a obě vývojové instalace jsou aktualizované; nový serverový credential, worker a Cron čekají na konkrétní uživatelské potvrzení po automatickém zamítnutí.

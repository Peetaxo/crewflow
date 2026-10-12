# Invoice PDF repair implementation plan

> **For agentic workers:** Execute the existing bug fixes inline, task by task, with systematic debugging and a failing regression test before each repair.

**Goal:** Generate and download the current self-billing PDF reliably, preserving Czech supplier/customer data and rejecting access to another crew member's invoice.

**Architecture:** Keep the current invoice snapshots, numbering, private bucket and manual PDF action. Bundle a valid PNG derived from the existing SVG wordmark and licensed Unicode fonts alongside the Edge Function. Check the caller's authenticated invoice visibility before using the service client for invoice items, Storage and PDF metadata.

**Tech stack:** Supabase Edge Functions, Deno 2.1, pinned pdf-lib/fontkit/qrcode, existing React invoice service.

## 1. Reproduce renderer failures

Files: `supabase/functions/generate-invoice-pdf/invoice-pdf.test.ts`.

- [x] Add a test that renders an ASCII invoice with the actual renderer and loads the returned bytes with `PDFDocument.load`.
- [x] Run the test in the official `denoland/deno:2.1.4` container; confirm the embedded wordmark fails PNG decompression.
- [x] Replace the invalid embedded image with a checked-in PNG generated from `public/nodu-wordmark.svg`. Load it with `Deno.readFile(new URL('./assets/nodu-wordmark.png', import.meta.url))` and add the assets glob to `supabase/config.toml`.
- [x] Repeat the ASCII test and verify the generated document is readable.

## 2. Preserve Czech text and payment QR

Files: renderer, `assets/NotoSans-Regular.ttf`, `assets/NotoSans-Bold.ttf`, font license, renderer tests.

- [x] Add a failing Czech invoice test using `Žaneta Černá`, `Testovací 1`, `Ukázková 10`, the demo IBAN and a CZK total of 2056.
- [x] Register pinned `@pdf-lib/fontkit@1.1.1`, load bundled Noto Sans Regular/Bold and embed subsets instead of Helvetica.
- [x] Run the real renderer tests and verify the optional QR branch too.
- [x] Render the PDF with Poppler; inspect the whole page and extract Czech text with pypdf.

## 3. Reject unauthorized PDF operations

Files: `supabase/functions/generate-invoice-pdf/index.ts`, focused handler tests or local backend integration regression script.

- [x] Confirm the existing Other Crew account reaches the renderer for the demo invoice (rather than authorization rejection).
- [x] Validate a Bearer token with Supabase Auth. Load the invoice using a caller-scoped client so existing invoice RLS applies.
- [x] Return the same 404 for missing/invisible invoices, without invoking the admin client or renderer. Return 401 for invalid/missing authentication and 400 for invalid request bodies.
- [x] Only after authorized invoice retrieval, load invoice items through the service client, render/upload the PDF and update metadata.
- [x] Verify COO, CH and owner Crew succeed; Other Crew, anonymous calls and malformed bodies fail with no invoice/Storage changes.

## 4. Verify and integrate

- [x] Show an actionable Czech message when PDF generation returns a JSON error, preserving the existing fallback for transport failures; cover it with a failing service test first.
- [x] Re-run the existing app tests, lint and build; preserve previously known type-check debt.
- [x] Review the diff, merge into the current clean `main`, verify the merged code and synchronize `origin/main`.
- [x] Deploy the verified Edge Function with bundled assets and JWT verification retained.
- [x] Run `npm run ios:refresh:devices` from clean synchronized `main`, preserving `.env.local`; report simulator and physical iPhone separately.
- [x] Repeat the UI generation/download flow in the isolated demo and keep a rendered sample PDF as evidence.

## Verification and rollout evidence (2026-10-12)

The PDF fix is commit `02865aa`, integrated and published on synchronized `main` at `df4b71f3359f90f6916eedf426dbb5b9acc5c31f`. Unrelated changes in the original development checkout were preserved. Already-published changes from the other app tasks were incorporated before pushing this fix.

- The merged app suite passed: 157 test files, 1,879 tests. Lint and the production web build passed. After the subsequently published mobile CSS change, the web build and the 11 invoice view/service tests passed again. Existing broader app type-check debt was not addressed by this increment.
- Both real Deno renderer regressions passed, including Czech names/addresses and the payment QR branch. `deno check --no-lock index.ts` passed. The regression sequence reproduced the invalid PNG, unsupported Czech glyphs, unauthorized invoice access and unhelpful frontend error before repairing them.
- The isolated local backend accepted generation by COO, CH and the invoice-owning Crew account. Another Crew account could neither generate nor obtain a signed download URL; invisible and nonexistent invoices returned the same 404. Anonymous/invalid sessions returned 401 and malformed bodies returned 400. Rejected attempts did not change PDF metadata.
- The actual app UI generated and downloaded the demo invoice for 2,056 CZK. Its downloaded PDF was checked with pypdf, rendered with Poppler and visually inspected. Czech supplier/customer text, the bank account, IBAN, dates, invoice number and total were verified. All demo accounts and invoice data are disposable local fixtures.
- The Staff project generator was deployed successfully as active version 10 with JWT verification retained. The downloaded deployed package contained all four bundled assets, each byte-identical to the checked-in version. A hosted anonymous request returned 401. Authenticated generation and private Storage operations were tested against the isolated local backend; no live invoice was created or modified for this check.
- The required device refresh ran from a clean clone of synchronized `main` with the existing ignored `.env.local`. The simulator build, installation and launch succeeded; the running app was visually inspected.
- The available physical iPhone build, signing and installation succeeded. Initial launch attempts failed with the device's `Locked` response. After the user unlocked the phone, the launch-only retry succeeded for `cz.nodu.app` (PID 5186); a subsequent device process query confirmed that the same application process was still running. The simulator and physical iPhone development installations are both verified as updated. The unlocked launch and running-process evidence is saved in `pdf-phone-unlocked-launch.json` and `pdf-phone-running.json` beside the device refresh log.

Local evidence is retained outside Git in the disposable demo's `results` directory (downloaded PDF, rendered page, UI screenshot and integration JSON). Test, deployment and device logs are in `/private/tmp/crewflow-demo-20261012`. Credentials and signed download URLs were not committed.

The following remain later increments: both invoicing alternatives (crew upload and self-billing consent), actual delivery, cross-session refresh, invoice list details, remaining access fixes and dashboard period labels.

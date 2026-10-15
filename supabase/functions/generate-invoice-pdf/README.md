# generate-invoice-pdf

Generates a self-billing invoice PDF for one invoice and stores it in private Supabase Storage bucket `invoice-pdfs`.

Required env vars:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The handler validates the caller with Supabase Auth, then reads the invoice with the caller's RLS-scoped client. Only a visible invoice may be rendered. Its owner Crew, CrewHead and COO can generate it; another Crew member receives the same 404 as for a missing invoice.

The PNG wordmark and licensed Noto Sans fonts are bundled via `static_files` in `supabase/config.toml`. The fonts preserve Czech names/addresses, with no runtime font download. `assets/nodu-wordmark.png` is generated from `public/nodu-wordmark.svg` at 320 px width. Noto Sans Regular/Bold are unmodified files from the official [Noto Fonts repository](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans); the SIL Open Font License is included alongside them.

Deploy:

```bash
supabase functions deploy generate-invoice-pdf --project-ref <project-ref>
```

Use the Docker bundler; do not pass `--use-api`, which does not bundle the static files. Retain JWT verification.

Manual call from the app happens through `supabase.functions.invoke('generate-invoice-pdf', { body: { invoiceId } })`.

Renderer regression tests (run from this directory with Deno 2.1+):

```bash
deno test --no-lock --allow-read invoice-pdf.test.ts
```

The local integration test uses the disposable billing demo with four `@crewflow-demo.test` accounts and the 2056 CZK invoice. It refuses hosted API URLs and non-demo accounts. Run from the repository root:

```bash
node supabase/tests/invoice-pdf.integration.mjs /absolute/path/to/demo-directory
python3 supabase/tests/invoice-pdf-content.py /absolute/path/to/demo-directory/demo-fixed-invoice.pdf
```

The directory must contain local CLI credentials in `local-credentials.json` and disposable account fixtures in `demo-accounts.json`. Never commit either file. The tests verify generation, persisted metadata, owner signed download, unauthorized rejection and the actual downloaded PDF content. The Python content check requires `pypdf`.

Statement-backed invoices must use their persisted durable PDF job. This manual endpoint now rejects every `billing_statement_id != null` with `409 invoice_billing_durable_job_required`, and rejects uploaded originals with `409 invoice_billing_uploaded_original_immutable`, before file reads/writes or metadata changes. Only legacy invoices with no billing statement may use this path. Legacy item reads are paginated by stable `created_at,id`, preserving all rows beyond the Data API default cap.

The shared renderer includes meals in costs, displays exact whole hours/minutes, wraps complete legal names/addresses, paginates all explicit items, and draws accurate footer counts. `invoice-pdf-examples.ts` writes normal, boundary, 31-row and long Czech identity proofs for text extraction and visual rendering.

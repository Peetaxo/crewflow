# upload-invoice-document

Authenticated owner Crew uploads an immutable original PDF to the private
`invoice-pdfs` bucket. Keep `verify_jwt=true`; the handler also calls Auth
`getUser` and checks the current profile owner and database Crew role before any
privileged Storage operation. User-editable metadata is never an authorization
source.

POST multipart fields (one value each):

- `requestId`: UUID retained across retries.
- `statementId`: exact statement UUID.
- `expectedUpdatedAt`: unmodified UTC statement version, including microseconds.
- `invoiceNumber`: original supplier number, nonempty after trimming.
- `issueDate`, `dueDate`: real `YYYY-MM-DD` dates; due date must be on/after
  issue date.
- `file`: PDF with `application/pdf` MIME type, `%PDF-` header, actual size
  1..5242880 bytes.

The amount and destination path come from the server. Success is the existing
registration RPC response `{statement,document}`. Use the returned
`statement.updated_at` for CH review. Do not substitute
`document.statement_updated_at` (that is the pre-upload source version).

The server chooses `billing-statements/{statementId}/documents/{requestId}.pdf`,
with `upsert:false`. Its Storage custom metadata stores a SHA-256 fingerprint of
the authenticated caller, raw version normalized without losing microseconds,
original metadata, actual byte hash/size and server amount. A lost
upload/registration response can be retried with exactly the same request: the
immutable object and saved registration are compared before returning the
original receipt. Saved retries still work after a CH return, acceptance or
later statement version. Changed bytes or metadata reject with `409`; they never
overwrite a file. A new request on a stale statement returns `409`. Uncertain
upload/Storage availability returns `503`, preserving the same request for
retry.

Missing/expired authentication is `401`, foreign/non-Crew ownership `403`,
invalid multipart/PDF/metadata `400` (`413` for an advertised oversized file),
immutable reuse/version/number conflict `409`. Database validation errors are
returned as `{error:code}` (the existing RPC message is used for database
errors). Clients must not manufacture a new request UUID after an ambiguous
result.

Required server environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. No service credential is sent to the browser.
Deployment uses the Docker bundler and the reviewed migration; never deploy with
JWT verification disabled.

All document versions are signed through ordinary authenticated Storage
`createSignedUrl(document.storage_path, seconds)`. The exact persisted document
record and its statement RLS authorize owner/CH/COO reads, including returned
and superseded versions. Direct browser file writes remain denied. Accepted
originals retain their exact original `invoices.pdf_path`.

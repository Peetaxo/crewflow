# generate-invoice-pdf

Generates a self-billing invoice PDF for one invoice and stores it in private Supabase Storage bucket `invoice-pdfs`.

Required env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy:

```bash
supabase functions deploy generate-invoice-pdf
```

Manual call from the app happens through `supabase.functions.invoke('generate-invoice-pdf', { body: { invoiceId } })`.

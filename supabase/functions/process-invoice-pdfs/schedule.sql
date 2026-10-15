-- Apply only after Vault contains invoice_pdf_worker_url (full function URL)
-- and invoice_pdf_worker_secret (same independently generated secret as Edge Secrets).
-- cron.schedule(name,...) updates the existing named schedule on repeat setup.
select cron.schedule(
  'crewflow-invoice-pdfs',
  '* * * * *',
  $schedule$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'invoice_pdf_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'invoice_pdf_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $schedule$
);

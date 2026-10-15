-- Install the hourly safety check; it cannot enable event dispatch by itself.
-- Provision server config and apply activate-dispatch.sql deliberately afterward.
-- cron.schedule(name,...) updates the existing named schedule on repeat setup.
select cron.schedule(
  'crewflow-invoice-pdfs',
  '0 * * * *',
  $schedule$
    select private.dispatch_invoice_billing_jobs();
  $schedule$
);

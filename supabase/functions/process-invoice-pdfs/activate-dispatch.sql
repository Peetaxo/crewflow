-- Deliberate server-only activation after reviewed deployment, Vault setup and
-- queue inspection. May process pre-existing due jobs after this transaction.
do $activate$
begin
  update private.invoice_worker_dispatch_control set enabled = true where id = 1;
  perform private.dispatch_invoice_billing_jobs();
end
$activate$;

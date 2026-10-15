-- Fence BOTH event and Cron dispatch. The shared row lock waits for earlier
-- dispatcher transactions and blocks any late trigger/Cron command from enqueueing.
-- This does not drain requests already queued or running: wait for definitive
-- worker completion before restoring timers. Durable jobs/credentials stay intact.
do $stop$
begin
  update private.invoice_worker_dispatch_control set enabled = false where id = 1;
  if exists (select 1 from cron.job where jobname = 'crewflow-invoice-pdfs') then
    perform cron.unschedule('crewflow-invoice-pdfs');
  end if;
end
$stop$;

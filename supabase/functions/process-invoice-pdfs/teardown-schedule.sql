-- Stop new server invocations before test cleanup, maintenance, or secret rotation.
-- Leaves durable jobs and both credential stores intact for deliberate recovery.
select cron.unschedule('crewflow-invoice-pdfs');

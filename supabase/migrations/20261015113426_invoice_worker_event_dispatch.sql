-- Installing queue notifications must never activate existing jobs. Activation
-- and maintenance use this same singleton lock; no business lifecycle guard is
-- changed. The last successful request supports private operational tracing.
create table private.invoice_worker_dispatch_control (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  last_dispatch_transaction xid8,
  last_request_id bigint
);
insert into private.invoice_worker_dispatch_control(id) values (1);
alter table private.invoice_worker_dispatch_control enable row level security;
revoke all on table private.invoice_worker_dispatch_control from public, anon, authenticated, service_role;

create function private.dispatch_invoice_billing_jobs()
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_control private.invoice_worker_dispatch_control%rowtype;
  v_transaction xid8 := pg_current_xact_id();
  v_url text;
  v_secret text;
  v_request bigint;
begin
  -- No job locks after this lock. Teardown waits for any dispatcher transaction
  -- to finish, then fences late event/Cron invocations by setting enabled=false.
  select * into v_control from private.invoice_worker_dispatch_control where id = 1 for update;
  if not found or not v_control.enabled then return null; end if;
  if v_control.last_dispatch_transaction = v_transaction then return null; end if;

  -- Include exhausted due rows for the existing claim function's finite-budget
  -- housekeeping. Claims and future backoff are not eligible. No report scan.
  if not exists (
    select 1 from private.invoice_billing_jobs
    where status in ('queued', 'running') and (
      (status = 'queued' and available_at <= clock_timestamp())
      or (status = 'running' and locked_until < clock_timestamp())
    )
  ) then return null; end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'invoice_pdf_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'invoice_pdf_worker_secret';
  if nullif(btrim(v_url), '') is null or nullif(btrim(v_secret), '') is null then return null; end if;

  -- pg_net sends only after COMMIT. An enqueue/configuration error must never
  -- roll back approval, invoice issuance, or the already persisted durable job.
  v_request := net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  if v_request is not null then
    update private.invoice_worker_dispatch_control
    set last_dispatch_transaction = v_transaction, last_request_id = v_request where id = 1;
  end if;
  return v_request;
exception when others then
  -- Do not log database error text: extension/configuration errors may include
  -- request headers. The hourly check can recover the durable queue later.
  return null;
end $$;

create function private.notify_invoice_billing_jobs()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'queued' and new.available_at <= clock_timestamp() then
      perform private.dispatch_invoice_billing_jobs();
    end if;
  elsif (old.status = 'running' and new.status <> 'running')
    or (new.status = 'queued' and new.available_at <= clock_timestamp()
      and (old.status <> 'queued' or new.available_at is distinct from old.available_at)) then
    -- Release/completion wakes only if other work is due. Moving the failed job
    -- into future backoff cannot immediately retry it or create an empty loop.
    perform private.dispatch_invoice_billing_jobs();
  end if;
  return null;
end $$;

revoke all on function private.dispatch_invoice_billing_jobs() from public, anon, authenticated, service_role;
revoke all on function private.notify_invoice_billing_jobs() from public, anon, authenticated, service_role;
create trigger invoice_billing_jobs_dispatch
after insert or update of status, available_at on private.invoice_billing_jobs
for each row execute function private.notify_invoice_billing_jobs();

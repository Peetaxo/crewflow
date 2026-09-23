-- Run before implementation for RED; after migration for GREEN. No mutations.
\set ON_ERROR_STOP on
begin;
do $$
declare v_name text; v_function regprocedure;
begin
  foreach v_name in array array[
    'shift_workflows', 'shift_workflow_events', 'shift_workflow_state',
    'shift_workflow_requests', 'shift_workflow_rounds',
    'shift_workflow_round_items', 'shift_workflow_round_actions'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'shared shift schema missing: %', v_name;
    end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.' || v_name)) then
      raise exception 'RLS missing: %', v_name;
    end if;
    if has_table_privilege('anon', 'public.' || v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated', 'public.' || v_name, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'excess table access: %', v_name;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.shift_workflow_requests','SELECT') then
    raise exception 'private ledger exposed';
  end if;
  foreach v_function in array array[
    'public.read_shift_workflows()'::regprocedure,
    'private.read_shift_workflows()'::regprocedure,
    'public.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean)'::regprocedure,
    'private.save_shift_workflow_atomic(uuid,uuid,uuid[],integer,jsonb,boolean,boolean,boolean)'::regprocedure
  ] loop
    if has_function_privilege('anon',v_function,'EXECUTE')
      or not has_function_privilege('authenticated',v_function,'EXECUTE')
      or exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.oid=v_function and a.grantee=0)
      or not exists(select 1 from pg_proc p where p.oid=v_function and p.proconfig @> array['search_path=""']) then
      raise exception 'function ACL/search_path invalid: %',v_function;
    end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('read_shift_workflows','save_shift_workflow_atomic') and p.prosecdef) then
    raise exception 'public wrappers must be invokers';
  end if;
end $$;
rollback;

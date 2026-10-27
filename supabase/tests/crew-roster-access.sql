\set ON_ERROR_STOP on
begin;
do $$ begin
  if has_function_privilege('anon','public.list_event_crew_assignments()','EXECUTE') then
    raise exception 'anonymous roster access still allowed';
  end if;
  if not has_function_privilege('authenticated','public.list_event_crew_assignments()','EXECUTE') then
    raise exception 'authenticated roster access lost';
  end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.list_event_crew_assignments(); raise exception 'anonymous roster returned';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

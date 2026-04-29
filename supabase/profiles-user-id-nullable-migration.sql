begin;

alter table public.profiles
  alter column user_id drop not null;

comment on column public.profiles.user_id is
  'Nullable vazba na auth.users.id. Crew bez loginu muze existovat bez Auth usera; pri zapnuti pristupu se user_id doplni.';

commit;

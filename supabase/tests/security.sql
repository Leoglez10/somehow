\set ON_ERROR_STOP on

begin;

do $$
declare
  missing_rls text;
  unsafe_private_function text;
  anon_table_grant text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'profiles', 'groups', 'group_memberships', 'group_invites',
      'availability_windows', 'proposals', 'proposal_snapshots',
      'proposal_participants', 'proposal_suggestions'
    )
    and not c.relrowsecurity;

  if missing_rls is not null then
    raise exception 'RLS is missing on: %', missing_rls;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
  into unsafe_private_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and has_function_privilege('public', p.oid, 'EXECUTE');

  if unsafe_private_function is not null then
    raise exception 'PUBLIC can execute private functions: %', unsafe_private_function;
  end if;

  select string_agg(table_name || ':' || privilege_type, ', ' order by table_name, privilege_type)
  into anon_table_grant
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'anon'
    and table_name in (
      'profiles', 'groups', 'group_memberships', 'group_invites',
      'availability_windows', 'proposals', 'proposal_snapshots',
      'proposal_participants', 'proposal_suggestions'
    );

  if anon_table_grant is not null then
    raise exception 'anon unexpectedly has table grants: %', anon_table_grant;
  end if;

  if has_table_privilege('authenticated', 'public.group_invites', 'SELECT') then
    raise exception 'authenticated must not read invite token hashes';
  end if;

  if not has_table_privilege('authenticated', 'public.availability_windows', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated lacks required availability privileges';
  end if;

  if has_column_privilege('authenticated', 'public.proposal_participants', 'response', 'UPDATE') then
    raise exception 'participant responses must only change through respond_to_proposal';
  end if;

  if not has_function_privilege('authenticated', 'public.respond_to_proposal(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated lacks respond_to_proposal execute';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proposal_participants'
  ) then
    raise exception 'proposal_participants is missing from supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'proposal_suggestions'
  ) then
    raise exception 'proposal_suggestions is missing from supabase_realtime';
  end if;
end;
$$;

rollback;

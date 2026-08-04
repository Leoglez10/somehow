-- Somewhen MVP: authenticated groups, private availability, immutable proposals,
-- unanimous responses, append-only suggestions, and least-privilege Data API access.

create extension if not exists pgcrypto with schema extensions;
grant execute on function extensions.gen_random_bytes(integer) to postgres;
grant execute on function extensions.digest(text, text) to postgres;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.group_memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  availability_sharing_enabled boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create unique index group_memberships_one_owner_per_group
  on public.group_memberships (group_id)
  where role = 'owner';
create index group_memberships_user_id_idx
  on public.group_memberships (user_id, group_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses integer not null default 20 check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index group_invites_group_active_idx
  on public.group_invites (group_id, expires_at)
  where revoked_at is null;

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '24 hours')
);

create index availability_windows_owner_time_idx
  on public.availability_windows (user_id, starts_at, ends_at);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  organizer_id uuid not null references public.profiles (id) on delete restrict,
  client_request_id uuid not null,
  idea text not null check (char_length(trim(idea)) between 1 and 500),
  place text,
  details text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (place is null or char_length(place) <= 300),
  check (details is null or char_length(details) <= 2000)
);

create unique index proposals_organizer_request_idx
  on public.proposals (organizer_id, client_request_id);

create index proposals_group_created_idx
  on public.proposals (group_id, created_at desc);

create table public.proposal_snapshots (
  proposal_id uuid primary key references public.proposals (id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.proposal_participants (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create index proposal_participants_user_idx
  on public.proposal_participants (user_id, proposal_id);

create table public.proposal_suggestions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index proposal_suggestions_proposal_created_idx
  on public.proposal_suggestions (proposal_id, created_at);

-- Create the profile from Auth data. Metadata is used only for display, never authorization.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, new.id::text), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Defense-in-depth helpers used by RLS. Every helper derives identity from auth.uid().
create function private.is_group_member(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return false;
  end if;

  return exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = caller
  );
end;
$$;

create function private.is_group_owner(p_group_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return false;
  end if;

  return exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id = caller
  );
end;
$$;

create function private.shares_group_with(p_other_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return false;
  end if;

  return caller = p_other_user_id or exists (
    select 1
    from public.group_memberships mine
    join public.group_memberships theirs using (group_id)
    where mine.user_id = caller
      and theirs.user_id = p_other_user_id
  );
end;
$$;

create function private.is_proposal_participant(p_proposal_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return false;
  end if;

  return exists (
    select 1
    from public.proposal_participants pp
    where pp.proposal_id = p_proposal_id
      and pp.user_id = caller
  );
end;
$$;

revoke all on function private.is_group_member(uuid) from public, anon;
revoke all on function private.is_group_owner(uuid) from public, anon;
revoke all on function private.shares_group_with(uuid) from public, anon;
revoke all on function private.is_proposal_participant(uuid) from public, anon;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_owner(uuid) to authenticated;
grant execute on function private.shares_group_with(uuid) to authenticated;
grant execute on function private.is_proposal_participant(uuid) to authenticated;

create function private.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_profile_updated_at() from public, anon, authenticated;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_profile_updated_at();

create function private.protect_proposal_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is distinct from old.group_id
     or new.client_request_id is distinct from old.client_request_id
     or new.organizer_id is distinct from old.organizer_id
     or new.idea is distinct from old.idea
     or new.place is distinct from old.place
     or new.details is distinct from old.details
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.created_at is distinct from old.created_at then
    raise exception 'proposal snapshot fields are immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_proposal_snapshot() from public, anon, authenticated;

create trigger proposals_protect_snapshot
  before update on public.proposals
  for each row execute function private.protect_proposal_snapshot();

create function private.sync_proposal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status text;
begin
  select case
    when bool_or(pp.response = 'declined') then 'declined'
    when bool_and(pp.response = 'accepted') then 'confirmed'
    else 'pending'
  end
  into next_status
  from public.proposal_participants pp
  where pp.proposal_id = new.proposal_id;

  update public.proposals
  set status = coalesce(next_status, 'pending')
  where id = new.proposal_id
    and status <> 'cancelled';

  return new;
end;
$$;

revoke all on function private.sync_proposal_status() from public, anon, authenticated;

create trigger proposal_participants_sync_status
  after insert or update of response on public.proposal_participants
  for each row execute function private.sync_proposal_status();

-- Transactional commands. These functions are intentionally kept out of the
-- exposed public schema; thin public SECURITY INVOKER wrappers follow below.
create function private.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_group_id uuid;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'group name must contain between 1 and 80 characters' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name)
  select caller, split_part(coalesce(au.email, caller::text), '@', 1)
  from auth.users au
  where au.id = caller
  on conflict (id) do nothing;

  insert into public.groups (name, owner_id)
  values (trim(p_name), caller)
  returning id into new_group_id;

  insert into public.group_memberships (group_id, user_id, role)
  values (new_group_id, caller, 'owner');

  return new_group_id;
end;
$$;

create function private.create_group_invite(
  p_group_id uuid,
  p_expires_in_hours integer default 168,
  p_max_uses integer default 20
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  raw_token text;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = caller
  ) then
    raise exception 'only the group owner can create invites' using errcode = '42501';
  end if;
  if p_expires_in_hours not between 1 and 720 or p_max_uses not between 1 and 1000 then
    raise exception 'invalid invite lifetime or usage limit' using errcode = '22023';
  end if;

  raw_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.group_invites (
    group_id, token_hash, created_by, expires_at, max_uses
  ) values (
    p_group_id,
    extensions.digest(raw_token, 'sha256'),
    caller,
    now() + make_interval(hours => p_expires_in_hours),
    p_max_uses
  );

  return raw_token;
end;
$$;

create function private.join_group(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  matched_invite public.group_invites%rowtype;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if char_length(coalesce(p_token, '')) <> 48 then
    raise exception 'invalid invite token' using errcode = '22023';
  end if;

  select gi.*
  into matched_invite
  from public.group_invites gi
  where gi.token_hash = extensions.digest(lower(trim(p_token)), 'sha256')
    and gi.revoked_at is null
    and gi.expires_at > now()
    and gi.use_count < gi.max_uses
  for update;

  if not found then
    raise exception 'invite is invalid, expired, revoked, or fully used' using errcode = '22023';
  end if;

  insert into public.profiles (id, display_name)
  select caller, split_part(coalesce(au.email, caller::text), '@', 1)
  from auth.users au
  where au.id = caller
  on conflict (id) do nothing;

  insert into public.group_memberships (group_id, user_id, role)
  values (matched_invite.group_id, caller, 'member')
  on conflict (group_id, user_id) do nothing;

  if found then
    update public.group_invites
    set use_count = use_count + 1
    where id = matched_invite.id;
  end if;

  return matched_invite.group_id;
end;
$$;

create function private.create_proposal(
  p_request_id uuid,
  p_group_id uuid,
  p_idea text,
  p_place text,
  p_details text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_proposal_id uuid;
  participants uuid[];
  member_count integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.group_memberships gm
    where gm.group_id = p_group_id and gm.user_id = caller
  ) then
    raise exception 'group membership required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_idea, ''))) not between 1 and 500 then
    raise exception 'proposal idea must contain between 1 and 500 characters' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'proposal time range is invalid' using errcode = '22023';
  end if;
  if p_request_id is null
     or p_starts_at < now() + interval '5 minutes'
     or p_ends_at - p_starts_at not between interval '30 minutes' and interval '4 hours'
     or p_starts_at <> date_bin(interval '15 minutes', p_starts_at, timestamptz '2000-01-01 00:00:00+00')
     or p_ends_at <> date_bin(interval '15 minutes', p_ends_at, timestamptz '2000-01-01 00:00:00+00') then
    raise exception 'proposal slot must be future, current, and aligned to 15 minutes' using errcode = '22023';
  end if;

  select array_agg(distinct candidate order by candidate)
  into participants
  from unnest(array_append(coalesce(p_participant_ids, '{}'::uuid[]), caller)) candidate;

  select count(*)
  into member_count
  from public.group_memberships gm
  where gm.group_id = p_group_id
    and gm.user_id = any(participants);

  if coalesce(array_length(participants, 1), 0) < 2
     or member_count <> array_length(participants, 1) then
    raise exception 'participants must include the organizer and at least one other group member' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from private.get_common_availability(
      p_group_id, participants, p_starts_at, p_ends_at, p_ends_at - p_starts_at
    ) common
    where common.starts_at <= p_starts_at and common.ends_at >= p_ends_at
  ) then
    raise exception 'proposal slot is no longer common availability' using errcode = '22023';
  end if;

  insert into public.proposals (
    client_request_id, group_id, organizer_id, idea, place, details, starts_at, ends_at
  ) values (
    p_request_id,
    p_group_id,
    caller,
    trim(p_idea),
    nullif(trim(coalesce(p_place, '')), ''),
    nullif(trim(coalesce(p_details, '')), ''),
    p_starts_at,
    p_ends_at
  ) on conflict (organizer_id, client_request_id) do nothing
  returning id into new_proposal_id;

  if new_proposal_id is null then
    select p.id into new_proposal_id
    from public.proposals p
    where p.organizer_id = caller and p.client_request_id = p_request_id;
    return new_proposal_id;
  end if;

  insert into public.proposal_snapshots (proposal_id, snapshot)
  values (
    new_proposal_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'organizer_id', caller,
      'idea', trim(p_idea),
      'place', nullif(trim(coalesce(p_place, '')), ''),
      'details', nullif(trim(coalesce(p_details, '')), ''),
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'participant_ids', to_jsonb(participants)
    )
  );

  insert into public.proposal_participants (proposal_id, user_id, response, responded_at)
  select
    new_proposal_id,
    participant,
    case when participant = caller then 'accepted' else 'pending' end,
    case when participant = caller then now() else null end
  from unnest(participants) participant;

  return new_proposal_id;
end;
$$;

create function private.get_common_availability(
  p_group_id uuid,
  p_participant_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_min_duration interval default interval '30 minutes'
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  participants uuid[];
  participant_count integer;
  valid_member_count integer;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to <= p_from
     or p_from < date_trunc('day', now())
     or p_to > now() + interval '62 days' then
    raise exception 'availability range is invalid' using errcode = '22023';
  end if;
  if p_min_duration < interval '30 minutes' or p_min_duration > interval '4 hours' then
    raise exception 'minimum duration is invalid' using errcode = '22023';
  end if;

  select array_agg(distinct candidate order by candidate)
  into participants
  from unnest(array_append(coalesce(p_participant_ids, '{}'::uuid[]), caller)) candidate;
  participant_count := coalesce(array_length(participants, 1), 0);

  select count(*)
  into valid_member_count
  from public.group_memberships gm
  where gm.group_id = p_group_id
    and gm.user_id = any(participants);

  if participant_count < 2 or valid_member_count <> participant_count then
    raise exception 'all requested participants must belong to the group' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = any(participants)
      and not gm.availability_sharing_enabled
  ) then
    raise exception 'every participant must enable availability sharing for this group' using errcode = '42501';
  end if;

  return query
  with per_member as (
    select
      aw.user_id,
      range_agg(
        tstzrange(
          greatest(aw.starts_at, p_from),
          least(aw.ends_at, p_to),
          '[)'
        )
      ) as free_ranges
    from public.availability_windows aw
    where aw.user_id = any(participants)
      and aw.starts_at < p_to
      and aw.ends_at > p_from
    group by aw.user_id
  ),
  normalized as (
    select pm.user_id, free_range
    from per_member pm
    cross join lateral unnest(pm.free_ranges) free_range
  ),
  event_points as (
    select event_at, sum(delta)::integer as delta
    from (
      select lower(n.free_range) as event_at, 1 as delta from normalized n
      union all
      select upper(n.free_range) as event_at, -1 as delta from normalized n
    ) events
    group by event_at
  ),
  timeline as (
    select
      ep.event_at,
      lead(ep.event_at) over (order by ep.event_at) as next_event_at,
      sum(ep.delta) over (order by ep.event_at rows unbounded preceding)::integer as active_members
    from event_points ep
  )
  , rounded as (
    select
      date_bin(interval '15 minutes', t.event_at, timestamptz '2000-01-01 00:00:00+00')
        + case when t.event_at = date_bin(interval '15 minutes', t.event_at, timestamptz '2000-01-01 00:00:00+00') then interval '0' else interval '15 minutes' end as rounded_start,
      date_bin(interval '15 minutes', t.next_event_at, timestamptz '2000-01-01 00:00:00+00') as rounded_end
    from timeline t
    where t.active_members = participant_count and t.next_event_at is not null
  )
  select r.rounded_start, r.rounded_end
  from rounded r
  where r.rounded_end - r.rounded_start >= p_min_duration
  order by r.rounded_start;
end;
$$;

create function private.respond_to_proposal(p_proposal_id uuid, p_response text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  next_status text;
begin
  if caller is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_response not in ('accepted', 'declined') then raise exception 'invalid response' using errcode = '22023'; end if;
  perform 1 from public.proposals p where p.id = p_proposal_id for update;
  if not found then raise exception 'proposal not found' using errcode = '22023'; end if;

  update public.proposal_participants pp
  set response = p_response, responded_at = now()
  where pp.proposal_id = p_proposal_id and pp.user_id = caller;
  if not found then raise exception 'proposal participation required' using errcode = '42501'; end if;

  select case when bool_or(pp.response = 'declined') then 'declined'
              when bool_and(pp.response = 'accepted') then 'confirmed' else 'pending' end
  into next_status from public.proposal_participants pp where pp.proposal_id = p_proposal_id;
  update public.proposals set status = next_status where id = p_proposal_id and status <> 'cancelled';
  return next_status;
end;
$$;

revoke all on function private.create_group(text) from public, anon;
revoke all on function private.create_group_invite(uuid, integer, integer) from public, anon;
revoke all on function private.join_group(text) from public, anon;
revoke all on function private.create_proposal(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid[]) from public, anon;
revoke all on function private.get_common_availability(uuid, uuid[], timestamptz, timestamptz, interval) from public, anon;
revoke all on function private.respond_to_proposal(uuid, text) from public, anon;
grant execute on function private.create_group(text) to authenticated;
grant execute on function private.create_group_invite(uuid, integer, integer) to authenticated;
grant execute on function private.join_group(text) to authenticated;
grant execute on function private.create_proposal(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function private.get_common_availability(uuid, uuid[], timestamptz, timestamptz, interval) to authenticated;
grant execute on function private.respond_to_proposal(uuid, text) to authenticated;

create function public.create_group(p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_group(p_name); $$;

create function public.create_group_invite(
  p_group_id uuid,
  p_expires_in_hours integer default 168,
  p_max_uses integer default 20
)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.create_group_invite(p_group_id, p_expires_in_hours, p_max_uses); $$;

create function public.join_group(p_token text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.join_group(p_token); $$;

create function public.create_proposal(
  p_request_id uuid,
  p_group_id uuid,
  p_idea text,
  p_place text,
  p_details text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_participant_ids uuid[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_proposal(
    p_request_id, p_group_id, p_idea, p_place, p_details,
    p_starts_at, p_ends_at, p_participant_ids
  );
$$;

create function public.respond_to_proposal(p_proposal_id uuid, p_response text)
returns text language sql security invoker set search_path = ''
as $$ select private.respond_to_proposal(p_proposal_id, p_response); $$;

create function public.get_common_availability(
  p_group_id uuid,
  p_participant_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_min_duration interval default interval '30 minutes'
)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_common_availability(
    p_group_id, p_participant_ids, p_from, p_to, p_min_duration
  );
$$;

revoke all on function public.create_group(text) from public, anon;
revoke all on function public.create_group_invite(uuid, integer, integer) from public, anon;
revoke all on function public.join_group(text) from public, anon;
revoke all on function public.create_proposal(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid[]) from public, anon;
revoke all on function public.get_common_availability(uuid, uuid[], timestamptz, timestamptz, interval) from public, anon;
revoke all on function public.respond_to_proposal(uuid, text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.create_group_invite(uuid, integer, integer) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.create_proposal(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.get_common_availability(uuid, uuid[], timestamptz, timestamptz, interval) to authenticated;
grant execute on function public.respond_to_proposal(uuid, text) to authenticated;

-- RLS is enabled on every table in the exposed public schema.
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invites enable row level security;
alter table public.availability_windows enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_snapshots enable row level security;
alter table public.proposal_participants enable row level security;
alter table public.proposal_suggestions enable row level security;

create policy profiles_select_shared_group
  on public.profiles for select to authenticated
  using (private.shares_group_with(id));
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update_self
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy groups_select_members
  on public.groups for select to authenticated
  using (private.is_group_member(id));
create policy groups_update_owner
  on public.groups for update to authenticated
  using (private.is_group_owner(id))
  with check (private.is_group_owner(id) and owner_id = (select auth.uid()));

create policy memberships_select_group_members
  on public.group_memberships for select to authenticated
  using (private.is_group_member(group_id));
create policy memberships_update_own_sharing
  on public.group_memberships for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No direct policy exists for group_invites: hashes remain inaccessible.

create policy availability_select_owner
  on public.availability_windows for select to authenticated
  using ((select auth.uid()) = user_id);
create policy availability_insert_owner
  on public.availability_windows for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy availability_update_owner
  on public.availability_windows for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy availability_delete_owner
  on public.availability_windows for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy proposals_select_participants
  on public.proposals for select to authenticated
  using (private.is_proposal_participant(id));
create policy proposal_snapshots_select_participants
  on public.proposal_snapshots for select to authenticated
  using (private.is_proposal_participant(proposal_id));

create policy proposal_participants_select_participants
  on public.proposal_participants for select to authenticated
  using (private.is_proposal_participant(proposal_id));
create policy proposal_suggestions_select_participants
  on public.proposal_suggestions for select to authenticated
  using (private.is_proposal_participant(proposal_id));
create policy proposal_suggestions_insert_participant
  on public.proposal_suggestions for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and private.is_proposal_participant(proposal_id)
  );

-- Explicit Data API privileges. RLS remains the row-level authorization layer.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.groups to authenticated;
grant select on table public.group_memberships to authenticated;
grant update (availability_sharing_enabled) on table public.group_memberships to authenticated;
grant select, insert, update, delete on table public.availability_windows to authenticated;
grant select on table public.proposals to authenticated;
grant select on table public.proposal_snapshots to authenticated;
grant select on table public.proposal_participants to authenticated;
grant select, insert on table public.proposal_suggestions to authenticated;

-- Realtime only exposes rows already allowed by RLS.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'proposal_participants'
    ) then
      alter publication supabase_realtime add table public.proposal_participants;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'proposal_suggestions'
    ) then
      alter publication supabase_realtime add table public.proposal_suggestions;
    end if;
  end if;
end;
$$;

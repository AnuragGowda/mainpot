-- Public-beta safety, privacy, retention, and future plan controls.

alter table public.games
  add column if not exists host_is_anonymous boolean not null default true,
  add column if not exists expires_at timestamptz;

update public.games as game
set host_is_anonymous = coalesce(
  (select user_row.is_anonymous from auth.users as user_row where user_row.id = game.host_user_id),
  true
);

update public.games
set expires_at = case
  when ended_at is not null then ended_at + interval '48 hours'
  else created_at + interval '7 days'
end
where host_is_anonymous = true and expires_at is null;

create index if not exists games_host_created_idx
  on public.games(host_user_id, created_at desc);
create index if not exists games_guest_expiry_idx
  on public.games(expires_at)
  where host_is_anonymous = true;

alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists supporter_until timestamptz;

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'supporter'));

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  beta_all_features boolean not null default true,
  free_games_per_month integer not null default 4 check (free_games_per_month > 0),
  beta_games_per_month integer not null default 30 check (beta_games_per_month > 0),
  supporter_games_per_month integer not null default 300 check (supporter_games_per_month > 0),
  guest_games_per_day integer not null default 3 check (guest_games_per_day > 0),
  guest_active_games integer not null default 1 check (guest_active_games > 0),
  max_players_per_game integer not null default 12 check (max_players_per_game between 2 and 50),
  max_events_per_game integer not null default 250 check (max_events_per_game between 25 and 2000),
  guest_retention_hours integer not null default 48 check (guest_retention_hours between 1 and 720),
  guest_max_age_days integer not null default 7 check (guest_max_age_days between 1 and 90),
  updated_at timestamptz not null default now()
);

insert into public.app_config(id) values (true)
on conflict (id) do nothing;

alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

create table if not exists public.game_access (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
create index if not exists game_access_user_idx on public.game_access(user_id, game_id);
alter table public.game_access enable row level security;
revoke all on public.game_access from anon, authenticated;

create table if not exists public.rate_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (actor_id, action, window_started_at)
);
create index if not exists rate_limits_window_idx on public.rate_limits(window_started_at);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.has_game_access(target_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.game_access
    where game_id = target_game_id and user_id = auth.uid()
  );
$$;

revoke all on function public.has_game_access(uuid) from public;
grant execute on function public.has_game_access(uuid) to authenticated;

create or replace function public.consume_rate_limit(
  target_action text,
  bucket_seconds integer,
  max_requests integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket_start timestamptz;
  next_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if bucket_seconds < 60 or max_requests < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from now()) / bucket_seconds) * bucket_seconds
  );

  insert into public.rate_limits(actor_id, action, window_started_at, request_count)
  values (auth.uid(), target_action, bucket_start, 1)
  on conflict (actor_id, action, window_started_at)
  do update set request_count = public.rate_limits.request_count + 1
  returning request_count into next_count;

  if next_count > max_requests then
    raise exception 'Too many requests. Please wait and try again.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;

create or replace function public.create_game_guarded(
  input_code text,
  input_game_name text,
  input_host_name text,
  input_buy_in numeric,
  input_session_id text
) returns table(code text, game_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.app_config%rowtype;
  created_game public.games%rowtype;
  created_player public.players%rowtype;
  created_buy_in_id uuid;
  guest_user boolean;
  supporter_user boolean;
  monthly_limit integer;
  monthly_count integer;
  active_count integer;
  daily_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into config from public.app_config where id = true;
  guest_user := coalesce((auth.jwt()->>'is_anonymous')::boolean, true);

  if input_code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'Invalid room code';
  end if;
  if char_length(trim(input_game_name)) not between 1 and 80 then
    raise exception 'Game name must be between 1 and 80 characters';
  end if;
  if char_length(trim(input_host_name)) not between 1 and 80 then
    raise exception 'Host name must be between 1 and 80 characters';
  end if;
  if char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;
  if input_buy_in <= 0 or input_buy_in > 1000000 then
    raise exception 'Buy-in must be between $0.01 and $1,000,000';
  end if;

  if guest_user then
    perform public.consume_rate_limit('create_game_guest', 86400, config.guest_games_per_day);

    select count(*) into active_count
    from public.games
    where host_user_id = auth.uid()
      and host_is_anonymous = true
      and status in ('active', 'settling')
      and (expires_at is null or expires_at > now());
    if active_count >= config.guest_active_games then
      raise exception 'Finish your active guest game before starting another.';
    end if;

    select count(*) into daily_count
    from public.games
    where host_user_id = auth.uid()
      and host_is_anonymous = true
      and created_at >= now() - interval '24 hours';
    if daily_count >= config.guest_games_per_day then
      raise exception 'Guest game limit reached. Try again tomorrow or sign in.';
    end if;
  else
    supporter_user := exists (
      select 1 from public.profiles
      where id = auth.uid()
        and plan = 'supporter'
        and (supporter_until is null or supporter_until > now())
    );
    monthly_limit := case
      when config.beta_all_features then config.beta_games_per_month
      when supporter_user then config.supporter_games_per_month
      else config.free_games_per_month
    end;

    select count(*) into monthly_count
    from public.games
    where host_user_id = auth.uid()
      and host_is_anonymous = false
      and created_at >= date_trunc('month', now());
    if monthly_count >= monthly_limit then
      raise exception 'Monthly hosted-game limit reached.';
    end if;
  end if;

  insert into public.games(
    code, name, host_user_id, host_session_id, host_name, buy_in_amount,
    status, host_is_anonymous, expires_at
  ) values (
    input_code, trim(input_game_name), auth.uid(), input_session_id,
    trim(input_host_name), round(input_buy_in, 2), 'active', guest_user,
    case when guest_user then now() + make_interval(days => config.guest_max_age_days) else null end
  ) returning * into created_game;

  insert into public.players(game_id, session_id, name, is_host, user_id)
  values (created_game.id, input_session_id, trim(input_host_name), true, auth.uid())
  returning * into created_player;

  insert into public.buy_ins(game_id, player_id, amount, type, verified)
  values (created_game.id, created_player.id, round(input_buy_in, 2), 'buy_in', true)
  returning id into created_buy_in_id;

  insert into public.game_events(
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values
    (created_game.id, 'game_created', created_player.id, created_player.id, null,
      jsonb_build_object('player_name', created_player.name)),
    (created_game.id, 'player_joined', created_player.id, created_player.id, null,
      jsonb_build_object('player_name', created_player.name)),
    (created_game.id, 'buy_in_added', created_player.id, created_player.id, round(input_buy_in, 2),
      jsonb_build_object(
        'player_name', created_player.name,
        'buy_in_id', created_buy_in_id,
        'buy_in_type', 'buy_in'
      ));

  insert into public.game_access(game_id, user_id)
  values (created_game.id, auth.uid())
  on conflict (game_id, user_id) do update set granted_at = now();

  return query select created_game.code::text, created_game.id, created_player.id;
end;
$$;

revoke all on function public.create_game_guarded(text, text, text, numeric, text) from public;
grant execute on function public.create_game_guarded(text, text, text, numeric, text) to authenticated;

create or replace function public.get_game_by_code(input_code text)
returns setof public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  found_game public.games%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  perform public.consume_rate_limit('lookup_game', 3600, 60);

  select * into found_game
  from public.games
  where code = upper(trim(input_code))
    and (expires_at is null or expires_at > now())
  limit 1;

  if found then
    insert into public.game_access(game_id, user_id)
    values (found_game.id, auth.uid())
    on conflict (game_id, user_id) do update set granted_at = now();
    return next found_game;
  end if;
  return;
end;
$$;

revoke all on function public.get_game_by_code(text) from public;
grant execute on function public.get_game_by_code(text) to authenticated;

create or replace function public.join_game_guarded(
  input_code text,
  input_player_name text,
  input_session_id text
) returns table(game_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  config public.app_config%rowtype;
  found_game public.games%rowtype;
  found_player public.players%rowtype;
  active_players integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  perform public.consume_rate_limit('join_game', 3600, 30);
  select * into config from public.app_config where id = true;

  if char_length(trim(input_player_name)) not between 1 and 80 then
    raise exception 'Player name must be between 1 and 80 characters';
  end if;
  if char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;

  select * into found_game
  from public.games
  where code = upper(trim(input_code))
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'Game not found.';
  end if;
  if found_game.status = 'ended' then
    raise exception 'This game has already ended.';
  end if;

  insert into public.game_access(game_id, user_id)
  values (found_game.id, auth.uid())
  on conflict (game_id, user_id) do update set granted_at = now();

  select * into found_player
  from public.players
  where game_id = found_game.id
    and (user_id = auth.uid() or session_id = input_session_id)
  order by joined_at
  limit 1;

  if found then
    return query select found_game.id, found_player.id;
    return;
  end if;

  select count(*) into active_players
  from public.players
  where game_id = found_game.id and left_at is null;
  if active_players >= config.max_players_per_game then
    raise exception 'This game already has the maximum number of players.';
  end if;

  insert into public.players(game_id, session_id, name, is_host, user_id)
  values (found_game.id, input_session_id, trim(input_player_name), false, auth.uid())
  returning * into found_player;

  insert into public.game_events(
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    found_game.id, 'player_joined', found_player.id, found_player.id,
    jsonb_build_object('player_name', found_player.name)
  );

  return query select found_game.id, found_player.id;
end;
$$;

revoke all on function public.join_game_guarded(text, text, text) from public;
grant execute on function public.join_game_guarded(text, text, text) to authenticated;

create or replace function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.get_player_payment_handles(input_player_ids uuid[])
returns table(player_id uuid, venmo_handle text, zelle_handle text)
language sql
stable
security definer
set search_path = public
as $$
  select player.id, profile.venmo_handle, profile.zelle_handle
  from public.players as player
  join public.profiles as profile on profile.id = player.user_id
  where player.id = any(input_player_ids)
    and public.is_game_participant(player.game_id);
$$;

revoke all on function public.get_player_payment_handles(uuid[]) from public;
grant execute on function public.get_player_payment_handles(uuid[]) to authenticated;

drop policy if exists "games read by code" on public.games;
drop policy if exists "games read with room access" on public.games;
create policy "games read with room access" on public.games
  for select to authenticated
  using (
    auth.uid() = host_user_id
    or public.is_game_participant(id)
    or public.has_game_access(id)
  );

drop policy if exists "games create as host" on public.games;
drop policy if exists "players join as self" on public.players;

drop policy if exists "players read same game" on public.players;
create policy "players read with room access" on public.players
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.is_game_participant(game_id)
    or public.has_game_access(game_id)
  );

drop policy if exists "buy ins read by participants" on public.buy_ins;
create policy "buy ins read with room access" on public.buy_ins
  for select to authenticated using (public.has_game_access(game_id));

drop policy if exists "cash outs read by participants" on public.cash_outs;
create policy "cash outs read with room access" on public.cash_outs
  for select to authenticated using (public.has_game_access(game_id));

drop policy if exists "events read by participants" on public.game_events;
create policy "events read with room access" on public.game_events
  for select to authenticated using (public.has_game_access(game_id));

drop policy if exists "settlement payments read by participants" on public.settlement_payments;
create policy "settlement payments read with room access" on public.settlement_payments
  for select to authenticated using (public.has_game_access(game_id));

-- Public profile discovery never exposes payment identifiers. Full own-profile
-- reads and in-game payment lookups go through the narrowly scoped functions.
revoke select on public.profiles from authenticated;
grant select (
  id, username, display_name, avatar_url, bio, created_at, updated_at, plan
) on public.profiles to authenticated;

create or replace function public.enforce_game_event_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_limit integer;
  current_count integer;
begin
  select max_events_per_game into configured_limit from public.app_config where id = true;
  select count(*) into current_count from public.game_events where game_id = new.game_id;
  if current_count >= configured_limit then
    raise exception 'This game has reached its activity limit.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_game_event_limit_trigger on public.game_events;
create trigger enforce_game_event_limit_trigger
  before insert on public.game_events
  for each row execute function public.enforce_game_event_limit();

create or replace function public.set_guest_game_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  retention_hours integer;
begin
  if new.host_is_anonymous and new.status in ('settling', 'ended')
    and old.status is distinct from new.status then
    select guest_retention_hours into retention_hours from public.app_config where id = true;
    new.expires_at := least(
      coalesce(new.expires_at, now() + make_interval(hours => retention_hours)),
      now() + make_interval(hours => retention_hours)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists set_guest_game_expiry_trigger on public.games;
create trigger set_guest_game_expiry_trigger
  before update on public.games
  for each row execute function public.set_guest_game_expiry();

-- Anonymous auth users should never become searchable profiles. If an
-- anonymous user upgrades in place, the update trigger creates the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) = false then
    insert into public.profiles (id, display_name)
    values (
      new.id,
      coalesce(
        new.raw_user_meta_data->>'display_name',
        split_part(coalesce(new.email, ''), '@', 1)
      )
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of is_anonymous on auth.users
  for each row execute procedure public.handle_new_user();

delete from public.profiles as profile
using auth.users as user_row
where profile.id = user_row.id and user_row.is_anonymous = true;

-- Only permanent accounts receive durable game history.
create or replace function public.handle_game_ended()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended'
    and new.host_is_anonymous = false then
    insert into public.game_participants (game_id, user_id, player_id, net_result)
    select
      new.id,
      player.user_id,
      player.id,
      coalesce(
        (select sum(amount) from public.cash_outs where player_id = player.id),
        0
      ) - coalesce(
        (select sum(amount) from public.buy_ins where player_id = player.id),
        0
      )
    from public.players as player
    join auth.users as user_row on user_row.id = player.user_id
    where player.game_id = new.id
      and user_row.is_anonymous = false
    on conflict (game_id, user_id)
    do update set
      net_result = excluded.net_result,
      player_id = excluded.player_id;
  end if;
  return new;
end;
$$;

create or replace function public.purge_expired_mainpot_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.games
  where host_is_anonymous = true
    and expires_at is not null
    and expires_at <= now();

  delete from public.rate_limits
  where window_started_at < now() - interval '2 days';

  delete from auth.users as user_row
  where user_row.is_anonymous = true
    and user_row.created_at < now() - interval '30 days'
    and not exists (
      select 1 from public.games where host_user_id = user_row.id
    )
    and not exists (
      select 1 from public.players where user_id = user_row.id
    );
end;
$$;

revoke all on function public.purge_expired_mainpot_data() from public;

create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'purge-expired-mainpot-data';
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'purge-expired-mainpot-data',
    '17 * * * *',
    'select public.purge_expired_mainpot_data()'
  );
end;
$$;

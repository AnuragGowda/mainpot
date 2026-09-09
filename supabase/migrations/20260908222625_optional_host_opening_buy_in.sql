-- Keep the host's control identity while making their opening ledger entry
-- optional. Existing RPC callers omit the final argument and retain the
-- historical playing-host behavior through its default.
drop function if exists public.create_game_guarded(text, text, text, numeric, text);

create function public.create_game_guarded(
  input_code text,
  input_game_name text,
  input_host_name text,
  input_buy_in numeric,
  input_session_id text,
  input_host_is_playing boolean default true
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
  if input_host_is_playing is null then
    raise exception 'Host participation must be specified';
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

  -- The host remains a player row because current host controls, game access,
  -- and later self-service buy-ins are all bound to that stable identity.
  insert into public.players(game_id, session_id, name, is_host, user_id)
  values (created_game.id, input_session_id, trim(input_host_name), true, auth.uid())
  returning * into created_player;

  insert into public.game_events(
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values
    (created_game.id, 'game_created', created_player.id, created_player.id, null,
      jsonb_build_object('player_name', created_player.name)),
    (created_game.id, 'player_joined', created_player.id, created_player.id, null,
      jsonb_build_object('player_name', created_player.name));

  if input_host_is_playing then
    insert into public.buy_ins(game_id, player_id, amount, type, verified)
    values (created_game.id, created_player.id, round(input_buy_in, 2), 'buy_in', true)
    returning id into created_buy_in_id;

    insert into public.game_events(
      game_id, event_type, actor_player_id, subject_player_id, amount, metadata
    ) values (
      created_game.id, 'buy_in_added', created_player.id, created_player.id,
      round(input_buy_in, 2),
      jsonb_build_object(
        'player_name', created_player.name,
        'buy_in_id', created_buy_in_id,
        'buy_in_type', 'buy_in'
      )
    );
  end if;

  insert into public.game_access(game_id, user_id)
  values (created_game.id, auth.uid())
  on conflict on constraint game_access_pkey do update set granted_at = now();

  return query select created_game.code::text, created_game.id, created_player.id;
end;
$$;

revoke all on function public.create_game_guarded(text, text, text, numeric, text, boolean) from public;
grant execute on function public.create_game_guarded(text, text, text, numeric, text, boolean) to authenticated;

-- A host who never entered the ledger still has a control identity in the
-- player list. On the active-to-settling transition, reconcile that untouched
-- identity at zero so it cannot hold up the cash-out count. This deliberately
-- leaves an existing cash-out or any host buy-in unchanged.
create or replace function public.set_zero_cash_out_for_nonplaying_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host_player_id uuid;
begin
  if old.status <> 'active' or new.status <> 'settling' then
    return new;
  end if;

  select id into host_player_id
  from public.players
  where game_id = new.id and is_host = true and left_at is null
  limit 1;

  if host_player_id is not null
    and not exists (
      select 1 from public.buy_ins
      where game_id = new.id and player_id = host_player_id
    )
    and not exists (
      select 1 from public.cash_outs
      where game_id = new.id and player_id = host_player_id
    ) then
    insert into public.cash_outs(game_id, player_id, amount)
    values (new.id, host_player_id, 0);
  end if;

  return new;
end;
$$;

revoke all on function public.set_zero_cash_out_for_nonplaying_host() from public;

drop trigger if exists set_zero_cash_out_for_nonplaying_host on public.games;
create trigger set_zero_cash_out_for_nonplaying_host
before update of status on public.games
for each row execute function public.set_zero_cash_out_for_nonplaying_host();

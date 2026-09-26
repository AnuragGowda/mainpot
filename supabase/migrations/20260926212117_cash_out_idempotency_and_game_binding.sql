-- A final stack belongs to exactly one player in one game. Do not merge or
-- silently rewrite legacy data: inconsistent rows stop for manual recovery.
do $$
declare
  mismatched_cash_out_count integer;
begin
  if exists (
    select 1
    from public.cash_outs
    where game_id is null or player_id is null
  ) then
    raise exception 'cash_outs contains rows without a game or player; repair them before adding cash-out integrity constraints';
  end if;

  if exists (
    select 1
    from public.cash_outs
    group by game_id, player_id
    having count(*) > 1
  ) then
    raise exception 'cash_outs contains duplicate game/player rows; resolve them manually before adding the unique constraint';
  end if;

  select count(*) into mismatched_cash_out_count
  from public.cash_outs as cash_out
  left join public.players as player
    on player.id = cash_out.player_id and player.game_id = cash_out.game_id
  where player.id is null;
  if mismatched_cash_out_count > 0 then
    raise exception '% historical cash-out rows have a mismatched game/player; repair them before adding cash-out integrity constraints', mismatched_cash_out_count;
  end if;
end;
$$;

alter table public.cash_outs
  alter column game_id set not null,
  alter column player_id set not null,
  add constraint cash_outs_game_player_key unique (game_id, player_id),
  add constraint cash_outs_player_game_fkey
    foreign key (player_id, game_id)
    references public.players(id, game_id) on delete cascade;

-- Store an immutable operation receipt. A browser can lose a response after a
-- transaction commits, so the same key must return the current saved row without
-- writing another activity event.
create table mainpot_private.cash_out_operations (
  operation_key uuid primary key,
  game_id uuid not null,
  player_id uuid not null,
  amount numeric(10,2) not null,
  actor_user_id uuid not null,
  cash_out_id uuid not null references public.cash_outs(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (player_id, game_id)
    references public.players(id, game_id) on delete cascade
);

revoke all on table mainpot_private.cash_out_operations from public;
revoke all on table mainpot_private.cash_out_operations from anon, authenticated;
alter table mainpot_private.cash_out_operations enable row level security;

create or replace function mainpot_private.save_cash_out(
  input_game_id uuid,
  input_player_id uuid,
  input_amount numeric,
  input_operation_key uuid
) returns public.cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_game public.games%rowtype;
  target_player public.players%rowtype;
  existing_operation mainpot_private.cash_out_operations%rowtype;
  saved public.cash_outs%rowtype;
  actor_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'A cash-out operation key is required.'; end if;
  if input_amount is null
    or input_amount < 0
    or input_amount > 99999999.99
    or input_amount::text in ('NaN', 'Infinity', '-Infinity')
    or round(input_amount, 2) <> input_amount then
    raise exception 'Enter a cash-out between $0.00 and $99,999,999.99 with no more than two decimals.';
  end if;

  -- Serialize retries before looking up their receipt, including two first
  -- attempts with the same key that otherwise both observe an absent row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(input_operation_key::text, 0));

  -- A retry after its transaction committed must still succeed if another
  -- actor finalized the game before the response reached this browser.
  select * into existing_operation
  from mainpot_private.cash_out_operations
  where operation_key = input_operation_key
  for update;
  if found then
    if existing_operation.game_id <> input_game_id
      or existing_operation.player_id <> input_player_id
      or existing_operation.amount <> round(input_amount, 2)
      or existing_operation.actor_user_id <> auth.uid() then
      raise exception 'This cash-out operation key belongs to a different request.';
    end if;
    select * into saved from public.cash_outs where id = existing_operation.cash_out_id;
    if not found then raise exception 'The saved cash-out is unavailable.'; end if;
    return saved;
  end if;

  -- This lock serializes the first-write check with lifecycle transitions and
  -- with another authorized device entering the same player's final stack.
  select * into locked_game
  from public.games
  where id = input_game_id
  for update;
  if not found then raise exception 'Game not found.'; end if;
  if locked_game.status <> 'settling' then raise exception 'Cash-outs can only change during settlement.'; end if;

  select * into target_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for key share;
  if not found then raise exception 'This player does not belong to this game.'; end if;
  if not (public.owns_player(input_player_id) or public.is_game_host(input_game_id)) then
    raise exception 'Only this player or the host can save the cash-out.';
  end if;
  if exists (
    select 1
    from public.early_cash_outs
    where game_id = input_game_id
      and player_id = input_player_id
      and status = 'locked'
  ) then
    raise exception 'A locked early cash-out cannot be changed.';
  end if;

  select id into actor_player_id
  from public.players
  where game_id = input_game_id and user_id = auth.uid()
  order by is_host desc, joined_at, id
  limit 1;

  insert into public.cash_outs (game_id, player_id, amount)
  values (input_game_id, input_player_id, round(input_amount, 2))
  on conflict (game_id, player_id) do update
    set amount = excluded.amount
  returning * into saved;

  insert into mainpot_private.cash_out_operations (
    operation_key, game_id, player_id, amount, actor_user_id, cash_out_id
  ) values (
    input_operation_key, input_game_id, input_player_id, round(input_amount, 2), auth.uid(), saved.id
  );

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    input_game_id, 'cash_out_updated', actor_player_id, input_player_id, saved.amount,
    jsonb_build_object('player_name', target_player.name)
  );
  return saved;
end;
$$;

revoke all on function mainpot_private.save_cash_out(uuid, uuid, numeric, uuid) from public;
grant execute on function mainpot_private.save_cash_out(uuid, uuid, numeric, uuid) to authenticated;

create or replace function public.save_cash_out(
  input_game_id uuid,
  input_player_id uuid,
  input_amount numeric,
  input_operation_key uuid
) returns public.cash_outs
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.save_cash_out(
    input_game_id, input_player_id, input_amount, input_operation_key
  );
$$;

revoke all on function public.save_cash_out(uuid, uuid, numeric, uuid) from public;
grant execute on function public.save_cash_out(uuid, uuid, numeric, uuid) to authenticated;

-- Direct Data API writes can bypass the receipt and activity transaction.
revoke insert, update, delete on table public.cash_outs from public, anon, authenticated;

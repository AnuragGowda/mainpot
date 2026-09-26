-- A successful financial mutation includes its authoritative activity record.
-- Any failed event insert rolls the entire transaction back; safe retries reuse
-- the existing buy-in key or the already-applied host action.
create or replace function public.create_buy_in_idempotent(
  input_game_id uuid, input_player_id uuid, input_amount numeric,
  input_type text, input_fronted_by_player_id uuid, input_operation_key uuid
) returns table (
  id uuid, game_id uuid, player_id uuid, amount numeric, type text,
  fronted_by_player_id uuid, verified boolean, created_at timestamptz, created boolean
)
language plpgsql security invoker set search_path = ''
as $$
declare
  saved public.buy_ins%rowtype;
  was_created boolean;
  actor_id uuid;
  borrower_name text;
  lender_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'An operation key is required.'; end if;
  insert into public.buy_ins (
    game_id, player_id, amount, type, fronted_by_player_id, verified, operation_key
  ) values (
    input_game_id, input_player_id, input_amount, input_type, input_fronted_by_player_id,
    public.is_game_host(input_game_id), input_operation_key
  ) on conflict (operation_key) do nothing returning * into saved;
  was_created := found;
  if not was_created then
    select * into saved from public.buy_ins as entry
    where entry.operation_key = input_operation_key
      and entry.game_id = input_game_id and entry.player_id = input_player_id
      and entry.amount = input_amount and entry.type = input_type
      and entry.fronted_by_player_id is not distinct from input_fronted_by_player_id;
    if not found then raise exception 'The operation key belongs to a different buy-in.'; end if;
  else
    select p.id into actor_id from public.players p
      where p.game_id = input_game_id and p.user_id = auth.uid()
      order by p.is_host desc, p.joined_at limit 1;
    select p.name into borrower_name from public.players p where p.id = input_player_id;
    select p.name into lender_name from public.players p where p.id = input_fronted_by_player_id;
    insert into public.game_events (game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
    values (input_game_id, 'buy_in_added', actor_id, input_player_id, saved.amount,
      jsonb_build_object('player_name', borrower_name, 'buy_in_id', saved.id,
        'buy_in_type', saved.type, 'fronted_by_name', lender_name));
  end if;
  return query select saved.id, saved.game_id, saved.player_id, saved.amount,
    saved.type, saved.fronted_by_player_id, saved.verified, saved.created_at, was_created;
end;
$$;
revoke all on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) to authenticated;

create or replace function public.apply_host_buy_in_action(input_buy_in_id uuid, input_action text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  saved public.buy_ins%rowtype;
  actor_id uuid;
  borrower_name text;
  lender_name text;
  event_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_action is null or input_action not in ('remove', 'verify', 'repay_advance') then raise exception 'Invalid buy-in action'; end if;
  select * into saved from public.buy_ins b where b.id = input_buy_in_id;
  -- Deleted entries make retries harmless and never append another event.
  if not found then return; end if;
  if not public.is_game_host(saved.game_id) then raise exception 'Only the host can change entries'; end if;
  -- All financial paths share the same phase/ledger serialization order.
  perform 1 from public.games g where g.id = saved.game_id and g.status = 'active' for update;
  if not found then raise exception 'The active ledger is already closed.'; end if;
  select * into saved from public.buy_ins b where b.id = input_buy_in_id for update;
  if not found then return; end if;
  if input_action = 'verify' and saved.verified then return; end if;
  if input_action = 'repay_advance' and saved.fronted_by_player_id is null then return; end if;
  select p.id into actor_id from public.players p
    where p.game_id = saved.game_id and p.user_id = auth.uid() and p.is_host
    order by p.joined_at limit 1;
  select p.name into borrower_name from public.players p where p.id = saved.player_id;
  select p.name into lender_name from public.players p where p.id = saved.fronted_by_player_id;
  if input_action = 'remove' then
    delete from public.buy_ins b where b.id = input_buy_in_id;
    event_name := 'buy_in_removed';
  elsif input_action = 'verify' then
    update public.buy_ins b set verified = true where b.id = input_buy_in_id;
    event_name := 'buy_in_verified';
  else
    update public.buy_ins b set fronted_by_player_id = null where b.id = input_buy_in_id;
    event_name := 'buy_in_advance_repaid';
  end if;
  insert into public.game_events (game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
  values (saved.game_id, event_name, actor_id, saved.player_id, saved.amount,
    jsonb_build_object('player_name', borrower_name, 'buy_in_id', saved.id,
      'buy_in_type', saved.type, 'fronted_by_name', lender_name));
end;
$$;
revoke all on function public.apply_host_buy_in_action(uuid, text) from public, anon;
grant execute on function public.apply_host_buy_in_action(uuid, text) to authenticated;

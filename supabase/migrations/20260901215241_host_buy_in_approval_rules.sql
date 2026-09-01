-- The host is the ledger authority: their own submissions are final
-- immediately, while player submissions remain pending for host approval.
create or replace function public.create_buy_in_idempotent(
  input_game_id uuid,
  input_player_id uuid,
  input_amount numeric,
  input_type text,
  input_fronted_by_player_id uuid,
  input_operation_key uuid
)
returns table (
  id uuid,
  game_id uuid,
  player_id uuid,
  amount numeric,
  type text,
  fronted_by_player_id uuid,
  verified boolean,
  created_at timestamptz,
  created boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  auto_verified boolean;
begin
  if input_operation_key is null then
    raise exception 'An operation key is required.';
  end if;

  auto_verified := public.is_game_host(input_game_id);

  return query
  with inserted as (
    insert into public.buy_ins (
      game_id,
      player_id,
      amount,
      type,
      fronted_by_player_id,
      verified,
      operation_key
    ) values (
      input_game_id,
      input_player_id,
      input_amount,
      input_type,
      input_fronted_by_player_id,
      auto_verified,
      input_operation_key
    )
    on conflict (operation_key) do nothing
    returning *
  )
  select
    inserted.id,
    inserted.game_id,
    inserted.player_id,
    inserted.amount,
    inserted.type,
    inserted.fronted_by_player_id,
    inserted.verified,
    inserted.created_at,
    true
  from inserted;

  if found then
    return;
  end if;

  return query
  select
    buy_in.id,
    buy_in.game_id,
    buy_in.player_id,
    buy_in.amount,
    buy_in.type,
    buy_in.fronted_by_player_id,
    buy_in.verified,
    buy_in.created_at,
    false
  from public.buy_ins as buy_in
  where buy_in.operation_key = input_operation_key
    and buy_in.game_id = input_game_id
    and buy_in.player_id = input_player_id
    and buy_in.amount = input_amount
    and buy_in.type = input_type
    and buy_in.fronted_by_player_id is not distinct from input_fronted_by_player_id;

  if not found then
    raise exception 'The operation key belongs to a different buy-in.';
  end if;
end;
$$;

revoke all on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) from public;
grant execute on function public.create_buy_in_idempotent(uuid, uuid, numeric, text, uuid, uuid) to authenticated;

drop policy if exists "buy ins create by player or host" on public.buy_ins;
create policy "buy ins create by player or host" on public.buy_ins
  for insert to authenticated
  with check (
    public.game_has_status(game_id, 'active')
    and (
      public.is_game_host(game_id)
      or (public.owns_player(player_id) and not verified)
    )
  );

drop policy if exists "buy ins update by player or host" on public.buy_ins;
drop policy if exists "buy ins update by host" on public.buy_ins;
create policy "buy ins update by host" on public.buy_ins
  for update to authenticated
  using (
    public.game_has_status(game_id, 'active')
    and public.is_game_host(game_id)
  )
  with check (
    public.game_has_status(game_id, 'active')
    and public.is_game_host(game_id)
  );

drop policy if exists "buy ins delete by player or host" on public.buy_ins;
drop policy if exists "buy ins delete by host" on public.buy_ins;
create policy "buy ins delete by host" on public.buy_ins
  for delete to authenticated
  using (
    public.game_has_status(game_id, 'active')
    and public.is_game_host(game_id)
  );

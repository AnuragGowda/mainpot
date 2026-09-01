-- A client-generated operation key lets retries return the original ledger
-- entry instead of creating a second buy-in. Existing entries keep a null key.
alter table public.buy_ins
  add column operation_key uuid;

alter table public.buy_ins
  add constraint buy_ins_operation_key_key unique (operation_key);

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
begin
  if input_operation_key is null then
    raise exception 'An operation key is required.';
  end if;

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
      false,
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

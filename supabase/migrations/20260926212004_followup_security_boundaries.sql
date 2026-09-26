-- Use the same game-before-entry locking order as every guarded host ledger action.
create or replace function mainpot_private.correct_buy_in_as_host(
  input_buy_in_id uuid,
  input_amount numeric,
  input_operation_key uuid
) returns public.buy_ins
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous public.buy_ins%rowtype;
  corrected public.buy_ins%rowtype;
  correction mainpot_private.buy_in_corrections%rowtype;
  subject public.players%rowtype;
  host_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'A correction key is required.'; end if;
  if input_amount is null or input_amount < 0.01 or input_amount > 99999999.99
    or input_amount::text in ('NaN', 'Infinity', '-Infinity')
    or round(input_amount, 2) <> input_amount then
    raise exception 'Enter an amount between $0.01 and $99,999,999.99 with no more than two decimals.';
  end if;

  -- Discover the game without locking the entry, then acquire the shared
  -- ledger lock order: game first, buy-in second. Keep ended games lockable so
  -- a successful correction can still be replayed after finalization.
  select * into previous from public.buy_ins where id = input_buy_in_id;
  if not found then raise exception 'Buy-in not found.'; end if;
  if not public.is_game_host(previous.game_id) then raise exception 'Only the host can correct a buy-in.'; end if;
  perform 1 from public.games where id = previous.game_id for update;
  select * into previous from public.buy_ins where id = input_buy_in_id for update;
  if not found then raise exception 'Buy-in not found.'; end if;
  if not public.is_game_host(previous.game_id) then raise exception 'Only the host can correct a buy-in.'; end if;

  -- A retry is still an authorization check. Do not disclose or replay a
  -- correction merely because another caller knows its UUID.
  select * into correction
  from mainpot_private.buy_in_corrections
  where operation_key = input_operation_key;
  if found then
    if correction.buy_in_id <> input_buy_in_id or correction.amount <> round(input_amount, 2) then
      raise exception 'This correction key belongs to a different buy-in.';
    end if;
    return previous;
  end if;

  if not public.game_has_status(previous.game_id, 'active') then
    raise exception 'The active ledger is already closed.';
  end if;

  perform set_config('mainpot.host_buy_in_correction', 'true', true);
  update public.buy_ins
  set amount = round(input_amount, 2), verified = true
  where id = previous.id
  returning * into corrected;

  insert into mainpot_private.buy_in_corrections(operation_key, buy_in_id, amount)
  values (input_operation_key, corrected.id, corrected.amount);

  select * into subject from public.players where id = corrected.player_id;
  select id into host_player_id from public.players
  where game_id = corrected.game_id and is_host = true and left_at is null
  limit 1;
  insert into public.game_events(game_id, event_type, actor_player_id, subject_player_id, amount, metadata)
  values (
    corrected.game_id, 'buy_in_updated', host_player_id, corrected.player_id, corrected.amount,
    jsonb_build_object(
      'player_name', subject.name,
      'buy_in_id', corrected.id,
      'buy_in_type', corrected.type,
      'previous_amount', previous.amount,
      'verified_by_correction', true
    )
  );
  return corrected;
end;
$$;

revoke all on function mainpot_private.correct_buy_in_as_host(uuid, numeric, uuid) from public;
grant execute on function mainpot_private.correct_buy_in_as_host(uuid, numeric, uuid) to authenticated;


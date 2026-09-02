-- Keep payment tracking usable when Supabase rotates an anonymous auth user
-- while the browser's stable game session still identifies the same player.
create or replace function public.set_settlement_payment_status_guarded(
  input_game_id uuid,
  input_from_player_id uuid,
  input_to_player_id uuid,
  input_amount numeric,
  input_mode text,
  input_settled boolean,
  input_session_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_has_access boolean;
  caller_can_manage boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;
  if input_from_player_id is null
    or input_to_player_id is null
    or input_from_player_id = input_to_player_id then
    raise exception 'This payment cannot be identified';
  end if;
  if input_amount is null or input_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if input_mode not in ('min', 'bank') then
    raise exception 'Invalid settlement mode';
  end if;
  if not public.game_has_status(input_game_id, 'ended') then
    raise exception 'Payment tracking starts after the settlement is locked';
  end if;
  if not exists (
    select 1
    from public.players
    where id = input_from_player_id and game_id = input_game_id
  ) or not exists (
    select 1
    from public.players
    where id = input_to_player_id and game_id = input_game_id
  ) then
    raise exception 'This payment does not belong to this game';
  end if;

  select public.has_game_access(input_game_id) or public.is_game_host(input_game_id)
  into caller_has_access;
  if not caller_has_access then
    raise exception 'You no longer have access to this game';
  end if;

  select
    public.is_game_host(input_game_id)
    or public.owns_player(input_from_player_id)
    or public.owns_player(input_to_player_id)
    or exists (
      select 1
      from public.games
      where id = input_game_id and host_session_id = input_session_id
    )
    or exists (
      select 1
      from public.players
      where id in (input_from_player_id, input_to_player_id)
        and game_id = input_game_id
        and session_id = input_session_id
    )
  into caller_can_manage;
  if not caller_can_manage then
    raise exception 'Only the sender, recipient, or host can update this payment';
  end if;

  insert into public.settlement_payments (
    game_id,
    from_player_id,
    to_player_id,
    amount,
    mode,
    settled,
    settled_at,
    updated_at
  ) values (
    input_game_id,
    input_from_player_id,
    input_to_player_id,
    round(input_amount, 2),
    input_mode,
    input_settled,
    case when input_settled then now() else null end,
    now()
  )
  on conflict (game_id, from_player_id, to_player_id, amount, mode)
  do update set
    settled = excluded.settled,
    settled_at = excluded.settled_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.set_settlement_payment_status_guarded(
  uuid, uuid, uuid, numeric, text, boolean, text
) from public;
grant execute on function public.set_settlement_payment_status_guarded(
  uuid, uuid, uuid, numeric, text, boolean, text
) to authenticated;

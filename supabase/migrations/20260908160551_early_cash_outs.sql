-- Let a player lock one final stack against the current host while the table
-- remains active. The app only tracks the agreed ledger and external payment;
-- it never moves money itself.
create table public.early_cash_outs (
  id uuid default gen_random_uuid() primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null,
  bank_player_id uuid,
  cash_out_amount numeric(10,2) not null check (cash_out_amount >= 0),
  verified_buy_in_amount numeric(10,2),
  funding_adjustment numeric(10,2),
  net_amount numeric(10,2),
  status text not null default 'requested'
    check (status in ('requested', 'locked', 'cancelled')),
  requested_at timestamptz not null default now(),
  locked_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (game_id, player_id),
  foreign key (player_id, game_id)
    references public.players(id, game_id),
  foreign key (bank_player_id, game_id)
    references public.players(id, game_id),
  check (bank_player_id is null or bank_player_id <> player_id),
  check (
    (status = 'requested' and bank_player_id is null and net_amount is null and locked_at is null and cancelled_at is null)
    or (status = 'cancelled' and bank_player_id is null and net_amount is null and locked_at is null and cancelled_at is not null)
    or (status = 'locked' and bank_player_id is not null and net_amount is not null and locked_at is not null and cancelled_at is null)
  )
);

create index early_cash_outs_game_status_idx
  on public.early_cash_outs(game_id, status, requested_at);
create index early_cash_outs_bank_idx
  on public.early_cash_outs(bank_player_id, locked_at)
  where status = 'locked';

alter table public.early_cash_outs enable row level security;
revoke all on table public.early_cash_outs from anon, authenticated;
grant select on table public.early_cash_outs to authenticated;

create policy "early cash outs read with room access"
on public.early_cash_outs
for select
to authenticated
using (public.has_game_access(game_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'early_cash_outs'
  ) then
    alter publication supabase_realtime add table public.early_cash_outs;
  end if;
end $$;

alter table public.game_events
  drop constraint if exists game_events_event_type_check;
alter table public.game_events
  add constraint game_events_event_type_check check (event_type in (
    'game_created', 'player_joined', 'buy_in_added', 'buy_in_updated',
    'buy_in_advance_repaid', 'buy_in_removed', 'buy_in_verified',
    'player_left', 'player_removed', 'host_transferred', 'cash_out_updated',
    'game_settling', 'game_finalized', 'host_returned_to_create',
    'discrepancy_allocated', 'early_cash_out_requested',
    'early_cash_out_cancelled', 'early_cash_out_locked'
  ));

alter table public.settlement_payments
  drop constraint if exists settlement_payments_mode_check;
alter table public.settlement_payments
  add constraint settlement_payments_mode_check
  check (mode in ('min', 'bank', 'early_exit'));

create or replace function public.request_early_cash_out(
  input_game_id uuid,
  input_player_id uuid,
  input_cash_out_amount numeric,
  input_session_id text
) returns public.early_cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_player public.players%rowtype;
  requested public.early_cash_outs%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;
  if input_cash_out_amount is null or input_cash_out_amount < 0 then
    raise exception 'Cash-out amount must be zero or greater';
  end if;
  if not public.game_has_status(input_game_id, 'active') then
    raise exception 'Early cash-out is only available while the table is active';
  end if;
  if not public.has_game_access(input_game_id) then
    raise exception 'You no longer have access to this game';
  end if;

  select * into found_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for update;
  if not found then raise exception 'Player not found'; end if;
  if found_player.left_at is not null then raise exception 'This player has already left the table'; end if;
  if found_player.is_host then raise exception 'Transfer the host role before requesting an early cash-out'; end if;
  if found_player.user_id is distinct from auth.uid() and found_player.session_id <> input_session_id then
    raise exception 'You can only request your own early cash-out';
  end if;

  insert into public.early_cash_outs (
    game_id, player_id, cash_out_amount, status, requested_at, updated_at
  ) values (
    input_game_id, input_player_id, round(input_cash_out_amount, 2), 'requested', now(), now()
  )
  on conflict (game_id, player_id) do update set
    cash_out_amount = excluded.cash_out_amount,
    status = 'requested',
    bank_player_id = null,
    verified_buy_in_amount = null,
    funding_adjustment = null,
    net_amount = null,
    requested_at = now(),
    locked_at = null,
    cancelled_at = null,
    updated_at = now()
  where public.early_cash_outs.status in ('requested', 'cancelled')
  returning * into requested;
  if not found then raise exception 'This early cash-out is already locked'; end if;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    input_game_id, 'early_cash_out_requested', input_player_id, input_player_id,
    requested.cash_out_amount,
    jsonb_build_object('player_name', found_player.name)
  );
  return requested;
end;
$$;

create or replace function public.cancel_early_cash_out(
  input_early_cash_out_id uuid,
  input_session_id text
) returns public.early_cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested public.early_cash_outs%rowtype;
  found_player public.players%rowtype;
  caller_is_host boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into requested from public.early_cash_outs
  where id = input_early_cash_out_id for update;
  if not found then raise exception 'Early cash-out request not found'; end if;
  if requested.status <> 'requested' then raise exception 'Only a pending early cash-out can be cancelled'; end if;
  if not public.game_has_status(requested.game_id, 'active') then
    raise exception 'The active ledger is already closed';
  end if;

  select * into found_player from public.players where id = requested.player_id;
  caller_is_host := public.is_game_host(requested.game_id);
  if not caller_is_host
    and found_player.user_id is distinct from auth.uid()
    and found_player.session_id <> input_session_id then
    raise exception 'Only the player or host can cancel this request';
  end if;

  update public.early_cash_outs set
    status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = requested.id returning * into requested;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    requested.game_id, 'early_cash_out_cancelled',
    case when caller_is_host then (
      select id from public.players where game_id = requested.game_id and is_host limit 1
    ) else requested.player_id end,
    requested.player_id, requested.cash_out_amount,
    jsonb_build_object('player_name', found_player.name)
  );
  return requested;
end;
$$;

create or replace function public.approve_early_cash_out(
  input_early_cash_out_id uuid
) returns public.early_cash_outs
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested public.early_cash_outs%rowtype;
  departing public.players%rowtype;
  bank public.players%rowtype;
  invested numeric(10,2);
  funding numeric(10,2);
  prior_carry numeric(10,2);
  final_net numeric(10,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into requested from public.early_cash_outs
  where id = input_early_cash_out_id for update;
  if not found then raise exception 'Early cash-out request not found'; end if;
  if requested.status <> 'requested' then raise exception 'This early cash-out is no longer pending'; end if;
  if not public.game_has_status(requested.game_id, 'active') then
    raise exception 'Early cash-out is only available while the table is active';
  end if;
  if not public.is_game_host(requested.game_id) then
    raise exception 'Only the host can approve an early cash-out';
  end if;

  select * into departing from public.players
  where id = requested.player_id and game_id = requested.game_id
  for update;
  if not found or departing.left_at is not null then
    raise exception 'This player has already left the table';
  end if;
  if departing.is_host then raise exception 'Transfer the host role before cashing out early'; end if;

  select * into bank from public.players
  where game_id = requested.game_id and is_host and left_at is null
  for update;
  if not found then raise exception 'The table needs an active host'; end if;

  if exists (
    select 1 from public.buy_ins
    where game_id = requested.game_id
      and not verified
      and (player_id = departing.id or fronted_by_player_id = departing.id)
  ) then
    raise exception 'Resolve every pending buy-in involving this player first';
  end if;

  if exists (
    select 1 from public.cash_outs
    where game_id = requested.game_id and player_id = departing.id
  ) then
    raise exception 'This player already has a cash-out';
  end if;

  select coalesce(sum(amount), 0) into invested
  from public.buy_ins
  where game_id = requested.game_id and player_id = departing.id and verified;

  select coalesce(sum(
    case
      when fronted_by_player_id = departing.id then amount
      when player_id = departing.id and fronted_by_player_id is not null then -amount
      else 0
    end
  ), 0) into funding
  from public.buy_ins
  where game_id = requested.game_id and verified
    and (player_id = departing.id or fronted_by_player_id = departing.id);

  select coalesce(sum(net_amount), 0) into prior_carry
  from public.early_cash_outs
  where game_id = requested.game_id and bank_player_id = departing.id and status = 'locked';

  final_net := round(requested.cash_out_amount - invested + funding + prior_carry, 2);

  insert into public.cash_outs(game_id, player_id, amount)
  values (requested.game_id, departing.id, requested.cash_out_amount);

  update public.early_cash_outs set
    bank_player_id = bank.id,
    verified_buy_in_amount = invested,
    funding_adjustment = funding + prior_carry,
    net_amount = final_net,
    status = 'locked',
    locked_at = now(),
    cancelled_at = null,
    updated_at = now()
  where id = requested.id returning * into requested;

  update public.players set left_at = requested.locked_at where id = departing.id;

  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, amount, metadata
  ) values (
    requested.game_id, 'early_cash_out_locked', bank.id, departing.id,
    requested.cash_out_amount,
    jsonb_build_object(
      'player_name', departing.name,
      'bank_player_name', bank.name,
      'net_amount', final_net
    )
  );
  insert into public.game_events (
    game_id, event_type, actor_player_id, subject_player_id, metadata
  ) values (
    requested.game_id, 'player_left', departing.id, departing.id,
    jsonb_build_object('player_name', departing.name, 'cash_out_locked', true)
  );
  return requested;
end;
$$;

create or replace function public.set_early_cash_out_payment_status(
  input_early_cash_out_id uuid,
  input_settled boolean,
  input_session_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  early_exit public.early_cash_outs%rowtype;
  departing public.players%rowtype;
  bank public.players%rowtype;
  from_id uuid;
  to_id uuid;
  payment_amount numeric(10,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(input_session_id) not between 8 and 128 then raise exception 'Invalid browser session'; end if;

  select * into early_exit from public.early_cash_outs where id = input_early_cash_out_id;
  if not found or early_exit.status <> 'locked' then raise exception 'Early cash-out is not locked'; end if;
  if abs(coalesce(early_exit.net_amount, 0)) <= 0.005 then raise exception 'No payment is needed'; end if;
  if not public.has_game_access(early_exit.game_id) then raise exception 'You no longer have access to this game'; end if;

  select * into departing from public.players where id = early_exit.player_id;
  select * into bank from public.players where id = early_exit.bank_player_id;
  if not public.is_game_host(early_exit.game_id)
    and departing.user_id is distinct from auth.uid()
    and bank.user_id is distinct from auth.uid()
    and departing.session_id <> input_session_id
    and bank.session_id <> input_session_id then
    raise exception 'Only the payer, recipient, or host can update this payment';
  end if;

  if early_exit.net_amount > 0 then
    from_id := bank.id;
    to_id := departing.id;
  else
    from_id := departing.id;
    to_id := bank.id;
  end if;
  payment_amount := round(abs(early_exit.net_amount), 2);

  insert into public.settlement_payments (
    game_id, from_player_id, to_player_id, amount, mode,
    settled, settled_at, updated_at
  ) values (
    early_exit.game_id, from_id, to_id, payment_amount, 'early_exit',
    input_settled, case when input_settled then now() else null end, now()
  )
  on conflict (game_id, from_player_id, to_player_id, amount, mode)
  do update set
    settled = excluded.settled,
    settled_at = excluded.settled_at,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.protect_locked_early_cash_out_buy_ins()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  protected_player_id uuid;
begin
  -- Serialize a buy-in touching a player whose exit is under review with the
  -- host's approval transaction. Whichever action locks the player first wins;
  -- the other then rechecks the now-current ledger state.
  perform 1
  from public.players as protected_player
  where protected_player.game_id = case when tg_op = 'INSERT' then new.game_id else old.game_id end
    and protected_player.id in (
      case when tg_op = 'DELETE' then old.player_id else new.player_id end,
      case when tg_op = 'DELETE' then old.fronted_by_player_id else new.fronted_by_player_id end,
      case when tg_op = 'UPDATE' then old.player_id else null end,
      case when tg_op = 'UPDATE' then old.fronted_by_player_id else null end
    )
    and exists (
      select 1
      from public.early_cash_outs as pending_exit
      where pending_exit.game_id = protected_player.game_id
        and pending_exit.player_id = protected_player.id
        and pending_exit.status = 'requested'
    )
  order by protected_player.id
  for update;

  select early_exit.player_id into protected_player_id
  from public.early_cash_outs as early_exit
  where early_exit.game_id = case when tg_op = 'INSERT' then new.game_id else old.game_id end
    and early_exit.status = 'locked'
    and early_exit.player_id in (
      case when tg_op = 'DELETE' then old.player_id else new.player_id end,
      case when tg_op = 'DELETE' then old.fronted_by_player_id else new.fronted_by_player_id end,
      case when tg_op = 'UPDATE' then old.player_id else null end,
      case when tg_op = 'UPDATE' then old.fronted_by_player_id else null end
    )
  limit 1;
  if protected_player_id is not null then
    raise exception 'Buy-ins involving a locked early cash-out cannot be changed';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.protect_locked_early_cash_out_cash_out()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.early_cash_outs
    where game_id = old.game_id and player_id = old.player_id and status = 'locked'
  ) then
    raise exception 'A locked early cash-out cannot be changed';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_locked_early_cash_out_buy_ins
before insert or update or delete on public.buy_ins
for each row execute function public.protect_locked_early_cash_out_buy_ins();

create trigger protect_locked_early_cash_out_cash_out
before update or delete on public.cash_outs
for each row execute function public.protect_locked_early_cash_out_cash_out();

revoke all on function public.request_early_cash_out(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.request_early_cash_out(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.cancel_early_cash_out(uuid, text) from public, anon;
grant execute on function public.cancel_early_cash_out(uuid, text) to authenticated;
revoke all on function public.approve_early_cash_out(uuid) from public, anon;
grant execute on function public.approve_early_cash_out(uuid) to authenticated;
revoke all on function public.set_early_cash_out_payment_status(uuid, boolean, text) from public, anon;
grant execute on function public.set_early_cash_out_payment_status(uuid, boolean, text) to authenticated;
revoke all on function public.protect_locked_early_cash_out_buy_ins() from public, anon, authenticated;
revoke all on function public.protect_locked_early_cash_out_cash_out() from public, anon, authenticated;

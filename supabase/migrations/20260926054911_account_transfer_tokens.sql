-- Account creation replaces an anonymous Auth UID. Preserve a guest's own
-- games only through a short-lived capability minted by that anonymous UID;
-- browser session IDs are deliberately never accepted as proof of ownership.
create table public.account_transfer_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index account_transfer_tokens_source_expiry_idx
  on public.account_transfer_tokens(source_user_id, expires_at);

alter table public.account_transfer_tokens enable row level security;
revoke all on table public.account_transfer_tokens from anon, authenticated;

create or replace function public.issue_anonymous_account_transfer()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  transfer_token text;
begin
  if auth.uid() is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'Only an anonymous session can prepare an account transfer';
  end if;

  -- One current capability per anonymous identity limits the replay window.
  delete from public.account_transfer_tokens
  where source_user_id = auth.uid() or expires_at <= now();

  transfer_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.account_transfer_tokens(token_hash, source_user_id, expires_at)
  values (
    extensions.digest(transfer_token, 'sha256'),
    auth.uid(),
    now() + interval '10 minutes'
  );
  return transfer_token;
end;
$$;

create or replace function public.claim_anonymous_account_transfer(input_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  transfer public.account_transfer_tokens%rowtype;
  target_user_id uuid := auth.uid();
  transferred_players integer := 0;
  transferred_hosted_games integer := 0;
  finalized_results integer := 0;
begin
  if target_user_id is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'Sign in to a permanent account before claiming guest games';
  end if;
  if input_token !~ '^[0-9a-f]{64}$' then
    raise exception 'The guest transfer token is invalid';
  end if;

  select * into transfer
  from public.account_transfer_tokens
  where token_hash = extensions.digest(input_token, 'sha256')
  for update;
  if not found or transfer.expires_at <= now() then
    raise exception 'The guest transfer token is invalid or expired';
  end if;
  if not exists (
    select 1 from auth.users
    where id = transfer.source_user_id and is_anonymous = true
  ) then
    raise exception 'The guest transfer can no longer be claimed';
  end if;

  -- A target account must never gain a second seat or overwrite a different
  -- finalized result in a game it already belongs to.
  if exists (
    select 1
    from public.players as source_player
    join public.players as target_player
      on target_player.game_id = source_player.game_id
     and target_player.user_id = target_user_id
    where source_player.user_id = transfer.source_user_id
  ) or exists (
    select 1
    from public.players as source_player
    join public.game_participants as target_result
      on target_result.game_id = source_player.game_id
     and target_result.user_id = target_user_id
    where source_player.user_id = transfer.source_user_id
  ) then
    raise exception 'This account already has a seat or saved result in one of the guest games';
  end if;
  if exists (
    select 1
    from public.players
    where user_id = transfer.source_user_id
    group by game_id
    having count(*) > 1
  ) then
    raise exception 'Guest player records are ambiguous and cannot be transferred automatically';
  end if;

  -- Finalized anonymous players were deliberately excluded from the original
  -- end-game trigger. Insert their one canonical participation result before
  -- changing ownership, using the same raw ledger accounting as that trigger.
  insert into public.game_participants(game_id, user_id, player_id, net_result)
  select
    player.game_id,
    target_user_id,
    player.id,
    coalesce((select sum(amount) from public.cash_outs where player_id = player.id), 0)
      - coalesce((select sum(amount) from public.buy_ins where player_id = player.id), 0)
  from public.players as player
  join public.games as game on game.id = player.game_id
  where player.user_id = transfer.source_user_id
    and game.status = 'ended'
  on conflict (game_id, user_id) do update set
    player_id = excluded.player_id,
    net_result = excluded.net_result;
  get diagnostics finalized_results = row_count;

  update public.players
  set user_id = target_user_id
  where user_id = transfer.source_user_id;
  get diagnostics transferred_players = row_count;

  -- Permanent hosts retain their games indefinitely. Clearing the guest
  -- expiry also prevents an already-ended recovered game being purged.
  update public.games
  set host_user_id = target_user_id,
      host_is_anonymous = false,
      expires_at = null
  where host_user_id = transfer.source_user_id;
  get diagnostics transferred_hosted_games = row_count;

  delete from public.account_transfer_tokens where id = transfer.id;

  return jsonb_build_object(
    'players', transferred_players,
    'hosted_games', transferred_hosted_games,
    'finalized_results', finalized_results
  );
end;
$$;

revoke all on function public.issue_anonymous_account_transfer() from public;
revoke all on function public.claim_anonymous_account_transfer(text) from public;
grant execute on function public.issue_anonymous_account_transfer() to authenticated;
grant execute on function public.claim_anonymous_account_transfer(text) to authenticated;

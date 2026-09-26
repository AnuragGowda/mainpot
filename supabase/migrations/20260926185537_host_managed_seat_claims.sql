-- A host can hand an already-recorded managed seat to the person who arrives
-- later. The capability itself never reaches the database: only its SHA-256
-- digest is retained in a private schema.
create table mainpot_private.host_managed_seat_claims (
  token_hash bytea primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null unique references public.players(id) on delete cascade,
  expires_at timestamptz not null,
  claimed_by_user_id uuid references auth.users(id) on delete restrict,
  claimed_at timestamptz,
  claim_result jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (claimed_by_user_id is null and claimed_at is null and claim_result is null)
    or (claimed_by_user_id is not null and claimed_at is not null and claim_result is not null)
  )
);

create index host_managed_seat_claims_game_expiry_idx
  on mainpot_private.host_managed_seat_claims(game_id, expires_at);

revoke all on table mainpot_private.host_managed_seat_claims from public, anon, authenticated;

create or replace function mainpot_private.mint_host_managed_seat_claim(
  input_game_id uuid,
  input_player_id uuid,
  input_token_hash text
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  found_player public.players%rowtype;
  expires_at timestamptz := now() + interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if input_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid seat claim capability';
  end if;

  -- Match the claim path lock order: game, capability, then seat.
  select * into found_game
  from public.games
  where id = input_game_id
  for update;
  if not found then
    raise exception 'Game not found';
  end if;
  if found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can create a seat claim link';
  end if;
  if not exists (
    select 1 from public.players
    where game_id = input_game_id
      and is_host
      and user_id = auth.uid()
      and left_at is null
  ) then
    raise exception 'Only the active host can create a seat claim link';
  end if;
  if found_game.status <> 'active'
    or (found_game.expires_at is not null and found_game.expires_at <= now()) then
    raise exception 'Seat claims are only available for an active game';
  end if;

  select * into found_player
  from public.players
  where id = input_player_id and game_id = input_game_id
  for update;
  if not found then
    raise exception 'Player not found';
  end if;
  if found_player.is_host or found_player.user_id is not null or found_player.session_id is not null then
    raise exception 'Only an unclaimed host-managed seat can be shared';
  end if;
  if found_player.left_at is not null then
    raise exception 'A departed seat cannot be claimed';
  end if;
  if exists (
    select 1 from public.early_cash_outs
    where game_id = input_game_id and player_id = input_player_id
      and status in ('requested', 'locked')
  ) then
    raise exception 'A seat with an early cash-out cannot be claimed';
  end if;

  -- Reissuing is intentional and invalidates the older opaque capability.
  delete from mainpot_private.host_managed_seat_claims
  where player_id = input_player_id or expires_at <= now();
  insert into mainpot_private.host_managed_seat_claims(
    token_hash, game_id, player_id, expires_at
  ) values (
    decode(input_token_hash, 'hex'), input_game_id, input_player_id, expires_at
  );
  return expires_at;
end;
$$;

revoke all on function mainpot_private.mint_host_managed_seat_claim(uuid, uuid, text) from public;
grant execute on function mainpot_private.mint_host_managed_seat_claim(uuid, uuid, text) to authenticated;

create or replace function public.mint_host_managed_seat_claim(
  input_game_id uuid,
  input_player_id uuid,
  input_token_hash text
) returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.mint_host_managed_seat_claim(input_game_id, input_player_id, input_token_hash);
$$;

revoke all on function public.mint_host_managed_seat_claim(uuid, uuid, text) from public;
grant execute on function public.mint_host_managed_seat_claim(uuid, uuid, text) to authenticated;

create or replace function mainpot_private.claim_host_managed_seat(
  input_game_id uuid,
  input_token text,
  input_session_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_game public.games%rowtype;
  claim mainpot_private.host_managed_seat_claims%rowtype;
  found_player public.players%rowtype;
  claimant_user_id uuid := auth.uid();
  claim_payload jsonb;
  claim_game_id uuid;
begin
  if claimant_user_id is null then
    raise exception 'Authentication required';
  end if;
  if input_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'The seat claim link is invalid or expired';
  end if;
  if input_session_id is null or char_length(input_session_id) not between 8 and 128 then
    raise exception 'Invalid browser session';
  end if;

  -- Read just enough to lock the game first. A concurrent host reissue holds
  -- that same game lock, so it cannot race a successful claim into another seat.
  select game_id into claim_game_id
  from mainpot_private.host_managed_seat_claims
  where token_hash = extensions.digest(input_token, 'sha256');
  if not found then
    raise exception 'The seat claim link is invalid or expired';
  end if;
  if claim_game_id <> input_game_id then
    raise exception 'This seat claim link is for another game';
  end if;

  select * into found_game
  from public.games
  where id = claim_game_id
  for update;
  if not found then
    raise exception 'The seat claim link is no longer available';
  end if;

  select * into claim
  from mainpot_private.host_managed_seat_claims
  where token_hash = extensions.digest(input_token, 'sha256')
  for update;
  if not found then
    raise exception 'The seat claim link is invalid or expired';
  end if;
  if claim.claimed_by_user_id is not null then
    if claim.claimed_by_user_id = claimant_user_id then
      insert into public.game_access(game_id, user_id)
      values (claim.game_id, claimant_user_id)
      on conflict (game_id, user_id) do update set granted_at = now();
      return claim.claim_result;
    end if;
    raise exception 'The seat claim link has already been used';
  end if;
  if found_game.status <> 'active'
    or (found_game.expires_at is not null and found_game.expires_at <= now()) then
    raise exception 'The seat claim link is no longer available';
  end if;
  if claim.expires_at <= now() then
    raise exception 'The seat claim link is invalid or expired';
  end if;

  select * into found_player
  from public.players
  where id = claim.player_id and game_id = claim.game_id
  for update;
  if not found or found_player.is_host
    or found_player.user_id is not null or found_player.session_id is not null then
    raise exception 'This seat is no longer available';
  end if;
  if found_player.left_at is not null then
    raise exception 'A departed seat cannot be claimed';
  end if;
  if exists (
    select 1 from public.early_cash_outs
    where game_id = claim.game_id and player_id = claim.player_id
      and status in ('requested', 'locked')
  ) then
    raise exception 'A seat with an early cash-out cannot be claimed';
  end if;
  if exists (
    select 1 from public.players
    where game_id = claim.game_id and user_id = claimant_user_id and id <> claim.player_id
  ) then
    raise exception 'This account already has a seat in the game';
  end if;

  update public.players
  set user_id = claimant_user_id, session_id = input_session_id
  where id = claim.player_id;
  insert into public.game_access(game_id, user_id)
  values (claim.game_id, claimant_user_id)
  on conflict (game_id, user_id) do update set granted_at = now();

  claim_payload := jsonb_build_object(
    'game_id', claim.game_id,
    'player_id', claim.player_id
  );
  update mainpot_private.host_managed_seat_claims
  set claimed_by_user_id = claimant_user_id,
      claimed_at = now(),
      claim_result = claim_payload
  where token_hash = claim.token_hash;
  return claim_payload;
end;
$$;

revoke all on function mainpot_private.claim_host_managed_seat(uuid, text, text) from public;
grant execute on function mainpot_private.claim_host_managed_seat(uuid, text, text) to authenticated;

create or replace function public.claim_host_managed_seat(
  input_game_id uuid,
  input_token text,
  input_session_id text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select mainpot_private.claim_host_managed_seat(input_game_id, input_token, input_session_id);
$$;

revoke all on function public.claim_host_managed_seat(uuid, text, text) from public;
grant execute on function public.claim_host_managed_seat(uuid, text, text) to authenticated;

-- A browser can lose the response after the game ledger commits. Reserve the
-- operation before creating the game so the same browser request can safely
-- return its original table without consuming a second guest/table limit.
create table if not exists mainpot_private.game_creation_requests (
  operation_key uuid primary key,
  owner_user_id uuid not null,
  session_id text not null,
  code text not null,
  game_name text not null,
  host_name text not null,
  buy_in_amount numeric(10,2) not null,
  host_is_playing boolean not null,
  game_id uuid references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on table mainpot_private.game_creation_requests from public;

create or replace function mainpot_private.create_game_idempotent(
  input_code text,
  input_game_name text,
  input_host_name text,
  input_buy_in numeric,
  input_session_id text,
  input_host_is_playing boolean,
  input_operation_key uuid
) returns table(code text, game_id uuid, player_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request mainpot_private.game_creation_requests%rowtype;
  created record;
  host_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'A game creation key is required.'; end if;

  insert into mainpot_private.game_creation_requests(
    operation_key, owner_user_id, session_id, code, game_name, host_name,
    buy_in_amount, host_is_playing
  ) values (
    input_operation_key, auth.uid(), input_session_id, upper(btrim(input_code)),
    btrim(input_game_name), btrim(input_host_name), round(input_buy_in, 2),
    input_host_is_playing
  ) on conflict (operation_key) do nothing;

  -- An operation-key conflict waits for an in-flight creator to commit or
  -- roll back. Locking then makes the replay decision and the initial create
  -- one serial operation.
  select * into request
  from mainpot_private.game_creation_requests
  where operation_key = input_operation_key
  for update;

  if request.owner_user_id <> auth.uid() then
    raise exception 'This game creation request belongs to another account.';
  end if;
  if request.session_id <> input_session_id
    or request.code <> upper(btrim(input_code))
    or request.game_name <> btrim(input_game_name)
    or request.host_name <> btrim(input_host_name)
    or request.buy_in_amount <> round(input_buy_in, 2)
    or request.host_is_playing is distinct from input_host_is_playing then
    raise exception 'This game creation key belongs to different game details.';
  end if;

  if request.game_id is not null then
    select id into host_player_id
    from public.players
    where game_id = request.game_id and is_host = true and user_id = auth.uid()
    limit 1;
    if host_player_id is null then
      raise exception 'The original game could not be recovered.';
    end if;
    return query select game.code, game.id, host_player_id
    from public.games as game
    where game.id = request.game_id and game.host_user_id = auth.uid();
    if found then return; end if;
    raise exception 'The original game could not be recovered.';
  end if;

  select * into created
  from public.create_game_guarded(
    input_code,
    input_game_name,
    input_host_name,
    input_buy_in,
    input_session_id,
    input_host_is_playing
  );

  update mainpot_private.game_creation_requests
  set game_id = created.game_id
  where operation_key = input_operation_key;

  return query select created.code::text, created.game_id, created.player_id;
end;
$$;

revoke all on function mainpot_private.create_game_idempotent(text, text, text, numeric, text, boolean, uuid) from public;
grant execute on function mainpot_private.create_game_idempotent(text, text, text, numeric, text, boolean, uuid) to authenticated;

create or replace function public.create_game_idempotent(
  input_code text,
  input_game_name text,
  input_host_name text,
  input_buy_in numeric,
  input_session_id text,
  input_host_is_playing boolean,
  input_operation_key uuid
) returns table(code text, game_id uuid, player_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from mainpot_private.create_game_idempotent(
    input_code, input_game_name, input_host_name, input_buy_in,
    input_session_id, input_host_is_playing, input_operation_key
  );
$$;

revoke all on function public.create_game_idempotent(text, text, text, numeric, text, boolean, uuid) from public, anon;
grant execute on function public.create_game_idempotent(text, text, text, numeric, text, boolean, uuid) to authenticated;

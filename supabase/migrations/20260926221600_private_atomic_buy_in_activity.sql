-- Direct game_events appends are intentionally limited to a non-financial host
-- notice. Keep financial writes and their audit entries in definer-owned
-- transactions while retaining explicit caller authorization and phase guards.
create or replace function mainpot_private.create_buy_in_idempotent(
  input_game_id uuid, input_player_id uuid, input_amount numeric,
  input_type text, input_fronted_by_player_id uuid, input_operation_key uuid
) returns table (
  id uuid, game_id uuid, player_id uuid, amount numeric, type text,
  fronted_by_player_id uuid, verified boolean, created_at timestamptz, created boolean
) language plpgsql security definer set search_path='' as $$
declare saved public.buy_ins%rowtype; found_game public.games%rowtype; target public.players%rowtype;
  was_created boolean; actor_id uuid; borrower_name text; lender_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if input_operation_key is null then raise exception 'An operation key is required.'; end if;
  if input_type is null or input_type not in ('buy_in','rebuy') then raise exception 'Invalid buy-in type'; end if;
  select * into found_game from public.games g where g.id=input_game_id for update;
  if not found then raise exception 'Game not found.'; end if;
  select * into target from public.players p where p.id=input_player_id and p.game_id=input_game_id for update;
  if not found then raise exception 'Player not found.'; end if;
  if target.user_id is distinct from auth.uid() and found_game.host_user_id is distinct from auth.uid() then
    raise exception 'Only the player or current host can add this buy-in.';
  end if;
  -- An authorized exact receipt is safe to replay after the game advances or
  -- the player departs. Temporal checks below apply only to a new ledger row.
  select * into saved from public.buy_ins b
    where b.operation_key=input_operation_key and b.game_id=input_game_id and b.player_id=input_player_id
      and b.amount=input_amount and b.type=input_type
      and b.fronted_by_player_id is not distinct from input_fronted_by_player_id;
  if found then
    return query select saved.id,saved.game_id,saved.player_id,saved.amount,saved.type,saved.fronted_by_player_id,saved.verified,saved.created_at,false;
    return;
  end if;
  if exists (select 1 from public.buy_ins b where b.operation_key=input_operation_key) then
    raise exception 'The operation key belongs to a different buy-in.';
  end if;
  if found_game.status <> 'active' then raise exception 'The active ledger is already closed.'; end if;
  if target.left_at is not null then raise exception 'This player has left the table.'; end if;
  if input_fronted_by_player_id is not null and not exists (select 1 from public.players p where p.id=input_fronted_by_player_id and p.game_id=input_game_id) then
    raise exception 'The fronting player must be at this table.';
  end if;
  insert into public.buy_ins(game_id,player_id,amount,type,fronted_by_player_id,verified,operation_key)
  values(input_game_id,input_player_id,input_amount,input_type,input_fronted_by_player_id,found_game.host_user_id=auth.uid(),input_operation_key)
  on conflict(operation_key) do nothing returning * into saved;
  was_created:=found;
  if not was_created then
    select * into saved from public.buy_ins b where b.operation_key=input_operation_key and b.game_id=input_game_id and b.player_id=input_player_id and b.amount=input_amount and b.type=input_type and b.fronted_by_player_id is not distinct from input_fronted_by_player_id;
    if not found then raise exception 'The operation key belongs to a different buy-in.'; end if;
  else
    select p.id into actor_id from public.players p where p.game_id=input_game_id and p.user_id=auth.uid() and p.left_at is null order by p.is_host desc,p.joined_at limit 1;
    if actor_id is null then raise exception 'An active player identity is required.'; end if;
    select p.name into borrower_name from public.players p where p.id=input_player_id;
    select p.name into lender_name from public.players p where p.id=input_fronted_by_player_id;
    insert into public.game_events(game_id,event_type,actor_player_id,subject_player_id,amount,metadata)
    values(input_game_id,'buy_in_added',actor_id,input_player_id,saved.amount,jsonb_build_object('player_name',borrower_name,'buy_in_id',saved.id,'buy_in_type',saved.type,'fronted_by_name',lender_name));
  end if;
  return query select saved.id,saved.game_id,saved.player_id,saved.amount,saved.type,saved.fronted_by_player_id,saved.verified,saved.created_at,was_created;
end $$;
create or replace function public.create_buy_in_idempotent(input_game_id uuid,input_player_id uuid,input_amount numeric,input_type text,input_fronted_by_player_id uuid,input_operation_key uuid)
returns table(id uuid,game_id uuid,player_id uuid,amount numeric,type text,fronted_by_player_id uuid,verified boolean,created_at timestamptz,created boolean)
language sql security invoker set search_path='' as $$ select * from mainpot_private.create_buy_in_idempotent(input_game_id,input_player_id,input_amount,input_type,input_fronted_by_player_id,input_operation_key) $$;
revoke all on function mainpot_private.create_buy_in_idempotent(uuid,uuid,numeric,text,uuid,uuid) from public,anon;
grant execute on function mainpot_private.create_buy_in_idempotent(uuid,uuid,numeric,text,uuid,uuid) to authenticated;
revoke all on function public.create_buy_in_idempotent(uuid,uuid,numeric,text,uuid,uuid) from public,anon;
grant execute on function public.create_buy_in_idempotent(uuid,uuid,numeric,text,uuid,uuid) to authenticated;

create or replace function mainpot_private.apply_host_buy_in_action(input_buy_in_id uuid,input_action text)
returns void language plpgsql security definer set search_path='' as $$
declare saved public.buy_ins%rowtype; found_game public.games%rowtype; actor_id uuid; borrower_name text; lender_name text; event_name text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if input_action is null or input_action not in ('remove','verify','repay_advance') then raise exception 'Invalid buy-in action'; end if;
 select * into saved from public.buy_ins b where b.id=input_buy_in_id; if not found then return; end if;
 select * into found_game from public.games g where g.id=saved.game_id for update;
 if not found or found_game.host_user_id is distinct from auth.uid() then raise exception 'Only the current host can change entries'; end if;
 if found_game.status <> 'active' then raise exception 'The active ledger is already closed.'; end if;
 select * into saved from public.buy_ins b where b.id=input_buy_in_id for update; if not found then return; end if;
 if input_action='verify' and saved.verified then return; end if;
 if input_action='repay_advance' and saved.fronted_by_player_id is null then return; end if;
 select p.id into actor_id from public.players p where p.game_id=saved.game_id and p.user_id=auth.uid() and p.is_host and p.left_at is null order by p.joined_at limit 1;
 if actor_id is null then raise exception 'Only the active host can change entries'; end if;
 select p.name into borrower_name from public.players p where p.id=saved.player_id; select p.name into lender_name from public.players p where p.id=saved.fronted_by_player_id;
 if input_action='remove' then delete from public.buy_ins b where b.id=input_buy_in_id; event_name:='buy_in_removed';
 elsif input_action='verify' then update public.buy_ins b set verified=true where b.id=input_buy_in_id; event_name:='buy_in_verified';
 else update public.buy_ins b set fronted_by_player_id=null where b.id=input_buy_in_id; event_name:='buy_in_advance_repaid'; end if;
 insert into public.game_events(game_id,event_type,actor_player_id,subject_player_id,amount,metadata) values(saved.game_id,event_name,actor_id,saved.player_id,saved.amount,jsonb_build_object('player_name',borrower_name,'buy_in_id',saved.id,'buy_in_type',saved.type,'fronted_by_name',lender_name));
end $$;
create or replace function public.apply_host_buy_in_action(input_buy_in_id uuid,input_action text)
returns void language sql security invoker set search_path='' as $$ select mainpot_private.apply_host_buy_in_action(input_buy_in_id,input_action) $$;
revoke all on function mainpot_private.apply_host_buy_in_action(uuid,text) from public,anon;
grant execute on function mainpot_private.apply_host_buy_in_action(uuid,text) to authenticated;
revoke all on function public.apply_host_buy_in_action(uuid,text) from public,anon;
grant execute on function public.apply_host_buy_in_action(uuid,text) to authenticated;

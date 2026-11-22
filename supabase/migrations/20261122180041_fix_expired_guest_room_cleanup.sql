create or replace function public.purge_expired_mainpot_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_game_id uuid;
begin
  for expired_game_id in
    select id
    from public.games
    where host_is_anonymous = true and expires_at <= now()
    order by id
    for update
  loop
    -- Keep the game locked while removing its early cash-outs first. Locked
    -- exits would otherwise reject the cascaded buy-in and cash-out deletes.
    delete from public.early_cash_outs where game_id = expired_game_id;
    delete from public.games where id = expired_game_id;
  end loop;

  delete from public.rate_limits
  where window_started_at < now() - interval '2 days';

  delete from auth.users as user_row
  where user_row.is_anonymous = true
    and user_row.created_at < now() - interval '30 days'
    and not exists (
      select 1 from public.games where host_user_id = user_row.id
    )
    and not exists (
      select 1 from public.players where user_id = user_row.id
    );
end;
$$;

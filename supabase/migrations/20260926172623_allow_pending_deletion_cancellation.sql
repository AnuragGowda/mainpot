-- Account holders may withdraw a request only before staff begin processing.
create or replace function mainpot_private.cancel_account_deletion()
returns public.account_deletion_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.account_deletion_requests;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'A permanent account is required.';
  end if;
  update public.account_deletion_requests set status = 'cancelled', updated_at = now()
  where user_id = auth.uid() and status = 'pending' returning * into result;
  if not found then
    select * into result from public.account_deletion_requests where user_id = auth.uid();
    if not found or result.status <> 'cancelled' then
      raise exception 'Only a pending deletion request can be cancelled. Contact support if processing has begun.';
    end if;
  end if;
  return result;
end;
$$;
revoke all on function mainpot_private.cancel_account_deletion() from public, anon;
grant execute on function mainpot_private.cancel_account_deletion() to authenticated;

create or replace function public.cancel_account_deletion()
returns public.account_deletion_requests
language sql security invoker set search_path = ''
as $$ select mainpot_private.cancel_account_deletion(); $$;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- Re-requesting must not reset a staff-owned processing/completed state.
create or replace function public.request_account_deletion()
returns public.account_deletion_requests
language plpgsql security definer set search_path = ''
as $$
declare result public.account_deletion_requests;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'A permanent account is required.';
  end if;
  insert into public.account_deletion_requests (user_id, status, requested_at, updated_at)
  values (auth.uid(), 'pending', now(), now())
  on conflict (user_id) do update set status = 'pending', requested_at = now(), updated_at = now()
  where account_deletion_requests.status in ('pending', 'cancelled') returning * into result;
  if not found then raise exception 'This request is already being processed. Contact support for help.'; end if;
  return result;
end;
$$;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
notify pgrst, 'reload schema';

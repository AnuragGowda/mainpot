-- Email confirmation links are valid for one hour by default. A transfer
-- prepared for that exact email may survive for the same bounded period; an
-- unbound OAuth capability remains limited to ten minutes.
alter table public.account_transfer_tokens
  add constraint account_transfer_tokens_max_lifetime_check
    check (expires_at <= created_at + interval '24 hours'),
  add constraint account_transfer_tokens_unbound_lifetime_check
    check (destination_email is not null or expires_at <= created_at + interval '10 minutes');

create or replace function public.issue_anonymous_account_transfer(input_destination_email text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  transfer_token text;
  destination_email text := nullif(lower(trim(input_destination_email)), '');
begin
  if auth.uid() is null
    or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false then
    raise exception 'Only an anonymous session can prepare an account transfer';
  end if;
  if destination_email is not null
    and (
      char_length(destination_email) > 320
      or destination_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
    ) then
    raise exception 'The destination email is invalid';
  end if;

  -- Reissuing before Auth replaces the anonymous identity is intentional: it
  -- replaces the old capability rather than extending an unbound proof.
  delete from public.account_transfer_tokens
  where source_user_id = auth.uid() or expires_at <= now();

  transfer_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.account_transfer_tokens(
    token_hash, source_user_id, destination_email, expires_at
  )
  values (
    extensions.digest(transfer_token, 'sha256'),
    auth.uid(),
    destination_email,
    now() + case
      when destination_email is null then interval '10 minutes'
      else interval '1 hour'
    end
  );
  return transfer_token;
end;
$$;

revoke all on function public.issue_anonymous_account_transfer(text) from public;
grant execute on function public.issue_anonymous_account_transfer(text) to authenticated;

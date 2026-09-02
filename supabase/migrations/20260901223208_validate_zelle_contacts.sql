-- A recipient must be an email address or a normalized U.S. mobile number.
-- NOT VALID preserves beta data already stored while enforcing the format for
-- every new or changed profile row.
alter table public.profiles
  add constraint profiles_zelle_contact_format_check
  check (
    zelle_handle is null
    or zelle_handle ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or zelle_handle ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'
  ) not valid;

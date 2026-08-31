-- Resolve PL/pgSQL output-column ambiguity in guarded game RPC upserts.
-- Fresh installs already receive the corrected definitions in the prior migration;
-- this patch safely updates projects where that migration was applied earlier.

do $fix$
declare
  function_ddl text;
  corrected_ddl text;
begin
  select pg_get_functiondef(
    'public.create_game_guarded(text,text,text,numeric,text)'::regprocedure
  ) into function_ddl;
  corrected_ddl := replace(
    function_ddl,
    'on conflict (game_id, user_id) do update',
    'on conflict on constraint game_access_pkey do update'
  );
  if corrected_ddl = function_ddl then
    raise exception 'Could not patch create_game_guarded conflict target';
  end if;
  execute corrected_ddl;

  select pg_get_functiondef(
    'public.join_game_guarded(text,text,text)'::regprocedure
  ) into function_ddl;
  corrected_ddl := replace(
    function_ddl,
    'on conflict (game_id, user_id) do update',
    'on conflict on constraint game_access_pkey do update'
  );
  if corrected_ddl = function_ddl then
    raise exception 'Could not patch join_game_guarded conflict target';
  end if;
  execute corrected_ddl;
end
$fix$;

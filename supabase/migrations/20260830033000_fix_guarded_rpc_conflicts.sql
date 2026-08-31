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
  corrected_ddl := regexp_replace(
    function_ddl,
    'on conflict\s*\(game_id,\s*user_id\)\s*do update',
    'on conflict on constraint game_access_pkey do update',
    'i'
  );
  if corrected_ddl <> function_ddl then
    execute corrected_ddl;
  end if;

  select pg_get_functiondef(
    'public.join_game_guarded(text,text,text)'::regprocedure
  ) into function_ddl;
  corrected_ddl := regexp_replace(
    function_ddl,
    'on conflict\s*\(game_id,\s*user_id\)\s*do update',
    'on conflict on constraint game_access_pkey do update',
    'i'
  );
  if corrected_ddl <> function_ddl then
    execute corrected_ddl;
  end if;
end
$fix$;

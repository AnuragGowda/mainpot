-- Keep primary labels compact enough for phones while accepting printable
-- Unicode names. NOT VALID preserves any older beta rows above the new limits;
-- PostgreSQL still enforces these constraints for every new or updated row.
alter table public.games
  add constraint games_name_compact_check
  check (
    char_length(btrim(name)) between 1 and 40
    and name !~ '[[:cntrl:]]'
  ) not valid;

alter table public.games
  add constraint games_host_name_compact_check
  check (
    char_length(btrim(host_name)) between 1 and 32
    and host_name !~ '[[:cntrl:]]'
  ) not valid;

alter table public.players
  add constraint players_name_compact_check
  check (
    char_length(btrim(name)) between 1 and 32
    and name !~ '[[:cntrl:]]'
  ) not valid;

alter table public.game_templates
  add constraint game_templates_name_compact_check
  check (
    char_length(btrim(name)) between 1 and 40
    and name !~ '[[:cntrl:]]'
  ) not valid;

alter table public.game_templates
  add constraint game_templates_game_name_compact_check
  check (
    char_length(btrim(game_name)) between 1 and 40
    and game_name !~ '[[:cntrl:]]'
  ) not valid;

-- Usernames are identifiers rather than display text, so intentionally keep
-- their existing lowercase ASCII format. Null represents no username.
alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z0-9_]{3,24}$') not valid;

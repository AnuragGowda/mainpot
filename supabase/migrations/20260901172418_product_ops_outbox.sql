-- Append-only, server-written Product Ops events. The collector reads this
-- table by its monotonic sequence cursor; client roles never receive access.
create table public.product_ops_outbox (
  sequence bigint generated always as identity primary key,
  environment text not null check (environment in ('development', 'staging', 'production')),
  event_name text not null check (char_length(event_name) between 1 and 128),
  occurred_at timestamptz not null,
  actor_id text not null check (char_length(actor_id) between 1 and 128),
  session_id text not null check (char_length(session_id) between 1 and 128),
  journey_id text,
  properties jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 128),
  received_at timestamptz not null default now()
);

create index product_ops_outbox_environment_sequence_idx
  on public.product_ops_outbox (environment, sequence);

alter table public.product_ops_outbox enable row level security;
revoke all on table public.product_ops_outbox from anon, authenticated, service_role;
revoke all on sequence public.product_ops_outbox_sequence_seq from anon, authenticated, service_role;
grant select, insert on table public.product_ops_outbox to service_role;
grant usage on sequence public.product_ops_outbox_sequence_seq to service_role;

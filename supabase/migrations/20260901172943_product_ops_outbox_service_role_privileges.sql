-- Correct the initial outbox grant for existing environments. The interim
-- collector uses the same server-role credential to read its sequence cursor.
revoke all on table public.product_ops_outbox from anon, authenticated, service_role;
revoke all on sequence public.product_ops_outbox_sequence_seq from anon, authenticated, service_role;
grant select, insert on table public.product_ops_outbox to service_role;
grant usage on sequence public.product_ops_outbox_sequence_seq to service_role;

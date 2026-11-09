create table if not exists public.checkout_idempotency (
  idempotency_key uuid primary key,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_json jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists checkout_idempotency_created_at_idx
  on public.checkout_idempotency (created_at);

alter table public.checkout_idempotency enable row level security;

create policy "Deny browser access to checkout idempotency"
on public.checkout_idempotency
for all to anon, authenticated
using (false)
with check (false);

revoke all on table public.checkout_idempotency from public, anon, authenticated;
grant select, insert, update, delete on table public.checkout_idempotency to service_role;

create or replace function public.place_storefront_order_idempotent(
  p_idempotency_key uuid,
  p_request_hash text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_notes text,
  p_payment_type text,
  p_discount_code text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.checkout_idempotency%rowtype;
  v_response jsonb;
begin
  if p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  delete from public.checkout_idempotency
  where created_at < pg_catalog.now() - interval '90 days';

  insert into public.checkout_idempotency (idempotency_key, request_hash)
  values (p_idempotency_key, p_request_hash)
  on conflict (idempotency_key) do nothing;

  select * into v_existing
  from public.checkout_idempotency
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'IDEMPOTENCY_RECORD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_existing.request_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
  end if;
  if v_existing.response_json is not null then
    return v_existing.response_json;
  end if;

  v_response := public.place_storefront_order(
    p_customer_name => p_customer_name,
    p_customer_phone => p_customer_phone,
    p_customer_address => p_customer_address,
    p_notes => p_notes,
    p_payment_type => p_payment_type,
    p_discount_code => p_discount_code,
    p_items => p_items
  );
  if v_response is null
    or pg_catalog.jsonb_typeof(v_response -> 'orderIds') <> 'array'
    or pg_catalog.jsonb_array_length(v_response -> 'orderIds') = 0 then
    raise exception 'CHECKOUT_TRANSACTION_FAILED' using errcode = 'P0001';
  end if;

  update public.checkout_idempotency
  set response_json = v_response
  where idempotency_key = p_idempotency_key;

  return v_response;
end;
$$;

revoke all on function public.place_storefront_order_idempotent(uuid, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_storefront_order_idempotent(uuid, text, text, text, text, text, text, text, jsonb)
  to service_role;

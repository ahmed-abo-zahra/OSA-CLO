alter table public.orders
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;

revoke all on table public.orders from anon, authenticated;
grant select (id, customer_id, status, total_amount, paid_amount, requested_payment_type, requested_deposit_amount, created_at, updated_at)
  on table public.orders to authenticated;

drop policy if exists customers_select_own_orders on public.orders;
create policy customers_select_own_orders on public.orders
  for select to authenticated
  using (customer_id = (select auth.uid()));

revoke all on table public.order_items from anon, authenticated;
grant select (order_id, product_name_en, product_name_ar, image_url, quantity, size, color, unit_price)
  on table public.order_items to authenticated;

drop policy if exists customers_select_own_order_items on public.order_items;
create policy customers_select_own_order_items on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders as customer_order
    where customer_order.id = order_items.order_id
      and customer_order.customer_id = (select auth.uid())
  ));

alter table public.checkout_idempotency
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create or replace function public.place_storefront_order_idempotent_for_customer(
  p_idempotency_key uuid,
  p_request_hash text,
  p_customer_id uuid,
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
  v_order_id text;
begin
  if p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  insert into public.checkout_idempotency (idempotency_key, request_hash, customer_id)
  values (p_idempotency_key, p_request_hash, p_customer_id)
  on conflict (idempotency_key) do nothing;

  select * into v_existing
  from public.checkout_idempotency
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'IDEMPOTENCY_RECORD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_existing.customer_id is distinct from p_customer_id then
    raise exception 'IDEMPOTENCY_CUSTOMER_MISMATCH' using errcode = '22023';
  end if;
  if v_existing.request_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
  end if;

  v_response := public.place_storefront_order_idempotent(
    p_idempotency_key => p_idempotency_key,
    p_request_hash => p_request_hash,
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

  for v_order_id in
    select pg_catalog.jsonb_array_elements_text(v_response -> 'orderIds')
  loop
    update public.orders
    set customer_id = p_customer_id
    where id = v_order_id::uuid
      and (customer_id is null or customer_id = p_customer_id);
    if not found then
      raise exception 'ORDER_OWNER_CONFLICT' using errcode = 'P0001';
    end if;
  end loop;

  return v_response;
end;
$$;

revoke all on function public.place_storefront_order_idempotent_for_customer(uuid, text, uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_storefront_order_idempotent_for_customer(uuid, text, uuid, text, text, text, text, text, text, jsonb)
  to service_role;

create or replace function public.place_storefront_order_idempotent_for_authenticated_customer(
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
  v_customer_id uuid := auth.uid();
begin
  if v_customer_id is null then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode = '28000';
  end if;

  return public.place_storefront_order_idempotent_for_customer(
    p_idempotency_key => p_idempotency_key,
    p_request_hash => p_request_hash,
    p_customer_id => v_customer_id,
    p_customer_name => p_customer_name,
    p_customer_phone => p_customer_phone,
    p_customer_address => p_customer_address,
    p_notes => p_notes,
    p_payment_type => p_payment_type,
    p_discount_code => p_discount_code,
    p_items => p_items
  );
end;
$$;

revoke all on function public.place_storefront_order_idempotent_for_authenticated_customer(uuid, text, text, text, text, text, text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.place_storefront_order_idempotent_for_authenticated_customer(uuid, text, text, text, text, text, text, text, jsonb)
  to authenticated;

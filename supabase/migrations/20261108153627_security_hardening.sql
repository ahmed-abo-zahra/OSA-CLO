-- Security hardening for the live platform.
-- Public catalog access is column-limited; writes stay behind server routes.

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime drop table public.products';
  end if;
end;
$$;

revoke all on table public.products from public, anon, authenticated;
grant select (
  id,
  name_en,
  name_ar,
  description,
  description_ar,
  category,
  selling_price,
  sizes,
  colors,
  stock_quantity,
  in_stock,
  is_available,
  image_url,
  image_urls,
  created_at,
  updated_at
) on table public.products to anon, authenticated;

create table public.api_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

create index api_rate_limits_updated_idx on public.api_rate_limits (updated_at);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant all on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window interval;
  v_count integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit < 1 or p_limit > 1000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_INPUT' using errcode = '22023';
  end if;

  v_window := pg_catalog.make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits (key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, v_now, 1, v_now)
  on conflict (key_hash) do update set
    window_started_at = case
      when public.api_rate_limits.window_started_at + v_window <= v_now then v_now
      else public.api_rate_limits.window_started_at
    end,
    request_count = case
      when public.api_rate_limits.window_started_at + v_window <= v_now then 1
      else public.api_rate_limits.request_count + 1
    end,
    updated_at = v_now
  returning request_count into v_count;

  -- Keep the table bounded without making every request scan it.
  if pg_catalog.pg_try_advisory_xact_lock(1130598641, 1) then
    delete from public.api_rate_limits
    where updated_at < v_now - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;

create or replace function public.update_partner_order(
  p_order_id uuid,
  p_partner_id uuid,
  p_status text default null,
  p_paid_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_partner_name text;
  v_activity jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_order_id is null or p_partner_id is null
     or (p_status is null and p_paid_amount is null)
     or (p_status is not null and p_status not in ('pending', 'processing', 'shipped', 'closed', 'cancelled'))
     or (p_paid_amount is not null and p_paid_amount < 0) then
    raise exception 'INVALID_ORDER_UPDATE' using errcode = '22023';
  end if;

  select name into v_partner_name
  from public.partners
  where id = p_partner_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id and partner_id = p_partner_id
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_paid_amount is not null and p_paid_amount > v_order.total_amount then
    raise exception 'PAID_AMOUNT_EXCEEDS_TOTAL' using errcode = '22023';
  end if;

  v_activity := coalesce(v_order.activity_log, '[]'::jsonb);
  if p_status is not null and p_status is distinct from v_order.status then
    v_activity := v_activity || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'status', p_status,
        'by', v_partner_name,
        'at', v_now
      )
    );
    if pg_catalog.jsonb_array_length(v_activity) > 100 then
      select coalesce(pg_catalog.jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
      into v_activity
      from pg_catalog.jsonb_array_elements(v_activity) with ordinality as item(value, ordinality)
      where item.ordinality > pg_catalog.jsonb_array_length(v_activity) - 100;
    end if;
  end if;

  update public.orders
  set status = coalesce(p_status, status),
      paid_amount = coalesce(p_paid_amount, paid_amount),
      activity_log = v_activity,
      updated_at = v_now
  where id = p_order_id and partner_id = p_partner_id
  returning * into v_order;

  return pg_catalog.jsonb_build_object(
    'id', v_order.id,
    'status', v_order.status,
    'paid_amount', v_order.paid_amount,
    'total_amount', v_order.total_amount,
    'activity_log', v_order.activity_log,
    'updated_at', v_order.updated_at
  );
end;
$$;

revoke all on function public.update_partner_order(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.update_partner_order(uuid, uuid, text, numeric) to service_role;

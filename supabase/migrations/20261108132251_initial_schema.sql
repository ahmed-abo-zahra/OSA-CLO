-- ASO CLO platform: clean schema for the new Supabase project.
-- Public clients can only read available catalog data and approved reviews.
-- All writes go through server-side API routes using the server-only secret key.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create table public.partners (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 80),
  initials text not null check (char_length(initials) between 1 and 8),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default pg_catalog.now()
);

insert into public.partners (id, slug, name, initials, color)
values
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'partner-a', 'Partner A', 'PA', '#7C3AED'),
  ('2a304931-2230-4960-9e44-b19ed5e0178b', 'partner-b', 'Partner B', 'PB', '#DB2777'),
  ('652f4263-d4e3-4bf6-a5c4-778e8a08c710', 'partner-c', 'Partner C', 'PC', '#D97706')
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  initials = excluded.initials,
  color = excluded.color;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  name_en text not null check (char_length(name_en) between 1 and 160),
  name_ar text check (name_ar is null or char_length(name_ar) <= 160),
  description text,
  description_ar text,
  category text not null check (category in (
    'abayas', 'isdals', 'dresses', 'tshirts', 'pants', 'sneakers',
    'heels', 'slippers', 'girls_bags', 'accessories', 'makeup', 'home_appliances'
  )),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12,2) not null check (selling_price > 0),
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  in_stock boolean not null default false,
  is_available boolean not null default true,
  image_url text,
  image_urls text[] not null default '{}',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint products_in_stock_requires_quantity check (not in_stock or stock_quantity > 0)
);

create index products_partner_created_idx on public.products (partner_id, created_at desc);
create index products_public_catalog_idx on public.products (is_available, in_stock, created_at desc);
create index products_category_idx on public.products (category);

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete cascade,
  code text not null unique check (code = upper(code) and char_length(code) between 2 and 50),
  type text not null check (type in ('percent', 'fixed')),
  value numeric(12,2) not null check (value > 0),
  min_order numeric(12,2) not null default 0 check (min_order >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint discount_percent_limit check (type <> 'percent' or value <= 100)
);

create index discount_codes_partner_idx on public.discount_codes (partner_id, created_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text check (customer_phone is null or char_length(customer_phone) between 10 and 20),
  customer_address text check (customer_address is null or char_length(customer_address) between 5 and 500),
  source text not null default 'manual' check (source in ('manual', 'facebook', 'whatsapp', 'instagram', 'walk_in', 'online_store')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'shipped', 'closed', 'cancelled')),
  notes text,
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  requested_payment_type text not null default 'full' check (requested_payment_type in ('full', 'deposit')),
  requested_deposit_amount numeric(12,2) not null default 0 check (requested_deposit_amount >= 0 and requested_deposit_amount <= total_amount),
  discount_code_id uuid references public.discount_codes(id) on delete set null,
  activity_log jsonb not null default '[]'::jsonb check (jsonb_typeof(activity_log) = 'array'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index orders_partner_created_idx on public.orders (partner_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_en text not null,
  product_name_ar text,
  image_url text,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  size text,
  color text,
  unit_price numeric(12,2) not null check (unit_price > 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  created_at timestamptz not null default pg_catalog.now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  is_approved boolean not null default false,
  created_at timestamptz not null default pg_catalog.now()
);

create index reviews_product_approved_idx on public.reviews (product_id, is_approved, created_at desc);

create table public.store_settings (
  key text primary key check (char_length(key) between 1 and 80),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.admin_login_attempts (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default pg_catalog.now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);

create index admin_login_attempts_updated_idx on public.admin_login_attempts (updated_at);

create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger discount_codes_set_updated_at before update on public.discount_codes
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
create trigger store_settings_set_updated_at before update on public.store_settings
for each row execute function public.set_updated_at();

alter table public.partners enable row level security;
alter table public.products enable row level security;
alter table public.discount_codes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.store_settings enable row level security;
alter table public.admin_login_attempts enable row level security;

revoke all on public.partners, public.products, public.discount_codes, public.orders,
  public.order_items, public.reviews, public.store_settings, public.admin_login_attempts from public, anon, authenticated;
grant select (
  id, name_en, name_ar, description, description_ar, category, selling_price,
  sizes, colors, stock_quantity, in_stock, is_available, image_url, image_urls,
  created_at, updated_at
) on public.products to anon, authenticated;
grant select on public.reviews, public.store_settings to anon, authenticated;
grant all on public.partners, public.products, public.discount_codes, public.orders,
  public.order_items, public.reviews, public.store_settings, public.admin_login_attempts to service_role;

create policy "Public can read available products"
on public.products for select to anon, authenticated
using (is_available and in_stock and stock_quantity > 0);

create policy "Public can read approved reviews"
on public.reviews for select to anon, authenticated
using (is_approved);

create policy "Public can read promotional popup setting"
on public.store_settings for select to anon, authenticated
using (key = 'promotional_popup');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read product images"
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images');

create or replace function public.place_storefront_order(
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
  v_name text := pg_catalog.btrim(coalesce(p_customer_name, ''));
  v_phone text := pg_catalog.regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_address text := pg_catalog.btrim(coalesce(p_customer_address, ''));
  v_payment_type text := coalesce(p_payment_type, 'full');
  v_discount public.discount_codes%rowtype;
  v_grand_total numeric(12,2) := 0;
  v_discount_basis numeric(12,2) := 0;
  v_total_discount numeric(12,2) := 0;
  v_allocated_discount numeric(12,2) := 0;
  v_partner_subtotal numeric(12,2);
  v_partner_discount numeric(12,2);
  v_order_total numeric(12,2);
  v_requested_deposit numeric(12,2);
  v_partner_count integer := 0;
  v_partner_index integer := 0;
  v_unique_product_count integer := 0;
  v_found_product_count integer := 0;
  v_order_id uuid;
  v_created_at timestamptz;
  v_group record;
  v_order_ids jsonb := '[]'::jsonb;
  v_orders jsonb := '[]'::jsonb;
begin
  if pg_catalog.char_length(v_name) < 2 or pg_catalog.char_length(v_name) > 120 then
    raise exception 'INVALID_CUSTOMER_NAME' using errcode = '22023';
  end if;
  if v_phone !~ '^(010|011|012|015)[0-9]{8}$' then
    raise exception 'INVALID_CUSTOMER_PHONE' using errcode = '22023';
  end if;
  if pg_catalog.char_length(v_address) < 5 or pg_catalog.char_length(v_address) > 500 then
    raise exception 'INVALID_CUSTOMER_ADDRESS' using errcode = '22023';
  end if;
  if v_payment_type not in ('full', 'deposit') then
    raise exception 'INVALID_PAYMENT_TYPE' using errcode = '22023';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_CART' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
    where item.product_id is null or item.partner_id is null
       or item.quantity is null or item.quantity < 1 or item.quantity > 50
  ) then
    raise exception 'INVALID_CART' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct item.product_id)
    into v_unique_product_count
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer);

  select pg_catalog.count(distinct product.id)
    into v_found_product_count
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
  join public.products as product on product.id = item.product_id;

  if v_unique_product_count = 0 or v_unique_product_count <> v_found_product_count then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Lock every referenced product in a stable order to prevent overselling under concurrency.
  perform product.id
  from public.products as product
  where product.id in (
    select distinct item.product_id
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
  )
  order by product.id
  for update;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid, partner_id uuid, quantity integer, size text, color text
    )
    join public.products as product on product.id = item.product_id
    where product.partner_id = item.partner_id
      and ((pg_catalog.cardinality(product.sizes) > 0 and not coalesce(item.size = any(product.sizes), false))
        or (pg_catalog.cardinality(product.colors) > 0 and not coalesce(item.color = any(product.colors), false)))
  ) then
    raise exception 'PRODUCT_OPTION_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select item.product_id,
      pg_catalog.sum(item.quantity)::integer as requested_quantity,
             pg_catalog.bool_and(item.partner_id = product.partner_id) as partner_matches
      from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
      join public.products as product on product.id = item.product_id
      group by item.product_id
    ) as requested
    join public.products as product on product.id = requested.product_id
    where not requested.partner_matches
       or not product.is_available
       or not product.in_stock
       or product.stock_quantity < requested.requested_quantity
  ) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select pg_catalog.round(pg_catalog.sum(product.selling_price * item.quantity), 2)
    into v_grand_total
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
  join public.products as product on product.id = item.product_id;

  select pg_catalog.count(*)
    into v_partner_count
  from (
    select product.partner_id
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
    join public.products as product on product.id = item.product_id
    group by product.partner_id
  ) as partner_groups;

  if nullif(pg_catalog.btrim(coalesce(p_discount_code, '')), '') is not null then
    select * into v_discount
    from public.discount_codes
    where code = pg_catalog.upper(pg_catalog.btrim(p_discount_code))
      and is_active
    for update;

    if not found then
      raise exception 'DISCOUNT_INVALID' using errcode = 'P0001';
    end if;
    if v_discount.expires_at is not null and v_discount.expires_at <= pg_catalog.now() then
      raise exception 'DISCOUNT_EXPIRED' using errcode = 'P0001';
    end if;
    if v_discount.max_uses is not null and v_discount.uses_count >= v_discount.max_uses then
      raise exception 'DISCOUNT_LIMIT_REACHED' using errcode = 'P0001';
    end if;

    if v_discount.partner_id is null then
      v_discount_basis := v_grand_total;
    else
      select pg_catalog.round(pg_catalog.sum(product.selling_price * item.quantity), 2)
        into v_discount_basis
      from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
      join public.products as product on product.id = item.product_id
      where product.partner_id = v_discount.partner_id;
    end if;

    if coalesce(v_discount_basis, 0) <= 0 then
      raise exception 'DISCOUNT_NOT_APPLICABLE' using errcode = 'P0001';
    end if;
    if v_discount_basis < v_discount.min_order then
      raise exception 'DISCOUNT_MINIMUM_NOT_MET' using errcode = 'P0001';
    end if;

    if v_discount.type = 'percent' then
      v_total_discount := pg_catalog.round(v_discount_basis * v_discount.value / 100, 2);
    else
      v_total_discount := least(v_discount.value, v_discount_basis);
    end if;
  end if;

  for v_group in
    select product.partner_id,
           pg_catalog.round(pg_catalog.sum(product.selling_price * item.quantity), 2) as subtotal
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
    join public.products as product on product.id = item.product_id
    group by product.partner_id
    order by product.partner_id
  loop
    v_partner_index := v_partner_index + 1;
    v_partner_subtotal := v_group.subtotal;
    v_partner_discount := 0;

    if v_discount.id is not null then
      if v_discount.partner_id is not null then
        if v_group.partner_id = v_discount.partner_id then
          v_partner_discount := v_total_discount;
        end if;
      elsif v_partner_index = v_partner_count then
        v_partner_discount := v_total_discount - v_allocated_discount;
      else
        v_partner_discount := pg_catalog.round(v_total_discount * v_partner_subtotal / v_grand_total, 2);
      end if;
    end if;

    v_allocated_discount := v_allocated_discount + v_partner_discount;
    v_order_total := greatest(0, v_partner_subtotal - v_partner_discount);
    v_requested_deposit := case
      when v_payment_type = 'deposit' then pg_catalog.round(v_order_total * 0.5, 2)
      else v_order_total
    end;

    insert into public.orders (
      partner_id, customer_name, customer_phone, customer_address, source, status,
      notes, total_amount, paid_amount, discount_amount, requested_payment_type,
      requested_deposit_amount, discount_code_id, activity_log
    ) values (
      v_group.partner_id, v_name, v_phone, v_address, 'online_store', 'pending',
      nullif(pg_catalog.btrim(coalesce(p_notes, '')), ''), v_order_total, 0,
      v_partner_discount, v_payment_type, v_requested_deposit,
      case when v_discount.id is null then null else v_discount.id end,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'status', 'pending', 'by', 'Storefront', 'at', pg_catalog.now()
      ))
    ) returning id, created_at into v_order_id, v_created_at;

    insert into public.order_items (
      order_id, product_id, product_name_en, product_name_ar, image_url,
      quantity, size, color, unit_price, cost_price
    )
    select v_order_id, product.id, product.name_en, product.name_ar, product.image_url,
           item.quantity, nullif(pg_catalog.btrim(item.size), ''),
           nullif(pg_catalog.btrim(item.color), ''), product.selling_price, product.cost_price
    from pg_catalog.jsonb_to_recordset(p_items) as item(
      product_id uuid, partner_id uuid, quantity integer, size text, color text
    )
    join public.products as product on product.id = item.product_id
    where product.partner_id = v_group.partner_id;

    update public.products as product
    set stock_quantity = product.stock_quantity - requested.requested_quantity,
        in_stock = (product.stock_quantity - requested.requested_quantity) > 0,
        updated_at = pg_catalog.now()
    from (
      select item.product_id, pg_catalog.sum(item.quantity)::integer as requested_quantity
      from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, partner_id uuid, quantity integer)
      join public.products as current_product on current_product.id = item.product_id
      where current_product.partner_id = v_group.partner_id
      group by item.product_id
    ) as requested
    where product.id = requested.product_id;

    v_order_ids := v_order_ids || pg_catalog.jsonb_build_array(v_order_id);
    v_orders := v_orders || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', v_order_id,
      'created_at', v_created_at,
      'partner_id', v_group.partner_id,
      'total_amount', v_order_total,
      'discount_amount', v_partner_discount,
      'requested_deposit_amount', v_requested_deposit
    ));
  end loop;

  if v_discount.id is not null then
    update public.discount_codes
    set uses_count = uses_count + 1,
        updated_at = pg_catalog.now()
    where id = v_discount.id;
  end if;

  return pg_catalog.jsonb_build_object(
    'orderIds', v_order_ids,
    'orders', v_orders,
    'discountAmount', v_total_discount,
    'grandTotal', v_grand_total - v_total_discount
  );
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.place_storefront_order(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_storefront_order(text, text, text, text, text, text, jsonb)
  to service_role;

-- Enable Realtime for the browser's public catalog subscription when the publication exists.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
     ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
end;
$$;

create or replace function public.place_manual_order(
  p_partner_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_address text,
  p_source text,
  p_notes text,
  p_paid_amount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_customer_name, ''));
  v_phone text := nullif(pg_catalog.regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g'), '');
  v_address text := nullif(pg_catalog.btrim(coalesce(p_customer_address, '')), '');
  v_source text := coalesce(p_source, 'manual');
  v_partner_name text;
  v_product_count integer := 0;
  v_found_product_count integer := 0;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_order public.orders%rowtype;
begin
  if pg_catalog.char_length(v_name) < 2 or pg_catalog.char_length(v_name) > 120 then
    raise exception 'INVALID_CUSTOMER_NAME' using errcode = '22023';
  end if;
  if v_phone is not null and pg_catalog.char_length(v_phone) not between 10 and 15 then
    raise exception 'INVALID_CUSTOMER_PHONE' using errcode = '22023';
  end if;
  if v_address is not null and pg_catalog.char_length(v_address) not between 5 and 500 then
    raise exception 'INVALID_CUSTOMER_ADDRESS' using errcode = '22023';
  end if;
  if p_notes is not null and pg_catalog.char_length(p_notes) > 500 then
    raise exception 'INVALID_ORDER_NOTES' using errcode = '22023';
  end if;
  if v_source not in ('manual', 'facebook', 'whatsapp', 'instagram', 'walk_in') then
    raise exception 'INVALID_ORDER_SOURCE' using errcode = '22023';
  end if;
  select partner.name into v_partner_name from public.partners as partner where partner.id = p_partner_id;
  if not found then
    raise exception 'INVALID_PARTNER' using errcode = '22023';
  end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array'
     or pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 100 then
    raise exception 'INVALID_CART' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
    where item.product_id is null or item.quantity is null or item.quantity < 1 or item.quantity > 50
  ) then
    raise exception 'INVALID_CART' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct item.product_id) into v_product_count
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer);
  select pg_catalog.count(distinct product.id) into v_found_product_count
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
  join public.products as product on product.id = item.product_id and product.partner_id = p_partner_id;
  if v_product_count = 0 or v_product_count <> v_found_product_count then
    raise exception 'PRODUCT_NOT_OWNED' using errcode = 'P0001';
  end if;

  perform product.id
  from public.products as product
  where product.partner_id = p_partner_id
    and product.id in (
      select distinct item.product_id
      from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
    )
  order by product.id
  for update;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
    join public.products as product on product.id = item.product_id and product.partner_id = p_partner_id
    where pg_catalog.cardinality(product.sizes) > 0
      and not coalesce(item.size = any(product.sizes), false)
  ) then
    raise exception 'PRODUCT_OPTION_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select item.product_id, pg_catalog.sum(item.quantity)::integer as requested_quantity
      from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
      group by item.product_id
    ) as requested
    join public.products as product on product.id = requested.product_id
    where product.partner_id <> p_partner_id
       or not product.is_available
       or not product.in_stock
       or product.stock_quantity < requested.requested_quantity
  ) then
    raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select pg_catalog.round(pg_catalog.sum(product.selling_price * item.quantity), 2) into v_total
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
  join public.products as product on product.id = item.product_id and product.partner_id = p_partner_id;
  v_paid := least(greatest(coalesce(p_paid_amount, 0), 0), v_total);

  insert into public.orders (
    partner_id, customer_name, customer_phone, customer_address, source, status,
    notes, total_amount, paid_amount, requested_payment_type, requested_deposit_amount,
    activity_log
  ) values (
    p_partner_id, v_name, v_phone, v_address, v_source, 'pending',
    nullif(pg_catalog.btrim(coalesce(p_notes, '')), ''), v_total, v_paid,
    'full', v_total,
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'status', 'pending', 'by', v_partner_name, 'at', pg_catalog.now()
    ))
  ) returning * into v_order;

  insert into public.order_items (
    order_id, product_id, product_name_en, product_name_ar, image_url,
    quantity, size, unit_price, cost_price
  )
  select v_order.id, product.id, product.name_en, product.name_ar, product.image_url,
         item.quantity, nullif(pg_catalog.btrim(item.size), ''), product.selling_price, product.cost_price
  from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
  join public.products as product on product.id = item.product_id and product.partner_id = p_partner_id;

  update public.products as product
  set stock_quantity = product.stock_quantity - requested.requested_quantity,
      in_stock = (product.stock_quantity - requested.requested_quantity) > 0,
      updated_at = pg_catalog.now()
  from (
    select item.product_id, pg_catalog.sum(item.quantity)::integer as requested_quantity
    from pg_catalog.jsonb_to_recordset(p_items) as item(product_id uuid, size text, quantity integer)
    group by item.product_id
  ) as requested
  where product.id = requested.product_id and product.partner_id = p_partner_id;

  return pg_catalog.jsonb_build_object(
    'id', v_order.id, 'partner_id', v_order.partner_id,
    'customer_name', v_order.customer_name, 'customer_phone', v_order.customer_phone,
    'customer_address', v_order.customer_address, 'source', v_order.source,
    'status', v_order.status, 'notes', v_order.notes,
    'total_amount', v_order.total_amount, 'paid_amount', v_order.paid_amount,
    'activity_log', v_order.activity_log, 'created_at', v_order.created_at,
    'updated_at', v_order.updated_at
  );
end;
$$;

create or replace function public.consume_admin_login_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_started_at timestamptz;
  v_attempts integer;
  v_blocked_until timestamptz;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  delete from public.admin_login_attempts
  where updated_at < pg_catalog.now() - interval '1 day';
  insert into public.admin_login_attempts (key_hash) values (p_key_hash)
  on conflict (key_hash) do nothing;

  select window_started_at, attempts, blocked_until
    into v_window_started_at, v_attempts, v_blocked_until
  from public.admin_login_attempts
  where key_hash = p_key_hash
  for update;

  if v_blocked_until is not null and v_blocked_until > pg_catalog.now() then return false; end if;
  if v_window_started_at <= pg_catalog.now() - interval '15 minutes' then
    update public.admin_login_attempts
    set window_started_at = pg_catalog.now(), attempts = 1, blocked_until = null, updated_at = pg_catalog.now()
    where key_hash = p_key_hash;
    return true;
  end if;

  v_attempts := v_attempts + 1;
  update public.admin_login_attempts
  set attempts = v_attempts,
      blocked_until = case when v_attempts > 5 then pg_catalog.now() + interval '15 minutes' else null end,
      updated_at = pg_catalog.now()
  where key_hash = p_key_hash;
  return v_attempts <= 5;
end;
$$;

create or replace function public.reset_admin_login_attempt(p_key_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.admin_login_attempts where key_hash = p_key_hash;
end;
$$;

revoke all on function public.place_manual_order(uuid, text, text, text, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.place_manual_order(uuid, text, text, text, text, text, numeric, jsonb)
  to service_role;
revoke all on function public.consume_admin_login_attempt(text), public.reset_admin_login_attempt(text)
  from public, anon, authenticated;
grant execute on function public.consume_admin_login_attempt(text), public.reset_admin_login_attempt(text)
  to service_role;

create table public.partner_category_assignments (
  partner_id uuid not null references public.partners(id) on delete cascade,
  category text not null check (category in (
    'abayas', 'isdals', 'dresses', 'tshirts', 'pants', 'sneakers',
    'heels', 'slippers', 'girls_bags', 'accessories', 'makeup', 'home_appliances'
  )),
  primary key (partner_id, category)
);

alter table public.partner_category_assignments enable row level security;
create policy deny_browser_access_to_partner_category_assignments
  on public.partner_category_assignments
  for all to anon, authenticated
  using (false)
  with check (false);
revoke all on table public.partner_category_assignments from public, anon, authenticated;
grant select on table public.partner_category_assignments to service_role;

insert into public.partner_category_assignments (partner_id, category) values
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'abayas'),
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'dresses'),
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'isdals'),
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'pants'),
  ('596c4367-1491-481f-b0f2-1825c2540ebd', 'tshirts'),
  ('2a304931-2230-4960-9e44-b19ed5e0178b', 'heels'),
  ('2a304931-2230-4960-9e44-b19ed5e0178b', 'slippers'),
  ('2a304931-2230-4960-9e44-b19ed5e0178b', 'sneakers'),
  ('652f4263-d4e3-4bf6-a5c4-778e8a08c710', 'accessories'),
  ('652f4263-d4e3-4bf6-a5c4-778e8a08c710', 'girls_bags'),
  ('652f4263-d4e3-4bf6-a5c4-778e8a08c710', 'home_appliances'),
  ('652f4263-d4e3-4bf6-a5c4-778e8a08c710', 'makeup');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.products AS product
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.partner_category_assignments AS assignment
      WHERE assignment.partner_id = product.partner_id
        AND assignment.category = product.category
    )
  ) THEN
    RAISE EXCEPTION 'EXISTING_PRODUCT_CATEGORY_ASSIGNMENT_MISMATCH';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_product_partner_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_category_assignments AS assignment
    WHERE assignment.partner_id = NEW.partner_id
      AND assignment.category = NEW.category
  ) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_ASSIGNED_TO_PARTNER'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_product_partner_category() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS products_enforce_partner_category ON public.products;
CREATE TRIGGER products_enforce_partner_category
  BEFORE INSERT OR UPDATE OF partner_id, category ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_partner_category();

CREATE OR REPLACE FUNCTION public.enforce_order_item_partner_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_partner_id uuid;
  v_product_partner_id uuid;
  v_category text;
BEGIN
  SELECT order_row.partner_id
  INTO v_order_partner_id
  FROM public.orders AS order_row
  WHERE order_row.id = NEW.order_id;

  SELECT product.partner_id, product.category
  INTO v_product_partner_id, v_category
  FROM public.products AS product
  WHERE product.id = NEW.product_id;

  IF v_order_partner_id IS NULL OR v_product_partner_id IS NULL THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE' USING ERRCODE = '23503';
  END IF;
  IF v_order_partner_id <> v_product_partner_id THEN
    RAISE EXCEPTION 'PRODUCT_NOT_OWNED' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.partner_category_assignments AS assignment
    WHERE assignment.partner_id = v_order_partner_id
      AND assignment.category = v_category
  ) THEN
    RAISE EXCEPTION 'CATEGORY_NOT_ASSIGNED_TO_PARTNER'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_order_item_partner_category() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_items_enforce_partner_category ON public.order_items;
CREATE TRIGGER order_items_enforce_partner_category
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_partner_category();

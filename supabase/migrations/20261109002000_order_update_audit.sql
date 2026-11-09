create or replace function public.update_partner_order_audited(
  p_order_id uuid,
  p_partner_id uuid,
  p_status text,
  p_paid_amount numeric,
  p_change_reason text
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
  v_reason text := case
    when p_change_reason is null or pg_catalog.btrim(p_change_reason) = '' then null
    else pg_catalog.btrim(p_change_reason)
  end;
  v_status_changed boolean;
  v_payment_changed boolean;
begin
  if p_order_id is null or p_partner_id is null
     or (p_status is null and p_paid_amount is null)
     or (p_status is not null and p_status not in ('pending', 'processing', 'shipped', 'closed', 'cancelled'))
     or (p_paid_amount is not null and p_paid_amount < 0)
     or (p_change_reason is not null and pg_catalog.length(pg_catalog.btrim(p_change_reason)) > 300) then
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

  v_status_changed := p_status is not null and p_status is distinct from v_order.status;
  v_payment_changed := p_paid_amount is not null and p_paid_amount is distinct from v_order.paid_amount;

  if v_status_changed and not (
    (v_order.status = 'pending' and p_status in ('processing', 'cancelled')) or
    (v_order.status = 'processing' and p_status in ('shipped', 'cancelled')) or
    (v_order.status = 'shipped' and p_status = 'closed')
  ) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22023';
  end if;

  if v_payment_changed and p_paid_amount < v_order.paid_amount
     and (v_reason is null or pg_catalog.length(v_reason) < 5) then
    raise exception 'PAYMENT_DECREASE_REQUIRES_REASON' using errcode = '22023';
  end if;
  if v_status_changed and p_status = 'cancelled' and v_order.paid_amount > 0 then
    raise exception 'PAYMENT_REFUND_REQUIRED' using errcode = '22023';
  end if;

  if v_status_changed and p_status = 'cancelled' then
    with restock as (
      select product_id, pg_catalog.sum(quantity)::integer as quantity
      from public.order_items
      where order_id = p_order_id
      group by product_id
    )
    update public.products as product
    set stock_quantity = product.stock_quantity + restock.quantity,
        in_stock = product.is_available and (product.stock_quantity + restock.quantity > 0)
    from restock
    where product.id = restock.product_id;
  end if;

  v_activity := case when pg_catalog.jsonb_typeof(v_order.activity_log) = 'array'
    then v_order.activity_log else '[]'::jsonb end;

  if v_status_changed then
    v_activity := v_activity || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type', 'status_change',
        'status', p_status,
        'previous_status', v_order.status,
        'by', v_partner_name,
        'at', v_now
      )
    );
  end if;

  if v_payment_changed then
    v_activity := v_activity || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'type', 'payment_adjustment',
        'status', 'payment_adjusted',
        'previous_paid_amount', v_order.paid_amount,
        'paid_amount', p_paid_amount,
        'reason', coalesce(v_reason, 'Payment recorded by partner'),
        'by', v_partner_name,
        'at', v_now
      )
    );
  end if;

  if pg_catalog.jsonb_array_length(v_activity) > 100 then
    select coalesce(pg_catalog.jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
      into v_activity
    from pg_catalog.jsonb_array_elements(v_activity) with ordinality as item(value, ordinality)
    where item.ordinality > pg_catalog.jsonb_array_length(v_activity) - 100;
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

revoke all on function public.update_partner_order_audited(uuid, uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.update_partner_order_audited(uuid, uuid, text, numeric, text)
  to service_role;

-- Preserve compatibility with an older deployed handler while routing it through the stricter rules.
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
begin
  return public.update_partner_order_audited(p_order_id, p_partner_id, p_status, p_paid_amount, null);
end;
$$;

revoke all on function public.update_partner_order(uuid, uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.update_partner_order(uuid, uuid, text, numeric)
  to service_role;

-- Sensitive records are intentionally available only through server-side APIs.
-- Explicit deny policies document the boundary while service_role bypasses RLS.
create policy "No direct access to partners"
on public.partners for all to anon, authenticated
using (false) with check (false);

create policy "No direct access to discount codes"
on public.discount_codes for all to anon, authenticated
using (false) with check (false);

create policy "No direct access to orders"
on public.orders for all to anon, authenticated
using (false) with check (false);

create policy "No direct access to order items"
on public.order_items for all to anon, authenticated
using (false) with check (false);

create policy "No direct access to admin login attempts"
on public.admin_login_attempts for all to anon, authenticated
using (false) with check (false);

create index orders_discount_code_id_idx on public.orders (discount_code_id);

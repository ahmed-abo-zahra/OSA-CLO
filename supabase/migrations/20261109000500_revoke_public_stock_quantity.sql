-- Keep exact inventory counts server-side; the public catalog exposes only availability.
revoke select (stock_quantity) on table public.products from public, anon, authenticated;

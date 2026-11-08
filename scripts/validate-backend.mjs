import { readFile } from 'node:fs/promises';

const checks = [];
const add = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [schema, checkoutRoute, manualOrderRoute, adminClient, browserClient, envExample, supabaseConfig, seed, accessMigration] = await Promise.all([
  read('supabase/migrations/20261108132251_initial_schema.sql'),
  read('src/app/api/checkout/route.ts'),
  read('src/app/api/admin/orders/route.ts'),
  read('src/lib/supabase-admin.ts'),
  read('src/lib/supabase.ts'),
  read('.env.example'),
  read('supabase/config.toml'),
  read('supabase/migrations/20261108132622_seed_sample_catalog.sql'),
  read('supabase/migrations/20261108132723_explicit_access_policies.sql'),
]);

for (const table of ['partners', 'products', 'discount_codes', 'orders', 'order_items', 'reviews', 'store_settings', 'admin_login_attempts']) {
  add(`schema contains ${table}`, schema.includes(`create table public.${table}`));
  add(`RLS enabled for ${table}`, schema.includes(`alter table public.${table} enable row level security`));
}
add('storefront order RPC exists', schema.includes('function public.place_storefront_order('));
add('manual order RPC exists', schema.includes('function public.place_manual_order('));
add('persistent login rate limit RPC exists', schema.includes('function public.consume_admin_login_attempt('));
add('default products start out of stock', schema.includes('in_stock boolean not null default false'));
add('table privileges are revoked from PUBLIC', schema.includes('from public, anon, authenticated;'));
add('public image policy is defined exactly once', (schema.match(/create policy "Public can read product images"/g) ?? []).length === 1);
add('sample catalog migration is explicitly fictional', seed.includes('Fictional portfolio catalog'));
add('sample catalog has 120 product rows', (seed.match(/"id":/g) ?? []).length === 120);
add('sensitive tables have explicit deny policies', ['partners', 'discount_codes', 'orders', 'order_items', 'admin_login_attempts'].every((table) => accessMigration.includes(`on public.${table} for all to anon, authenticated`)));
add('discount code foreign key is indexed', accessMigration.includes('create index orders_discount_code_id_idx'));
add('checkout calls transactional RPC', checkoutRoute.includes("rpc('place_storefront_order'"));
add('manual orders call transactional RPC', manualOrderRoute.includes("rpc('place_manual_order'"));
add('Supabase admin client is server-only', adminClient.includes("import 'server-only'"));
add('browser client never reads secret key', !browserClient.includes('SUPABASE_SECRET_KEY'));
add('environment sample has server-only key name', envExample.includes('SUPABASE_SECRET_KEY='));
add('environment sample does not expose service key as public', !envExample.includes('NEXT_PUBLIC_SUPABASE_SECRET_KEY'));
add('CLI config points at the new project', supabaseConfig.includes('rtokjrupdvftacewvmxm'));

let failed = false;
for (const { label, ok } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  failed ||= !ok;
}
console.log(`\n${checks.length - Number(failed)} checks passed; ${checks.filter((check) => !check.ok).length} failed.`);
if (failed) process.exitCode = 1;

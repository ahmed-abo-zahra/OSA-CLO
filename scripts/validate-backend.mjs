import { access, readFile, readdir } from 'node:fs/promises';

const projectRoot = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, projectRoot), 'utf8');
const exists = async (path) => {
  try {
    await access(new URL(path, projectRoot));
    return true;
  } catch {
    return false;
  }
};

const [schema, checkoutRoute, manualOrderRoute, orderUpdateRoute, orderModal, dashboardShell, adminClient, browserClient, envExample, supabaseConfig, seed, accessMigration, partnerLabelsMigration, hardeningMigration, rateLimitPolicyMigration, productsApi, requestSecurity, rateLimit, discountRoute, reviewsRoute, trackingRoute, storefront, checkoutPage, storefrontPage, productPage, productDetailClient, cartContext, bulkImport, readme, demoOrders, catalogFiles] = await Promise.all([
  read('supabase/migrations/20261108132251_initial_schema.sql'),
  read('src/app/api/checkout/route.ts'),
  read('src/app/api/admin/orders/route.ts'),
  read('src/app/api/admin/orders/[id]/route.ts'),
  read('src/app/admin/dashboard/OrderDetailsModal.tsx'),
  read('src/app/admin/dashboard/DashboardShell.tsx'),
  read('src/lib/supabase-admin.ts'),
  read('src/lib/supabase.ts'),
  read('.env.example'),
  read('supabase/config.toml'),
  read('supabase/migrations/20261108132622_seed_sample_catalog.sql'),
  read('supabase/migrations/20261108132723_explicit_access_policies.sql'),
  read('supabase/migrations/20261108144451_anonymize_partner_labels.sql'),
  read('supabase/migrations/20261108153627_security_hardening.sql'),
  read('supabase/migrations/20261108153712_rate_limit_deny_policy.sql'),
  read('src/app/api/products/route.ts'),
  read('src/lib/request-security.ts'),
  read('src/lib/rate-limit.ts'),
  read('src/app/api/discount/validate/route.ts'),
  read('src/app/api/reviews/route.ts'),
  read('src/app/api/track/[orderId]/route.ts'),
  read('src/components/storefront/StorefrontClient.tsx'),
  read('src/app/checkout/page.tsx'),
  read('src/app/page.tsx'),
  read('src/app/product/[id]/page.tsx'),
  read('src/app/product/[id]/ProductDetailClient.tsx'),
  read('src/context/CartContext.tsx'),
  read('src/app/admin/dashboard/BulkImport.tsx'),
  read('README.md'),
  read('src/lib/demo-orders.json'),
  readdir(new URL('public/catalog/', projectRoot)),
]);

const checks = [];
const add = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const tables = ['partners', 'products', 'discount_codes', 'orders', 'order_items', 'reviews', 'store_settings', 'admin_login_attempts'];
for (const table of tables) {
  add(`schema contains ${table}`, schema.includes(`create table public.${table}`));
  add(`RLS enabled for ${table}`, schema.includes(`alter table public.${table} enable row level security`));
}

const seedRows = [...seed.matchAll(/^\s*(\{"id":.*?\})(?:,)?\s*$/gm)].map((match) => JSON.parse(match[1]));
const seededIds = seedRows.map((row) => row.id);
const catalogImageNames = new Set(catalogFiles);
const expectedImageNames = seedRows.map((row) => `${row.category}-${String(row.image_index).padStart(2, '0')}.webp`);
const demoOrdersParsed = JSON.parse(demoOrders);
const publicProductGrant = hardeningMigration.match(/grant select\s*\(([^)]+)\)/i)?.[1] ?? '';

add('storefront order RPC exists', schema.includes('function public.place_storefront_order('));
add('manual order RPC exists', schema.includes('function public.place_manual_order('));
add('persistent login rate limit RPC exists', schema.includes('function public.consume_admin_login_attempt('));
add('default products start out of stock', schema.includes('in_stock boolean not null default false'));
add('table privileges are revoked from PUBLIC', schema.includes('from public, anon, authenticated;'));
add('public image policy is defined exactly once', (schema.match(/create policy "Public can read product images"/g) ?? []).length === 1);
add('demo catalog seed is explicitly identified as fictional', seed.includes('Fictional portfolio catalog'));
add('demo seed retains all 120 product rows', seededIds.length === 120 && new Set(seededIds).size === 120);
add('all 120 seeded product image assets are present', expectedImageNames.length === 120 && expectedImageNames.every((name) => catalogImageNames.has(name)));
add('product seed creates no demo orders or reviews', !/insert\s+into\s+public\.(orders|reviews)/i.test(seed));
add('no migration is staged to delete catalog products', !(await exists('supabase/migrations/20261108151510_remove_fictional_catalog.sql')));
add('sensitive tables have explicit deny policies', ['partners', 'discount_codes', 'orders', 'order_items', 'admin_login_attempts'].every((table) => accessMigration.includes(`on public.${table} for all to anon, authenticated`)));
add('discount code foreign key is indexed', accessMigration.includes('create index orders_discount_code_id_idx'));
add('checkout calls transactional RPC', checkoutRoute.includes("rpc('place_storefront_order'"));
add('manual orders call transactional RPC', manualOrderRoute.includes("rpc('place_manual_order'"));
add('Supabase admin client is server-only', adminClient.includes("import 'server-only'"));
add('browser client never reads secret key', !browserClient.includes('SUPABASE_SECRET_KEY'));
add('environment sample has server-only key name', envExample.includes('SUPABASE_SECRET_KEY='));
add('environment sample does not expose service key as public', !envExample.includes('NEXT_PUBLIC_SUPABASE_SECRET_KEY'));
add('CLI config points at the approved project', supabaseConfig.includes('rtokjrupdvftacewvmxm'));
add('partner schema uses generic labels', ['Partner A', 'Partner B', 'Partner C'].every((name) => schema.includes(name)));
add('partner password keys use generic labels', ['ADMIN_PASSWORD_PARTNER_A=', 'ADMIN_PASSWORD_PARTNER_B=', 'ADMIN_PASSWORD_PARTNER_C='].every((key) => envExample.includes(key)));
add('partner label migration preserves stable UUIDs', ['596c4367-1491-481f-b0f2-1825c2540ebd', '2a304931-2230-4960-9e44-b19ed5e0178b', '652f4263-d4e3-4bf6-a5c4-778e8a08c710'].every((id) => partnerLabelsMigration.includes(id)));
add('rate-limit migration creates a private persistent table', hardeningMigration.includes('create table public.api_rate_limits') && hardeningMigration.includes('enable row level security') && hardeningMigration.includes('to service_role'));
add('rate-limit table has an explicit deny policy for browser roles', rateLimitPolicyMigration.includes('for all') && rateLimitPolicyMigration.includes('to anon, authenticated') && rateLimitPolicyMigration.includes('using (false)') && rateLimitPolicyMigration.includes('with check (false)'));
add('rate-limit RPC is service-role only', hardeningMigration.includes('function public.consume_api_rate_limit') && hardeningMigration.includes('to service_role'));
add('order update RPC is atomic and partner-scoped', hardeningMigration.includes('function public.update_partner_order') && hardeningMigration.includes('where id = p_order_id and partner_id = p_partner_id'));
add('demo order updates stay local while production uses the RPC', orderUpdateRoute.includes('if (DEMO_MODE)') && orderUpdateRoute.includes("rpc('update_partner_order'") && orderUpdateRoute.includes(".eq('partner_id', partnerId)"));
add('admin order modal merges partial updates and supports JSONB logs', orderModal.includes('...current, ...data.order') && orderModal.includes('Array.isArray(value)'));
add('dashboard status changes only after a successful API response', dashboardShell.includes('if (!response.ok)') && dashboardShell.includes('handleOrderStatusChange(orderId, newStatus)'));
add('products are removed from the public Realtime publication', hardeningMigration.toLowerCase().includes('alter publication supabase_realtime drop table public.products'));
add('public product grant excludes cost and partner data', publicProductGrant.length > 0 && !/cost_price|partner_id/i.test(publicProductGrant));
add('public products REST API excludes cost and partner ownership', productsApi.includes('PUBLIC_PRODUCT_FIELDS') && !/cost_price|partner_id/i.test(productsApi));
add('storefront and product pages do not serialize partner IDs', !storefront.includes('partner_id') && !storefrontPage.includes('partner_id') && !productPage.includes('partner_id') && !productDetailClient.includes('partner_id'));
add('client cart and checkout do not carry partner IDs', !cartContext.includes('partnerId:string') && cartContext.includes('delete safeItem.partnerId') && !checkoutPage.includes('partnerId: i.partnerId') && !checkoutPage.includes('partner_id: item.partnerId'));
add('checkout derives partner ownership from the product table', checkoutRoute.includes(".select('id, partner_id')") && !checkoutRoute.includes('item.partner_id') && !checkoutRoute.includes('item.partnerId'));
add('discount validation derives partner ownership server-side', !discountRoute.includes('value.partner_id') && discountRoute.includes('product.partner_id'));
add('public products REST API filters unavailable inventory', productsApi.includes(".eq('is_available', true)") && productsApi.includes(".eq('in_stock', true)"));
add('same-origin helper requires Origin or Referer', requestSecurity.includes("headers.get('origin') ?? request.headers.get('referer')") && requestSecurity.includes('request.nextUrl.origin'));
add('rate limiter fails closed on missing secret or RPC error', rateLimit.includes('status: 503') && rateLimit.includes("rpc('consume_api_rate_limit'"));
add('checkout mutation has same-origin and rate checks', checkoutRoute.includes('hasSameOrigin(request)') && checkoutRoute.includes('enforceRateLimit'));
add('discount endpoint has same-origin and rate checks', discountRoute.includes('hasSameOrigin(request)') && discountRoute.includes('enforceRateLimit'));
add('review endpoints are rate limited and POST checks origin', reviewsRoute.includes('enforceRateLimit') && reviewsRoute.includes('hasSameOrigin(request)'));
add('tracking response does not expose phone or address', !trackingRoute.includes('customer_phone') && !trackingRoute.includes('customer_address'));
add('storefront and checkout have no product Realtime subscriptions', !storefront.includes('postgres_changes') && !checkoutPage.includes('postgres_changes') && !storefront.includes('.channel(') && !checkoutPage.includes('.channel('));
add('storefront refreshes from paginated REST products endpoint', storefront.includes('"/api/products"') && storefront.includes('fetch(path') && productsApi.includes('.range(offset, offset + PAGE_SIZE - 1)'));
add('empty catalog hero does not use synthetic product images', !storefront.includes('/demo/tshirts.png') && storefront.includes('products.length > 0'));
add('bulk import sends multipart FormData', bulkImport.includes('new FormData()') && !bulkImport.includes('"Content-Type": "application/json"'));
add('bulk import caps files and rows', bulkImport.includes('MAX_CSV_BYTES') && bulkImport.includes('MAX_IMPORT_ROWS'));
add('local demo fixtures contain no fake customers', demoOrdersParsed.orders.length === 0 && demoOrdersParsed.order_items.length === 0);
add('obsolete seed endpoint is absent', !(await exists('src/app/api/seed-products/route.ts')));
add('README explains that the demo catalog remains available', /120 منتج|120 product/i.test(readme) && /portfolio|توضيحي|demo/i.test(readme));
add('README documents the public products REST API', readme.includes('/api/products'));
add('README contains the three-partner permissions matrix', [...readme.matchAll(/^\|\s*\*\*Partner [ABC]\*\*\s*\|/gm)].length === 3 && readme.includes('صلاحية تحديث النافذة العامة') && readme.includes('لا يملك تغييره') && readme.includes('لا يستطيع تغيير `partner_id`'));

let failed = false;
for (const { label, ok } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  failed ||= !ok;
}
console.log(`\n${checks.length - Number(failed)} checks passed; ${checks.filter((check) => !check.ok).length} failed.`);
if (failed) process.exitCode = 1;

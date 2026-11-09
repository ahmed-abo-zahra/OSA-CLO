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

async function listFiles(directory) {
  const entries = await readdir(new URL(`${directory}/`, projectRoot), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

const [schema, checkoutRoute, manualOrderRoute, orderUpdateRoute, orderModal, dashboardShell, adminClient, browserClient, envExample, supabaseConfig, seed, accessMigration, partnerLabelsMigration, hardeningMigration, rateLimitPolicyMigration, stockRevocationMigration, productsApi, requestSecurity, trustedClientIp, rateLimit, catalogCache, loginRoute, discountRoute, reviewsRoute, trackingRoute, trackingToken, orderTracking, storefront, checkoutPage, storefrontPage, productPage, productDetailClient, wishlistContext, cartContext, cartDrawer, bulkImport, readme, demoOrders, securityTests, trackingTests, catalogFiles, apiRoutePaths] = await Promise.all([
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
  read('supabase/migrations/20261109000500_revoke_public_stock_quantity.sql'),
  read('src/app/api/products/route.ts'),
  read('src/lib/request-security.ts'),
  read('src/lib/trusted-client-ip.ts'),
  read('src/lib/rate-limit.ts'),
  read('src/lib/catalog-cache.ts'),
  read('src/app/api/admin/login/route.ts'),
  read('src/app/api/discount/validate/route.ts'),
  read('src/app/api/reviews/route.ts'),
  read('src/app/api/track/route.ts'),
  read('src/lib/tracking-token.ts'),
  read('src/components/OrderTracking.tsx'),
  read('src/components/storefront/StorefrontClient.tsx'),
  read('src/app/checkout/page.tsx'),
  read('src/app/page.tsx'),
  read('src/app/product/[id]/page.tsx'),
  read('src/app/product/[id]/ProductDetailClient.tsx'),
  read('src/context/WishlistContext.tsx'),
  read('src/context/CartContext.tsx'),
  read('src/components/storefront/CartDrawer.tsx'),
  read('src/app/admin/dashboard/BulkImport.tsx'),
  read('README.md'),
  read('src/lib/demo-orders.json'),
  read('scripts/test-request-security.mjs'),
  read('scripts/test-tracking-token.mjs'),
  readdir(new URL('public/catalog/', projectRoot)),
  listFiles('src/app/api'),
]);

const [checkoutIdempotencyMigration, orderUpdateAuditMigration, checkoutIdempotency, trackingTokenFormat, partnerHelpers, customerAccountsMigration, accountOrdersRoute, accountPage, authCallbackRoute, supabaseServerClient, supabaseAuthBrowserClient, proxySource, adminProductCreateRoute, adminProductUpdateRoute, adminDashboardPage, productModal] = await Promise.all([
  read('supabase/migrations/20261109001500_checkout_idempotency.sql'),
  read('supabase/migrations/20261109002000_order_update_audit.sql'),
  read('src/lib/checkout-idempotency.ts'),
  read('src/lib/tracking-token-format.ts'),
  read('src/lib/partners.ts'),
  read('supabase/migrations/20261109003000_customer_accounts.sql'),
  read('src/app/api/account/orders/route.ts'),
  read('src/app/account/page.tsx'),
  read('src/app/auth/callback/route.ts'),
  read('src/lib/supabase-server.ts'),
  read('src/lib/supabase-auth-browser.ts'),
  read('src/proxy.ts'),
  read('src/app/api/admin/products/route.ts'),
  read('src/app/api/admin/products/[id]/route.ts'),
  read('src/app/admin/dashboard/page.tsx'),
  read('src/app/admin/dashboard/AddProductModal.tsx'),
]);

const apiSources = await Promise.all(apiRoutePaths.filter((path) => path.endsWith('/route.ts')).map(read));
const apiSource = apiSources.join('\n');
const mutationRoutes = apiRoutePaths.filter((path) => path.endsWith('/route.ts'))
  .map((path, index) => ({ path, source: apiSources[index] }))
  .filter(({ source }) => /export async function (POST|PUT|PATCH|DELETE)\s*\(/.test(source));

const seedRows = [...seed.matchAll(/^\s*(\{"id":.*?\})(?:,)?\s*$/gm)].map((match) => JSON.parse(match[1]));
const seededIds = seedRows.map((row) => row.id);
const expectedImageNames = seedRows.map((row) => `${row.category}-${String(row.image_index).padStart(2, '0')}.webp`);
const catalogImageNames = new Set(catalogFiles);
const demoOrdersParsed = JSON.parse(demoOrders);
const publicProductGrant = hardeningMigration.match(/grant select\s*\(([^)]+)\)/i)?.[1] ?? '';
const checks = [];
const add = (label, ok) => checks.push({ label, ok: Boolean(ok) });
const tables = ['partners', 'products', 'discount_codes', 'orders', 'order_items', 'reviews', 'store_settings', 'admin_login_attempts'];

for (const table of tables) {
  add(`schema contains ${table}`, schema.includes(`create table public.${table}`));
  add(`RLS enabled for ${table}`, schema.includes(`alter table public.${table} enable row level security`));
}

add('storefront order RPC exists', schema.includes('function public.place_storefront_order('));
add('manual order RPC exists', schema.includes('function public.place_manual_order('));
add('persistent login rate limit RPC exists', schema.includes('function public.consume_admin_login_attempt('));
add('demo catalog seed is explicitly identified as fictional', seed.includes('Fictional portfolio catalog'));
add('demo seed retains all 120 product rows', seededIds.length === 120 && new Set(seededIds).size === 120);
add('all 120 seeded product image assets are present', expectedImageNames.length === 120 && expectedImageNames.every((name) => catalogImageNames.has(name)));
add('product seed creates no demo orders or reviews', !/insert\s+into\s+public\.(orders|reviews)/i.test(seed));
add('no migration deletes portfolio products', !(await exists('supabase/migrations/20261108151510_remove_fictional_catalog.sql')));
add('sensitive tables have explicit deny policies', ['partners', 'discount_codes', 'orders', 'order_items', 'admin_login_attempts'].every((table) => accessMigration.includes(`on public.${table} for all to anon, authenticated`)));
add('discount code foreign key is indexed', accessMigration.includes('create index orders_discount_code_id_idx'));
add('checkout uses the PostgreSQL idempotent transaction RPC', checkoutRoute.includes("rpc('place_storefront_order_idempotent_for_customer'") && checkoutIdempotencyMigration.includes('public.place_storefront_order('));
add('manual orders use their PostgreSQL transaction RPC', manualOrderRoute.includes("rpc('place_manual_order'"));
add('order updates use the partner-scoped audited RPC outside local Demo', orderUpdateRoute.includes('if (DEMO_MODE)') && orderUpdateRoute.includes("rpc('update_partner_order_audited'") && orderUpdateRoute.includes(".eq('partner_id', getPartnerDbId(session.partnerId))"));
add('Supabase admin client is server-only', adminClient.includes("import 'server-only'"));
add('browser Supabase client never reads the secret key', !browserClient.includes('SUPABASE_SECRET_KEY'));
add('environment sample identifies server-only key', envExample.includes('SUPABASE_SECRET_KEY='));
add('environment sample does not expose secret key publicly', !envExample.includes('NEXT_PUBLIC_SUPABASE_SECRET_KEY'));
add('CLI config points to the approved Supabase project', supabaseConfig.includes('rtokjrupdvftacewvmxm'));
add('partner schema uses generic labels', ['Partner A', 'Partner B', 'Partner C'].every((name) => schema.includes(name)));
add('partner password keys use generic labels', ['ADMIN_PASSWORD_PARTNER_A=', 'ADMIN_PASSWORD_PARTNER_B=', 'ADMIN_PASSWORD_PARTNER_C='].every((key) => envExample.includes(key)));
add('partner label migration preserves stable UUIDs', ['596c4367-1491-481f-b0f2-1825c2540ebd', '2a304931-2230-4960-9e44-b19ed5e0178b', '652f4263-d4e3-4bf6-a5c4-778e8a08c710'].every((id) => partnerLabelsMigration.includes(id)));
add('rate-limit migration creates a private persistent table', hardeningMigration.includes('create table public.api_rate_limits') && hardeningMigration.includes('enable row level security') && hardeningMigration.includes('to service_role'));
add('rate-limit table has explicit browser-role deny policy', rateLimitPolicyMigration.includes('for all') && rateLimitPolicyMigration.includes('to anon, authenticated') && rateLimitPolicyMigration.includes('using (false)') && rateLimitPolicyMigration.includes('with check (false)'));
add('rate-limit RPC is service-role only', hardeningMigration.includes('function public.consume_api_rate_limit') && hardeningMigration.includes('to service_role'));
add('order update RPC is atomic and partner-scoped', hardeningMigration.includes('function public.update_partner_order') && hardeningMigration.includes('where id = p_order_id and partner_id = p_partner_id'));
add('order update migration records payment/status, blocks invalid transitions, and guards paid cancellations', orderUpdateAuditMigration.includes('payment_adjustment') && orderUpdateAuditMigration.includes('INVALID_STATUS_TRANSITION') && orderUpdateAuditMigration.includes('PAYMENT_REFUND_REQUIRED') && orderUpdateAuditMigration.includes('activity_log'));
add('checkout idempotency is private and transactional', checkoutIdempotencyMigration.includes('create table if not exists public.checkout_idempotency') && checkoutIdempotencyMigration.includes('enable row level security') && checkoutIdempotencyMigration.includes('for update') && checkoutIdempotencyMigration.includes('response_json') && checkoutIdempotencyMigration.includes('to service_role'));
add('checkout API requires a key and calls idempotent RPC', checkoutRoute.includes("headers.get('idempotency-key')") && checkoutRoute.includes("rpc('place_storefront_order_idempotent_for_customer'") && checkoutRoute.includes('createCheckoutRequestHash'));
add('checkout tracking tokens do not consume Array.map index as issue time', !checkoutRoute.includes('map(createTrackingToken)') && checkoutRoute.includes('map((orderId) => createTrackingToken(orderId))'));
add('checkout request fingerprint is HMAC and does not persist raw customer details', checkoutIdempotency.includes("createHmac('sha256'") && checkoutIdempotency.includes('aso-clo:checkout-request:v1'));
add('local integration covers retry without duplicate order/stock and key mismatch', (await read('scripts/test-demo-api.mjs')).includes('Retry with the same key must not create a second order') && (await read('scripts/test-demo-api.mjs')).includes('checkoutKey), 409'));
add('admin order UI merges partial updates and supports JSONB logs', orderModal.includes('...current, ...data.order') && orderModal.includes('Array.isArray(value)'));
add('dashboard status changes only after successful API response', dashboardShell.includes('if (!response.ok)') && dashboardShell.includes('handleOrderStatusChange(orderId, newStatus)'));
add('products are removed from public Realtime publication', hardeningMigration.toLowerCase().includes('alter publication supabase_realtime drop table public.products'));
add('public product database grant excludes cost and partner ownership', publicProductGrant.length > 0 && !/cost_price|partner_id/i.test(publicProductGrant));
add('public product DTO excludes cost, partner and exact stock', !/cost_price|partner_id|stock_quantity/i.test(catalogCache.slice(catalogCache.indexOf('export const PUBLIC_PRODUCT_FIELDS'), catalogCache.indexOf('].join'))));
add('invalid product IDs are rejected before database lookup/cache', catalogCache.includes('if (!PRODUCT_UUID_PATTERN.test(id)) return null;'));
add('public role cannot select exact stock quantity', /revoke\s+select\s*\(stock_quantity\).*from\s+public,\s*anon,\s*authenticated/is.test(stockRevocationMigration));
add('public REST filters unavailable products', catalogCache.includes(".eq('is_available', true)") && catalogCache.includes(".eq('in_stock', true)"));
add('public REST is cached for 30 seconds', productsApi.includes('s-maxage=30') && productsApi.includes('stale-while-revalidate=30') && catalogCache.includes('revalidate: 30'));
add('public catalog cache uses an invalidation tag', catalogCache.includes("tags: [PUBLIC_CATALOG_TAG]") && catalogCache.includes('revalidateTag(PUBLIC_CATALOG_TAG'));
add('cache invalidates after checkout stock updates', checkoutRoute.includes('invalidatePublicCatalog(productIds)'));
add('cache invalidates after admin product changes', apiSource.includes("invalidatePublicCatalog([id])") && apiSource.includes('invalidatePublicCatalog([data.id])'));
add('cache invalidates after manual order inventory updates', manualOrderRoute.includes('invalidatePublicCatalog(validItems.map'));
add('catalog pages use bounded stable pagination', productsApi.includes('offset % PUBLIC_CATALOG_PAGE_SIZE') && productsApi.includes('MAX_OFFSET = 10_000') && catalogCache.includes('PUBLIC_CATALOG_PAGE_SIZE = 100'));
add('public product routes do not serialize exact stock', !/stock_quantity/.test(`${storefrontPage}\n${productPage}\n${storefront}\n${productDetailClient}\n${wishlistContext}\n${catalogCache}`));
add('cart does not trust or persist client stock hints', !cartContext.includes('maxStock') && !cartContext.includes('stock_quantity') && cartContext.includes('MAX_CART_ITEM_QUANTITY = 50') && cartDrawer.includes('MAX_CART_ITEM_QUANTITY'));
add('public pages and cart do not serialize partner UUIDs', !storefront.includes('partner_id') && !storefrontPage.includes('partner_id') && !productPage.includes('partner_id') && !productDetailClient.includes('partner_id') && !cartContext.includes('partnerId'));
add('checkout derives ownership from products server-side', checkoutRoute.includes(".select('id, partner_id')") && !checkoutRoute.includes('item.partner_id') && !checkoutRoute.includes('item.partnerId'));
add('discount validation derives ownership server-side', !discountRoute.includes('value.partner_id') && discountRoute.includes('product.partner_id'));
add('all mutating API handlers require same-origin', mutationRoutes.length > 0 && mutationRoutes.every(({ source }) => source.includes('hasSameOrigin(request)')));
add('all JSON route handlers use bounded streaming parser', !apiSource.includes('request.json()') && apiSource.includes('readJsonBody(request'));
add('reviews are rate limited and POST verifies same-origin', reviewsRoute.includes('enforceRateLimit') && reviewsRoute.includes('hasSameOrigin(request)') && reviewsRoute.includes('readJsonBody(request'));
add('multipart product writes use bounded streaming parser', apiSource.includes('readFormDataBody(request, MAX_MULTIPART_BODY_BYTES)') && requestSecurity.includes('readLimitedBytes'));
add('stream parser checks actual bytes and Content-Length', requestSecurity.includes('totalBytes > maxBytes') && requestSecurity.includes('content-length'));
add('security test suite exercises streaming JSON and multipart', securityTests.includes('absent') && securityTests.includes('oversized multipart streams'));
add('trusted IP source is Vercel-normalized and validated', trustedClientIp.includes("process.env.VERCEL !== '1'") && trustedClientIp.includes("headers.get('x-forwarded-for')") && trustedClientIp.includes("candidate.includes(',')") && trustedClientIp.includes('isIP(candidate)'));
add('rate limiter fails closed on missing IP, secret or RPC failure', rateLimit.includes('status: 503') && rateLimit.includes("rpc('consume_api_rate_limit'") && rateLimit.includes('getTrustedClientIp'));
add('login is rate limited before parsing credentials', loginRoute.indexOf("rpc('consume_admin_login_attempt'") < loginRoute.indexOf('readJsonBody(request'));
add('admin login also rate limits normalized account names', loginRoute.includes("rpc('consume_api_rate_limit'") && loginRoute.includes('admin-login-account:v1:') && loginRoute.includes('p_limit: 30'));
add('unknown partner IDs are rejected rather than forwarded as database UUIDs', partnerHelpers.includes('if (!partner) throw new Error') && !partnerHelpers.includes('?.dbId ?? id'));
add('production build rejects Demo mode', (await read('next.config.mjs')).includes("NEXT_PUBLIC_DEMO_MODE === 'true'"));
add('tracking endpoint accepts same-origin POST with bounded token body', trackingRoute.includes('export async function POST') && trackingRoute.includes('hasSameOrigin(request)') && trackingRoute.includes('readJsonBody(request, 1024)'));
add('tracking token encrypts references and expires after 90 days', trackingToken.includes('createCipheriv') && trackingToken.includes('createDecipheriv') && trackingToken.includes('TOKEN_LIFETIME_MS') && trackingToken.includes('expiresAt') && trackingTokenFormat.includes('\\.'));
add('checkout returns tracking tokens rather than raw order IDs', checkoutRoute.includes('trackingTokens: orderIds.map((orderId) => createTrackingToken(orderId))') && !checkoutRoute.includes('        orderIds,'));
add('tracking API does not return full order UUID, phone or address', trackingRoute.includes('reference: String(data.id).slice(0, 8)') && !trackingRoute.includes('customer_phone') && !trackingRoute.includes('customer_address'));
add('customer track UI sends token in POST body, clears fragment, and rejects query tokens', orderTracking.includes("fetch('/api/track'") && orderTracking.includes('body: JSON.stringify({ token })') && orderTracking.includes('replaceState') && !orderTracking.includes('useSearchParams'));
add('tracking token tests cover tampering, unsigned UUIDs and expiry', trackingTests.includes('rejects unsigned UUIDs') && trackingTests.includes('modified signatures') && trackingTests.includes('rejects expired tracking credentials'));
add('legacy tracking token-in-path route is absent', !(await exists('src/app/api/track/[orderId]/route.ts')));
add('storefront and checkout have no product Realtime subscriptions', !storefront.includes('postgres_changes') && !checkoutPage.includes('postgres_changes') && !storefront.includes('.channel(') && !checkoutPage.includes('.channel('));
add('storefront refreshes from paginated products REST endpoint', storefront.includes('"/api/products"') && storefront.includes('fetch(path') && productsApi.includes('getPublicCatalogPage(offset)'));
add('empty catalog hero does not use synthetic product images', !storefront.includes('/demo/tshirts.png') && storefront.includes('products.length > 0'));
add('bulk import sends multipart FormData and caps file/row count', bulkImport.includes('new FormData()') && !bulkImport.includes('"Content-Type": "application/json"') && bulkImport.includes('MAX_CSV_BYTES') && bulkImport.includes('MAX_IMPORT_ROWS'));
add('local demo fixtures contain no fake orders or customers', demoOrdersParsed.orders.length === 0 && demoOrdersParsed.order_items.length === 0);
add('obsolete seed endpoint is absent', !(await exists('src/app/api/seed-products/route.ts')));
add('README explains the 120-product portfolio catalog', /120 منتج|120 product/i.test(readme) && /portfolio|توضيحي|demo/i.test(readme));
add('README documents the public products REST API and cache', readme.includes('/api/products') && readme.includes('30 ثانية') && readme.includes('stock_quantity'));
add('README documents encrypted, expiring POST tracking', readme.includes('POST /api/track') && readme.includes('AES-256-GCM') && readme.includes('90 يومًا'));
add('README transparently states customer auth/payment limitations', readme.includes('مصادقة العملاء بالبريد وكلمة المرور مضافة') && readme.includes('لا يجمع أموالًا') && readme.includes('SMTP'));
add('README contains the three-partner permissions matrix', [...readme.matchAll(/^\|\s*\*\*Partner [ABC]\*\*\s*\|/gm)].length === 3 && readme.includes('صلاحية تحديث النافذة العامة') && readme.includes('لا يملك تغييره') && readme.includes('لا يستطيع تغيير `partner_id`'));
add('customer-auth migration links orders and idempotency to Supabase Auth users', customerAccountsMigration.includes('references auth.users(id)') && customerAccountsMigration.includes('place_storefront_order_idempotent_for_customer') && customerAccountsMigration.includes('IDEMPOTENCY_CUSTOMER_MISMATCH'));
add('customer-owned order lookup verifies session and filters by verified user ID', accountOrdersRoute.includes('auth.getUser()') && accountOrdersRoute.includes(".eq('customer_id', user.id)") && accountOrdersRoute.includes('.limit(50)') && accountOrdersRoute.includes('no-store'));
add('customer order API does not return delivery PII or internal costs', !/customer_phone|customer_address|cost_price/.test(accountOrdersRoute) && !/\.select\([^)]*customer_id/i.test(accountOrdersRoute));
add('checkout derives customer ownership only from verified Supabase cookie session', checkoutRoute.includes('authClient.auth.getUser()') && checkoutRoute.includes('p_customer_id: customerId') && !checkoutRoute.includes('item.customer_id'));
add('customer SSR and browser auth use Supabase SSR cookie clients', supabaseServerClient.includes('createServerClient') && supabaseAuthBrowserClient.includes('createBrowserClient') && supabaseServerClient.includes('cookieStore.set'));
add('proxy refreshes customer auth cookies without replacing partner admin guard', proxySource.includes('supabase.auth.getUser()') && proxySource.includes("pathname.startsWith('/admin')") && proxySource.includes('copyCookies'));
add('customer auth callback exchanges code and blocks cross-origin redirects', authCallbackRoute.includes('exchangeCodeForSession(code)') && authCallbackRoute.includes("startsWith('//')") && authCallbackRoute.includes('target.origin !== request.nextUrl.origin'));
add('customer account UI supports sign-up, sign-in, reset and order history', accountPage.includes('signUp(') && accountPage.includes('signInWithPassword(') && accountPage.includes('resetPasswordForEmail(') && accountPage.includes('updateUser({ password: newPassword })') && accountPage.includes('/api/account/orders'));
add('customer account migration is documented and SMTP limitation explicit', readme.includes('20261109003000_customer_accounts.sql') && readme.includes('SMTP مخصص') && readme.includes('/api/account/orders'));
add('admin dashboard does not serialize customer auth UUID', !adminDashboardPage.includes('customer_id') && !/\.select\(\s*[`"']\s*\*/.test(orderUpdateRoute));
add('each partner has a fixed category allowlist enforced at product create/update', partnerHelpers.includes("'partner-a': ['abayas', 'dresses', 'isdals', 'pants', 'tshirts']") && partnerHelpers.includes("'partner-b': ['heels', 'slippers', 'sneakers']") && partnerHelpers.includes("'partner-c': ['accessories', 'girls_bags', 'home_appliances', 'makeup']") && adminProductCreateRoute.includes('getPartnerCategoryKeys(session.partnerId)') && adminProductUpdateRoute.includes('getPartnerCategoryKeys(session.partnerId)'));
add('product modal and CSV show only the session partner categories', productModal.includes('allowedCategoryKeys') && bulkImport.includes('categoryKeys.join') && bulkImport.includes('parseCSV(text, categoryKeys)'));

let failed = false;
for (const { label, ok } of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  failed ||= !ok;
}
console.log(`\n${checks.length - Number(failed)} checks passed; ${checks.filter((check) => !check.ok).length} failed.`);
if (failed) process.exitCode = 1;

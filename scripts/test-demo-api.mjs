import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.DEMO_TEST_URL ?? 'http://localhost:3000';
assert.equal(new URL(base).hostname, 'localhost', 'Only isolated localhost demo may be tested.');

const products = JSON.parse(fs.readFileSync('src/lib/demo-products.json', 'utf8'));
const fixtures = JSON.parse(fs.readFileSync('src/lib/demo-orders.json', 'utf8'));
const databaseFile = '.demo/database.json';
fs.mkdirSync('.demo', { recursive: true });
const backup = fs.existsSync(databaseFile) ? fs.readFileSync(databaseFile) : null;
const resetDatabase = () => fs.writeFileSync(databaseFile, JSON.stringify({
  products,
  orders: fixtures.orders,
  order_items: fixtures.order_items,
  discount_codes: [],
  store_settings: [],
  reviews: [],
  checkout_idempotency: [],
}));

async function call(path, body, cookie, method = 'POST', origin = new URL(base).origin, idempotencyKey = null) {
  const headers = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(origin ? { Origin: origin } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}

let checks = 0;
const uploadPaths = [];
const expectStatus = (response, expected) => {
  assert.equal(response.status, expected, JSON.stringify(response.data));
  checks += 1;
};

try {
  resetDatabase();
  assert.equal(fixtures.orders.length, 0, 'Local demo must not start with fabricated customer orders.');
  assert.equal(fixtures.order_items.length, 0, 'Local demo must not start with fabricated order items.');
  checks += 2;
  expectStatus(await call('/api/account/orders', null, null, 'GET'), 503);

  const partnerId = '596c4367-1491-481f-b0f2-1825c2540ebd';
  const ownProduct = products.find((product) => product.partner_id === partnerId && product.in_stock);
  const otherProduct = products.find((product) => product.partner_id !== partnerId);
  const secondOwnProduct = products.find((product) => product.partner_id === partnerId && product.id !== ownProduct.id && product.in_stock);
  assert(ownProduct && otherProduct && secondOwnProduct, 'Demo fixtures must include products for the test partner.');

  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'in_stock', value: true }, null, 'PATCH'), 401);
  const forgedCookie = `aso_admin_session=${Buffer.from(JSON.stringify({ partnerId: 'partner-a', partnerName: 'Partner A' })).toString('base64')}`;
  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'in_stock', value: true }, forgedCookie, 'PATCH'), 401);

  const login = await call('/api/admin/login', { name: 'Partner A', password: 'aso-demo-2026' });
  expectStatus(login, 200);
  assert(login.cookie, 'Login should issue the signed session cookie.');
  checks += 1;

  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'is_available', value: false }, login.cookie, 'PATCH', null), 403);
  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'is_available', value: false }, login.cookie, 'PATCH', 'https://attacker.example'), 403);
  expectStatus(await call(`/api/admin/products/${otherProduct.id}`, { field: 'in_stock', value: false }, login.cookie, 'PATCH'), 404);
  expectStatus(await call(`/api/admin/products/${otherProduct.id}`, null, login.cookie, 'DELETE'), 404);
  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'in_stock', value: 'false' }, login.cookie, 'PATCH'), 400);
  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'is_available', value: false }, login.cookie, 'PATCH'), 200);
  expectStatus(await call(`/api/admin/products/${ownProduct.id}`, { field: 'is_available', value: true }, login.cookie, 'PATCH'), 200);

  const disallowedCategoryForm = new FormData();
  for (const [key, value] of Object.entries({
    name_en: 'Out-of-scope category test', name_ar: 'اختبار فئة خارج النطاق', category: 'sneakers',
    cost_price: '100', selling_price: '200', sizes: 'M', colors: 'Black', stock_quantity: '1',
  })) disallowedCategoryForm.set(key, value);
  const disallowedCategoryResponse = await fetch(`${base}/api/admin/products`, {
    method: 'POST', headers: { Cookie: login.cookie, Origin: new URL(base).origin }, body: disallowedCategoryForm,
  });
  expectStatus({ status: disallowedCategoryResponse.status, data: await disallowedCategoryResponse.json() }, 403);

  const form = new FormData();
  for (const [key, value] of Object.entries({
    name_en: 'ASO test upload', name_ar: 'ASO اختبار صورة', description: 'Test fixture',
    category: 'tshirts', cost_price: '100', selling_price: '200', sizes: 'M,L',
    colors: 'Black', stock_quantity: '3',
  })) form.set(key, value);
  form.set('image', new Blob([fs.readFileSync('public/aso-logo.png')], { type: 'image/png' }), 'test.png');
  const createdResponse = await fetch(`${base}/api/admin/products`, {
    method: 'POST',
    headers: { Cookie: login.cookie, Origin: new URL(base).origin },
    body: form,
  });
  const created = { status: createdResponse.status, data: await createdResponse.json() };
  expectStatus(created, 201);
  assert(created.data.product.image_url.startsWith('/demo/uploads/'));
  uploadPaths.push(`public${created.data.product.image_url}`);
  checks += 1;
  expectStatus(await call(`/api/admin/products/${created.data.product.id}`, null, login.cookie, 'DELETE'), 200);

  const checkout = {
    customer_name: 'عميل اختبار', customer_phone: '01000000000', shipping_address: 'عنوان تجريبي القاهرة', payment_type: 'full',
    items: [{ productId: ownProduct.id, partner_id: 'not-a-real-partner', size: ownProduct.sizes[0], color: ownProduct.colors[0], quantity: 1, price: 1 }],
    discount_amount: 9999,
  };
  expectStatus(await call('/api/checkout', checkout, null, 'POST', null), 403);
  expectStatus(await call('/api/checkout', checkout, null, 'POST', 'https://attacker.example'), 403);
  const checkoutKey = 'd0f1af64-7b7b-4c84-8c7c-4d7ebf8d6f20';
  expectStatus(await call('/api/checkout', checkout), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [{ ...checkout.items[0], size: 'invalid' }] }, null, 'POST', new URL(base).origin, checkoutKey), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [null] }, null, 'POST', new URL(base).origin, checkoutKey), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [{ ...checkout.items[0], color: 'invalid' }] }, null, 'POST', new URL(base).origin, checkoutKey), 400);
  expectStatus(await call('/api/discount/validate', { code: 'ANY', items: [null] }), 400);
  expectStatus(await call('/api/discount/validate', { code: 'MISSING', items: [{ product_id: ownProduct.id, partner_id: 'not-a-real-partner', quantity: 1 }] }), 404);
  expectStatus(await call('/api/reviews', { product_id: ownProduct.id, customer_name: 'Test', rating: 5 }, null, 'POST', null), 403);
  expectStatus(await call('/api/checkout', { ...checkout, items: [
    { ...checkout.items[0], quantity: 1 }, { ...checkout.items[0], quantity: 1 },
  ] }, null, 'POST', new URL(base).origin, 'e16a51bd-2ced-44c0-a58e-bcf28f18a1d4'), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [{ ...checkout.items[0], quantity: ownProduct.stock_quantity + 1 }] }, null, 'POST', new URL(base).origin, 'd41a4a58-1f9a-46be-a914-61ca4a4b9aa1'), 409);

  const placed = await call('/api/checkout', checkout, null, 'POST', new URL(base).origin, checkoutKey);
  expectStatus(placed, 201);
  assert.equal(placed.data.orderIds, undefined, 'Public checkout must not return raw order UUIDs.');
  assert.equal(placed.data.trackingTokens.length, 1);
  const trackedCheckout = await call('/api/track', { token: placed.data.trackingTokens[0] });
  expectStatus(trackedCheckout, 200);
  assert.equal(trackedCheckout.data.total, ownProduct.selling_price);
  assert.equal(trackedCheckout.data.paid, 0);
  assert(!('id' in trackedCheckout.data), 'Tracking response must not return the full order UUID.');
  assert(!('customer_phone' in trackedCheckout.data));
  const placedState = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  const rawOrderId = placedState.orders.find((order) => order.customer_name === 'عميل اختبار').id;
  expectStatus(await call('/api/track', { token: rawOrderId }), 404);
  const countBeforeRetry = placedState.orders.length;
  const stockBeforeRetry = placedState.products.find((product) => product.id === ownProduct.id).stock_quantity;
  const repeatedCheckout = await call('/api/checkout', checkout, null, 'POST', new URL(base).origin, checkoutKey);
  expectStatus(repeatedCheckout, 201);
  const afterRetry = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  assert.equal(afterRetry.orders.length, countBeforeRetry, 'Retry with the same key must not create a second order.');
  assert.equal(afterRetry.products.find((product) => product.id === ownProduct.id).stock_quantity, stockBeforeRetry, 'Retry must not deduct stock twice.');
  expectStatus(await call('/api/checkout', { ...checkout, customer_name: 'عميل مختلف' }, null, 'POST', new URL(base).origin, checkoutKey), 409);
  checks += 9;

  expectStatus(await call('/api/admin/orders', {
    customer_name: 'Invalid manual customer', source: 'walk_in', items: [null],
  }, login.cookie), 400);
  const manualCreated = await call('/api/admin/orders', {
    customer_name: 'Manual test customer', customer_phone: '', customer_address: '',
    source: 'walk_in', paid_amount: 0, notes: 'Local demo test',
    items: [{ product_id: secondOwnProduct.id, size: secondOwnProduct.sizes[0] ?? '', quantity: 1 }],
  }, login.cookie);
  expectStatus(manualCreated, 201);
  const stateAfterOrders = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  const manualOrder = stateAfterOrders.orders.find((order) => order.customer_name === 'Manual test customer');
  assert(manualOrder, 'Manual order should persist in the isolated demo database.');
  assert.equal(manualOrder.total_amount, secondOwnProduct.selling_price);
  assert.equal(manualOrder.paid_amount, 0);
  checks += 3;

  expectStatus(await call(`/api/admin/orders/${manualOrder.id}`, { status: 'closed' }, login.cookie, 'PATCH'), 409);
  const statusUpdate = await call(`/api/admin/orders/${manualOrder.id}`, { status: 'processing' }, login.cookie, 'PATCH');
  expectStatus(statusUpdate, 200);
  assert.equal(statusUpdate.data.order.status, 'processing');
  assert(Array.isArray(statusUpdate.data.order.activity_log));
  assert(statusUpdate.data.order.activity_log.some((entry) => entry.status === 'processing' && entry.by === 'Partner A'));
  checks += 3;

  const updatedPaidAmount = Math.min(50, Number(manualOrder.total_amount));
  const paidUpdate = await call(`/api/admin/orders/${manualOrder.id}`, { paid_amount: updatedPaidAmount }, login.cookie, 'PATCH');
  expectStatus(paidUpdate, 200);
  assert.equal(paidUpdate.data.order.paid_amount, updatedPaidAmount);
  assert(paidUpdate.data.order.activity_log.some((entry) => entry.type === 'payment_adjustment'));
  checks += 1;
  expectStatus(await call(`/api/admin/orders/${manualOrder.id}`, { paid_amount: Number(manualOrder.total_amount) + 1 }, login.cookie, 'PATCH'), 400);
  const decreasedAmount = Math.max(0, updatedPaidAmount - 1);
  expectStatus(await call(`/api/admin/orders/${manualOrder.id}`, { paid_amount: decreasedAmount }, login.cookie, 'PATCH'), 400);
  const paymentCorrection = await call(`/api/admin/orders/${manualOrder.id}`, {
    paid_amount: decreasedAmount, change_reason: 'Corrected local test value',
  }, login.cookie, 'PATCH');
  expectStatus(paymentCorrection, 200);
  assert(paymentCorrection.data.order.activity_log.some((entry) => entry.type === 'payment_adjustment' && entry.reason === 'Corrected local test value'));
  checks += 2;
  expectStatus(await call(`/api/admin/orders/${manualOrder.id}`, { status: 'cancelled' }, login.cookie, 'PATCH'), 409);

  const trackedManual = await call('/api/track', { token: manualCreated.data.trackingToken });
  expectStatus(trackedManual, 200);
  assert.equal(trackedManual.data.total, secondOwnProduct.selling_price);
  assert.equal(trackedManual.data.paid, decreasedAmount);
  checks += 2;

  const cancellationCreated = await call('/api/admin/orders', {
    customer_name: 'Cancellation demo order', customer_phone: '', customer_address: '',
    source: 'walk_in', paid_amount: 0, notes: 'Local demo cancellation test',
    items: [{ product_id: secondOwnProduct.id, size: secondOwnProduct.sizes[0] ?? '', quantity: 1 }],
  }, login.cookie);
  expectStatus(cancellationCreated, 201);
  const cancellationOrder = JSON.parse(fs.readFileSync(databaseFile, 'utf8')).orders.find((order) => order.id === cancellationCreated.data.order.id);
  const cancelled = await call(`/api/admin/orders/${cancellationOrder.id}`, { status: 'cancelled' }, login.cookie, 'PATCH');
  expectStatus(cancelled, 200);
  assert.equal(cancelled.data.order.status, 'cancelled');

  const finalState = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  assert.equal(finalState.products.find((product) => product.id === ownProduct.id).stock_quantity, ownProduct.stock_quantity - 1);
  assert.equal(finalState.products.find((product) => product.id === secondOwnProduct.id).stock_quantity, secondOwnProduct.stock_quantity - 1);
  checks += 4;
  expectStatus(await call('/api/track', { token: 'invalid' }), 404);

  console.log(`PASS: ${checks} local API checks (signed sessions, CSRF, partner isolation, uploads, checkout, manual orders, stock, totals, and privacy).`);
} finally {
  for (const path of uploadPaths) if (fs.existsSync(path)) fs.unlinkSync(path);
  if (backup) fs.writeFileSync(databaseFile, backup);
  else if (fs.existsSync(databaseFile)) fs.unlinkSync(databaseFile);
}

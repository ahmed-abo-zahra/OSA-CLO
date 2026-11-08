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
}));

async function call(path, body, cookie, method = 'POST', origin = new URL(base).origin) {
  const headers = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...(origin ? { Origin: origin } : {}),
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
const expectStatus = (response, expected) => {
  assert.equal(response.status, expected, JSON.stringify(response.data));
  checks += 1;
};

try {
  resetDatabase();
  assert.equal(fixtures.orders.length, 0, 'Local demo must not start with fabricated customer orders.');
  assert.equal(fixtures.order_items.length, 0, 'Local demo must not start with fabricated order items.');
  checks += 2;

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
  checks += 1;
  expectStatus(await call(`/api/admin/products/${created.data.product.id}`, null, login.cookie, 'DELETE'), 200);
  fs.unlinkSync(`public${created.data.product.image_url}`);

  const checkout = {
    customer_name: 'عميل اختبار', customer_phone: '01000000000', shipping_address: 'عنوان تجريبي القاهرة',
    items: [{ productId: ownProduct.id, size: ownProduct.sizes[0], color: ownProduct.colors[0], quantity: 1, price: 1 }],
    discount_amount: 9999,
  };
  expectStatus(await call('/api/checkout', checkout, null, 'POST', null), 403);
  expectStatus(await call('/api/checkout', checkout, null, 'POST', 'https://attacker.example'), 403);
  expectStatus(await call('/api/checkout', { ...checkout, items: [{ ...checkout.items[0], size: 'invalid' }] }), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [null] }), 400);
  expectStatus(await call('/api/checkout', { ...checkout, items: [{ ...checkout.items[0], color: 'invalid' }] }), 400);
  expectStatus(await call('/api/discount/validate', { code: 'ANY', items: [null] }), 400);
  expectStatus(await call('/api/reviews', { product_id: ownProduct.id, customer_name: 'Test', rating: 5 }, null, 'POST', null), 403);
  expectStatus(await call('/api/checkout', { ...checkout, items: [
    { ...checkout.items[0], quantity: ownProduct.stock_quantity },
    { ...checkout.items[0], quantity: 1 },
  ] }), 409);

  const placed = await call('/api/checkout', checkout);
  expectStatus(placed, 201);
  const trackedCheckout = await call(`/api/track/${placed.data.orderIds[0]}`, null, null, 'GET');
  expectStatus(trackedCheckout, 200);
  assert.equal(trackedCheckout.data.total, ownProduct.selling_price);
  assert.equal(trackedCheckout.data.paid, 0);
  assert(!('customer_phone' in trackedCheckout.data));
  checks += 3;

  expectStatus(await call('/api/admin/orders', {
    customer_name: 'Invalid manual customer', source: 'walk_in', items: [null],
  }, login.cookie), 400);
  expectStatus(await call('/api/admin/orders', {
    customer_name: 'Manual test customer', customer_phone: '', customer_address: '',
    source: 'walk_in', paid_amount: 25, notes: 'Local demo test',
    items: [{ product_id: secondOwnProduct.id, size: secondOwnProduct.sizes[0] ?? '', quantity: 1 }],
  }, login.cookie), 201);
  const stateAfterOrders = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  const manualOrder = stateAfterOrders.orders.find((order) => order.customer_name === 'Manual test customer');
  assert(manualOrder, 'Manual order should persist in the isolated demo database.');
  assert.equal(manualOrder.total_amount, secondOwnProduct.selling_price);
  assert.equal(manualOrder.paid_amount, 25);
  checks += 3;

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
  checks += 1;
  expectStatus(await call(`/api/admin/orders/${manualOrder.id}`, { paid_amount: Number(manualOrder.total_amount) + 1 }, login.cookie, 'PATCH'), 400);

  const trackedManual = await call(`/api/track/${manualOrder.id}`, null, null, 'GET');
  expectStatus(trackedManual, 200);
  assert.equal(trackedManual.data.total, secondOwnProduct.selling_price);
  assert.equal(trackedManual.data.paid, updatedPaidAmount);
  checks += 2;

  const finalState = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
  assert.equal(finalState.products.find((product) => product.id === ownProduct.id).stock_quantity, ownProduct.stock_quantity - 1);
  assert.equal(finalState.products.find((product) => product.id === secondOwnProduct.id).stock_quantity, secondOwnProduct.stock_quantity - 1);
  checks += 2;
  expectStatus(await call('/api/track/invalid', null, null, 'GET'), 400);

  console.log(`PASS: ${checks} local API checks (signed sessions, CSRF, partner isolation, uploads, checkout, manual orders, stock, totals, and privacy).`);
} finally {
  if (backup) fs.writeFileSync(databaseFile, backup);
  else fs.unlinkSync(databaseFile);
}

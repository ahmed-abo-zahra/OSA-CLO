import { DEMO_MODE } from '@/lib/demo-mode';
import { placeDemoOrder } from '@/lib/demo-fetch';
import { invalidatePublicCatalog } from '@/lib/catalog-cache';
import { hasSameOrigin, readJsonBody } from '@/lib/request-security';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createCheckoutRequestHash } from '@/lib/checkout-idempotency';
import { assertTrackingTokenConfigured, createTrackingToken } from '@/lib/tracking-token';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientCartItem = {
  product_id?: unknown;
  productId?: unknown;
  size?: unknown;
  color?: unknown;
  quantity?: unknown;
};

type CheckoutBody = {
  customer_name?: unknown;
  customer_phone?: unknown;
  customer_address?: unknown;
  shipping_address?: unknown;
  notes?: unknown;
  payment_type?: unknown;
  discount_code?: unknown;
  items?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validationError(code: string): { status: number; message: string } {
  if (code.includes('CUSTOMER_AUTH_REQUIRED')) return { status: 401, message: 'Sign in again before placing this order.' };
  if (code.includes('IDEMPOTENCY_KEY_REUSED')) return { status: 409, message: 'This checkout key was already used for different order details. Review the order and submit again.' };
  if (code.includes('IDEMPOTENCY_CUSTOMER_MISMATCH')) return { status: 409, message: 'This checkout key is already linked to a different account. Start a new checkout.' };
  if (code.includes('IDEMPOTENCY_RECORD_UNAVAILABLE') || code.includes('CHECKOUT_TRANSACTION_FAILED')) return { status: 503, message: 'The order could not be completed yet. Please retry with the same checkout key.' };
  if (code.includes('INVALID_IDEMPOTENCY_KEY')) return { status: 400, message: 'The checkout request key is invalid. Please retry.' };
  if (code.includes('PRODUCT_OPTION_INVALID')) {
    return { status: 400, message: 'Choose a valid size and color for each product.' };
  }
  if (code.includes('PRODUCT_UNAVAILABLE')) {
    return { status: 409, message: 'One or more products are no longer available in the requested quantity.' };
  }
  if (code.includes('DISCOUNT_EXPIRED')) return { status: 400, message: 'This discount code has expired.' };
  if (code.includes('DISCOUNT_LIMIT_REACHED')) return { status: 400, message: 'This discount code has reached its usage limit.' };
  if (code.includes('DISCOUNT_MINIMUM_NOT_MET')) return { status: 400, message: 'The order does not meet this discount code’s minimum.' };
  if (code.includes('DISCOUNT_')) return { status: 400, message: 'This discount code cannot be applied to the cart.' };
  if (code.includes('INVALID_CUSTOMER_PHONE')) return { status: 400, message: 'Enter a valid Egyptian mobile number.' };
  if (code.includes('INVALID_CUSTOMER_ADDRESS')) return { status: 400, message: 'Enter a valid delivery address.' };
  if (code.includes('INVALID_CUSTOMER_NAME')) return { status: 400, message: 'Enter a valid customer name.' };
  if (code.includes('INVALID_PAYMENT_TYPE') || code.includes('INVALID_CART') || code.includes('22P02')) {
    return { status: 400, message: 'The order details are invalid. Please review the cart and try again.' };
  }
  return { status: 500, message: 'The order could not be completed. Please try again.' };
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const rateLimitResponse = await enforceRateLimit(request, 'checkout', 10, 900);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    assertTrackingTokenConfigured();
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (!UUID_PATTERN.test(idempotencyKey)) {
      return NextResponse.json({ error: 'A valid Idempotency-Key header is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const bodyResult = await readJsonBody(request, 65_536);
    if (!bodyResult.ok) {
      return NextResponse.json({ error: bodyResult.status === 413 ? 'The order request is too large.' : 'Invalid JSON request.' }, { status: bodyResult.status });
    }
    const rawBody = bodyResult.value;
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid order details.' }, { status: 400 });
    }
    const body = rawBody as CheckoutBody;

    if (DEMO_MODE) {
      try {
        const demoResult = placeDemoOrder(body, { key: idempotencyKey });
        const { orderIds: demoOrderIds, ...publicDemoResult } = demoResult;
        return NextResponse.json({ ...publicDemoResult, trackingTokens: demoOrderIds.map((orderId) => createTrackingToken(orderId)) }, {
          status: 201,
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid order details.';
        const idempotencyConflict = message.includes('IDEMPOTENCY_KEY_REUSED');
        const status = idempotencyConflict || message.includes('unavailable') || message.includes('available stock') ? 409 : 400;
        return NextResponse.json({ error: idempotencyConflict ? 'This checkout key was already used for different order details. Review the order and submit again.' : message, ...(idempotencyConflict ? { code: 'IDEMPOTENCY_KEY_REUSED' } : {}) }, { status, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
    const customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
    const customerAddressValue = body.customer_address ?? body.shipping_address;
    const customerAddress = typeof customerAddressValue === 'string' ? customerAddressValue.trim() : '';
    const paymentType = body.payment_type === 'deposit' ? 'deposit' : body.payment_type === 'full' ? 'full' : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const discountCode = typeof body.discount_code === 'string' ? body.discount_code.trim().toUpperCase() : '';

    if (customerName.length < 2 || customerName.length > 120) {
      return NextResponse.json({ error: 'Enter a valid customer name.' }, { status: 400 });
    }
    if (/[^0-9\s\-()]/.test(customerPhone) || !/^(010|011|012|015)\d{8}$/.test(customerPhone.replace(/[\s\-()]/g, ''))) {
      return NextResponse.json({ error: 'Enter a valid Egyptian mobile number.' }, { status: 400 });
    }
    const normalizedCustomerPhone = customerPhone.replace(/[\s\-()]/g, '');
    if (customerAddress.length < 5 || customerAddress.length > 500) {
      return NextResponse.json({ error: 'Enter a valid delivery address.' }, { status: 400 });
    }
    if (!paymentType || notes.length > 500 || discountCode.length > 50) {
      return NextResponse.json({ error: 'Invalid order details.' }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
      return NextResponse.json({ error: 'The cart must contain between 1 and 100 items.' }, { status: 400 });
    }

    const items = body.items as unknown[];
    const normalizedItems = items.map((entry) => {
      if (!isRecord(entry)) return null;
      const item = entry as ClientCartItem;
      const productId = item.product_id ?? item.productId;
      const quantity = item.quantity;
      const size = item.size ?? null;
      const color = item.color ?? null;
      if (
        typeof productId !== 'string' || !UUID_PATTERN.test(productId) ||
        typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 ||
        (size !== null && (typeof size !== 'string' || size.length > 40)) ||
        (color !== null && (typeof color !== 'string' || color.length > 80))
      ) {
        return null;
      }
      return {
        product_id: productId.toLowerCase(),
        quantity,
        size: typeof size === 'string' ? size.trim() || null : null,
        color: typeof color === 'string' ? color.trim() || null : null,
      };
    });

    if (normalizedItems.some((item) => item === null)) {
      return NextResponse.json({ error: 'One or more cart items are invalid.' }, { status: 400 });
    }
    const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);
    const variantKeys = new Set<string>();
    for (const item of validItems) {
      const key = `${item.product_id}\0${item.size ?? ''}\0${item.color ?? ''}`;
      if (variantKeys.has(key)) {
        return NextResponse.json({ error: 'Combine duplicate product variants into one cart line.' }, { status: 400 });
      }
      variantKeys.add(key);
    }

    const productIds = [...new Set(validItems.map((item) => item.product_id))];
    const { data: productOwners, error: ownerLookupError } = await supabaseAdmin
      .from('products')
      .select('id, partner_id')
      .in('id', productIds);
    if (ownerLookupError) {
      console.error('[checkout] product owner lookup failed:', { code: ownerLookupError.code });
      return NextResponse.json({ error: 'Products are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    const partnerByProduct = new Map((productOwners ?? []).map((product) => [product.id, product.partner_id]));
    const transactionItems = validItems.map((item) => {
      const partnerId = partnerByProduct.get(item.product_id);
      if (!partnerId || !UUID_PATTERN.test(partnerId)) return null;
      return { ...item, partner_id: partnerId };
    });
    if (transactionItems.some((item) => item === null)) {
      return NextResponse.json({ error: 'One or more products are unavailable.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    const itemsForTransaction = transactionItems.filter((item): item is NonNullable<typeof item> => item !== null);

    const requestHash = createCheckoutRequestHash({
      customerName,
      customerPhone: normalizedCustomerPhone,
      customerAddress,
      notes: notes || null,
      paymentType,
      discountCode: discountCode || null,
      items: itemsForTransaction.map(({ product_id, quantity, size, color }) => ({ product_id, quantity, size, color })),
    });

    let customerId: string | null = null;
    const hasCustomerSession = request.cookies.getAll().some(({ name }) => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name));
    if (hasCustomerSession) {
      const authClient = await createSupabaseServerClient();
      const { data: { user }, error: authError } = await authClient.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Your sign-in has expired. Sign in again before placing this order.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
      customerId = user.id;
    }

    const rpcArguments = {
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_customer_id: customerId,
      p_customer_name: customerName,
      p_customer_phone: normalizedCustomerPhone,
      p_customer_address: customerAddress,
      p_notes: notes || null,
      p_payment_type: paymentType,
      p_discount_code: discountCode || null,
      p_items: itemsForTransaction,
    };
    const { data, error } = await supabaseAdmin.rpc('place_storefront_order_idempotent_for_customer', rpcArguments);

    if (error) {
      console.error('[checkout] order transaction failed:', { code: error.code });
      const mapped = validationError(`${error.message} ${error.code ?? ''}`);
      return NextResponse.json({ error: mapped.message, ...(error.message.includes('IDEMPOTENCY_KEY_REUSED') ? { code: 'IDEMPOTENCY_KEY_REUSED' } : {}) }, { status: mapped.status });
    }

    const result = isRecord(data) ? data : {};
    const orderIds = Array.isArray(result.orderIds)
      ? result.orderIds.filter((id): id is string => typeof id === 'string')
      : [];
    const orderRows = Array.isArray(result.orders) ? result.orders : [];
    const firstOrder = orderRows.find(isRecord);

    if (orderIds.length === 0) {
      return NextResponse.json({ error: 'The order could not be completed. Please try again.' }, { status: 500 });
    }

    invalidatePublicCatalog(productIds);

    return NextResponse.json(
      {
        success: true,
        trackingTokens: orderIds.map((orderId) => createTrackingToken(orderId)),
        createdAt: typeof firstOrder?.created_at === 'string' ? firstOrder.created_at : new Date().toISOString(),
        discountAmount: typeof result.discountAmount === 'number' ? result.discountAmount : 0,
        message: 'Order received. No online payment was collected.',
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    }
    console.error('[checkout] unexpected server error');
    return NextResponse.json({ error: 'The order could not be completed. Please try again.' }, { status: 500 });
  }
}

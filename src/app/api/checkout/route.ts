import { DEMO_MODE } from '@/lib/demo-mode';
import { placeDemoOrder } from '@/lib/demo-fetch';
import { hasSameOrigin } from '@/lib/request-security';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientCartItem = {
  product_id?: unknown;
  productId?: unknown;
  partner_id?: unknown;
  partnerId?: unknown;
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
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65536) {
    return NextResponse.json({ error: 'The order request is too large.' }, { status: 413 });
  }

  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid order details.' }, { status: 400 });
    }
    const body = rawBody as CheckoutBody;

    if (DEMO_MODE) {
      try {
        const demoResult = placeDemoOrder(body);
        return NextResponse.json(demoResult, {
          status: 201,
          headers: { 'Cache-Control': 'no-store' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid order details.';
        const status = message.includes('unavailable') || message.includes('available stock') ? 409 : 400;
        return NextResponse.json({ error: message }, { status });
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
    if (!/^(010|011|012|015)\d{8}$/.test(customerPhone.replace(/[^0-9]/g, ''))) {
      return NextResponse.json({ error: 'Enter a valid Egyptian mobile number.' }, { status: 400 });
    }
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
      const partnerId = item.partner_id ?? item.partnerId;
      const quantity = item.quantity;
      const size = item.size ?? null;
      const color = item.color ?? null;
      if (
        typeof productId !== 'string' || !UUID_PATTERN.test(productId) ||
        typeof partnerId !== 'string' || !UUID_PATTERN.test(partnerId) ||
        typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 ||
        (size !== null && (typeof size !== 'string' || size.length > 40)) ||
        (color !== null && (typeof color !== 'string' || color.length > 80))
      ) {
        return null;
      }
      return {
        product_id: productId,
        partner_id: partnerId,
        quantity,
        size: typeof size === 'string' ? size.trim() || null : null,
        color: typeof color === 'string' ? color.trim() || null : null,
      };
    });

    if (normalizedItems.some((item) => item === null)) {
      return NextResponse.json({ error: 'One or more cart items are invalid.' }, { status: 400 });
    }
    const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);

    const { data, error } = await supabaseAdmin.rpc('place_storefront_order', {
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_address: customerAddress,
      p_notes: notes || null,
      p_payment_type: paymentType,
      p_discount_code: discountCode || null,
      p_items: validItems,
    });

    if (error) {
      console.error('[checkout] order transaction failed:', { code: error.code });
      const mapped = validationError(`${error.message} ${error.code ?? ''}`);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
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

    return NextResponse.json(
      {
        success: true,
        orderIds,
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

import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CartItem = {
  product_id?: unknown;
  partner_id?: unknown;
  quantity?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const code = typeof rawBody.code === 'string' ? rawBody.code.trim().toUpperCase() : '';
    if (!code || code.length > 50) {
      return NextResponse.json({ error: 'Enter a valid discount code.' }, { status: 400 });
    }
    if (!Array.isArray(rawBody.items) || rawBody.items.length < 1 || rawBody.items.length > 100) {
      return NextResponse.json({ error: 'The cart is invalid.' }, { status: 400 });
    }

    const items = rawBody.items as CartItem[];
    const normalizedItems = items.map((item) => {
      if (
        typeof item.product_id !== 'string' || !UUID_PATTERN.test(item.product_id) ||
        typeof item.partner_id !== 'string' || !UUID_PATTERN.test(item.partner_id) ||
        typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50
      ) {
        return null;
      }
      return { productId: item.product_id, partnerId: item.partner_id, quantity: item.quantity };
    });

    if (normalizedItems.some((item) => item === null)) {
      return NextResponse.json({ error: 'One or more cart items are invalid.' }, { status: 400 });
    }
    const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);
    const productIds = [...new Set(validItems.map((item) => item.productId))];

    const [{ data: products, error: productError }, { data: discount, error: discountError }] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('id, partner_id, selling_price, stock_quantity, in_stock, is_available')
        .in('id', productIds),
      supabaseAdmin
        .from('discount_codes')
        .select('id, code, partner_id, type, value, min_order, max_uses, uses_count, expires_at')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (productError) {
      console.error('[discount] product lookup failed:', { code: productError.code });
      return NextResponse.json({ error: 'Could not validate the cart.' }, { status: 500 });
    }
    if (discountError) {
      console.error('[discount] code lookup failed:', { code: discountError.code });
      return NextResponse.json({ error: 'Could not validate the discount code.' }, { status: 500 });
    }
    if (!discount) {
      return NextResponse.json({ error: 'Invalid or inactive discount code.' }, { status: 404 });
    }

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const requestedByProduct = new Map<string, number>();
    const subtotalByPartner = new Map<string, number>();

    for (const item of validItems) {
      const product = productMap.get(item.productId);
      if (!product || product.partner_id !== item.partnerId || !product.is_available || !product.in_stock) {
        return NextResponse.json({ error: 'One or more products are unavailable.' }, { status: 409 });
      }
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
      subtotalByPartner.set(
        item.partnerId,
        (subtotalByPartner.get(item.partnerId) ?? 0) + Number(product.selling_price) * item.quantity,
      );
    }

    for (const [productId, quantity] of requestedByProduct) {
      const product = productMap.get(productId);
      if (!product || product.stock_quantity < quantity) {
        return NextResponse.json({ error: 'Requested quantity exceeds available stock.' }, { status: 409 });
      }
    }

    if (discount.expires_at && new Date(discount.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'This discount code has expired.' }, { status: 400 });
    }
    if (discount.max_uses !== null && discount.uses_count >= discount.max_uses) {
      return NextResponse.json({ error: 'This discount code has reached its usage limit.' }, { status: 400 });
    }

    const subtotal = [...subtotalByPartner.values()].reduce((sum, value) => sum + value, 0);
    const eligibleSubtotal = discount.partner_id === null
      ? subtotal
      : (subtotalByPartner.get(discount.partner_id) ?? 0);

    if (eligibleSubtotal <= 0) {
      return NextResponse.json({ error: 'This code does not apply to products in the cart.' }, { status: 400 });
    }
    if (eligibleSubtotal < Number(discount.min_order ?? 0)) {
      return NextResponse.json({
        error: `Minimum eligible order amount is EGP ${Number(discount.min_order).toLocaleString('en-EG')}.`,
      }, { status: 400 });
    }

    const value = Number(discount.value);
    const discountAmount = discount.type === 'percent'
      ? Math.round((eligibleSubtotal * value) / 100 * 100) / 100
      : Math.min(value, eligibleSubtotal);

    return NextResponse.json({
      valid: true,
      code: discount.code,
      type: discount.type,
      value,
      discount: discountAmount,
      eligibleSubtotal,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    }
    console.error('[discount] unexpected server error');
    return NextResponse.json({ error: 'Could not validate the discount code.' }, { status: 500 });
  }
}

import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasSameOrigin } from '@/lib/request-security';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NormalizedItem = { productId: string; quantity: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  const rateLimitResponse = await enforceRateLimit(request, 'discount-validate', 30, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 65536) return json({ error: 'The request is too large.' }, 413);

  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) return json({ error: 'Invalid request.' }, 400);

    const code = typeof rawBody.code === 'string' ? rawBody.code.trim().toUpperCase() : '';
    if (!code || code.length > 50) return json({ error: 'Enter a valid discount code.' }, 400);
    if (!Array.isArray(rawBody.items) || rawBody.items.length < 1 || rawBody.items.length > 100) {
      return json({ error: 'The cart is invalid.' }, 400);
    }

    const normalizedItems = rawBody.items.map((value): NormalizedItem | null => {
      if (!isRecord(value)) return null;
      const productId = value.product_id;
      const quantity = value.quantity;
      if (
        typeof productId !== 'string' || !UUID_PATTERN.test(productId) ||
        typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 50
      ) return null;
      return { productId, quantity };
    });

    if (normalizedItems.some((item) => item === null)) {
      return json({ error: 'One or more cart items are invalid.' }, 400);
    }
    const items = normalizedItems.filter((item): item is NormalizedItem => item !== null);
    const productIds = [...new Set(items.map((item) => item.productId))];

    const [{ data: products, error: productError }, { data: discount, error: discountError }] = await Promise.all([
      supabaseAdmin.from('products')
        .select('id, partner_id, selling_price, stock_quantity, in_stock, is_available')
        .in('id', productIds),
      supabaseAdmin.from('discount_codes')
        .select('id, code, partner_id, type, value, min_order, max_uses, uses_count, expires_at')
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    if (productError) {
      console.error('[discount] product lookup failed:', { code: productError.code });
      return json({ error: 'Could not validate the cart.' }, 503);
    }
    if (discountError) {
      console.error('[discount] code lookup failed:', { code: discountError.code });
      return json({ error: 'Could not validate the discount code.' }, 503);
    }
    if (!discount) return json({ error: 'Invalid or inactive discount code.' }, 404);

    const productMap = new Map((products ?? []).map((product) => [product.id, product]));
    const requestedByProduct = new Map<string, number>();
    const subtotalByPartner = new Map<string, number>();

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_available || !product.in_stock) {
        return json({ error: 'One or more products are unavailable.' }, 409);
      }
      requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) ?? 0) + item.quantity);
      subtotalByPartner.set(
        product.partner_id,
        (subtotalByPartner.get(product.partner_id) ?? 0) + Number(product.selling_price) * item.quantity,
      );
    }

    for (const [productId, quantity] of requestedByProduct) {
      const product = productMap.get(productId);
      if (!product || product.stock_quantity < quantity) {
        return json({ error: 'Requested quantity exceeds available stock.' }, 409);
      }
    }

    if (discount.expires_at && new Date(discount.expires_at).getTime() <= Date.now()) {
      return json({ error: 'This discount code has expired.' }, 400);
    }
    if (discount.max_uses !== null && discount.uses_count >= discount.max_uses) {
      return json({ error: 'This discount code has reached its usage limit.' }, 400);
    }

    const subtotal = [...subtotalByPartner.values()].reduce((sum, value) => sum + value, 0);
    const eligibleSubtotal = discount.partner_id === null
      ? subtotal
      : (subtotalByPartner.get(discount.partner_id) ?? 0);

    if (eligibleSubtotal <= 0) return json({ error: 'This code does not apply to products in the cart.' }, 400);
    if (eligibleSubtotal < Number(discount.min_order ?? 0)) {
      return json({
        error: `Minimum eligible order amount is EGP ${Number(discount.min_order).toLocaleString('en-EG')}.`,
      }, 400);
    }

    const value = Number(discount.value);
    const discountAmount = discount.type === 'percent'
      ? Math.round((eligibleSubtotal * value) / 100 * 100) / 100
      : Math.min(value, eligibleSubtotal);

    return json({
      valid: true,
      code: discount.code,
      type: discount.type,
      value,
      discount: discountAmount,
      eligibleSubtotal,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON request.' }, 400);
    console.error('[discount] unexpected server error');
    return json({ error: 'Could not validate the discount code.' }, 500);
  }
}

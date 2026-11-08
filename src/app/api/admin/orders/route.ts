import { DEMO_MODE } from '@/lib/demo-mode';
import { placeDemoManualOrder } from '@/lib/demo-fetch';
import { decodeSessionValue, COOKIE_NAME } from '@/lib/session';
import { getPartnerDbId } from '@/lib/partners';
import { hasSameOrigin } from '@/lib/request-security';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES = new Set(['manual', 'facebook', 'whatsapp', 'instagram', 'walk_in']);

type OrderItemInput = {
  product_id?: unknown;
  size?: unknown;
  quantity?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const session = decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) return NextResponse.json({ error: 'Invalid order details.' }, { status: 400 });

    const customerName = typeof rawBody.customer_name === 'string' ? rawBody.customer_name.trim() : '';
    const customerPhone = typeof rawBody.customer_phone === 'string' ? rawBody.customer_phone.trim() : '';
    const customerAddress = typeof rawBody.customer_address === 'string' ? rawBody.customer_address.trim() : '';
    const source = typeof rawBody.source === 'string' ? rawBody.source : 'manual';
    const notes = typeof rawBody.notes === 'string' ? rawBody.notes.trim() : '';
    const paidAmount = rawBody.paid_amount === undefined || rawBody.paid_amount === '' ? 0 : Number(rawBody.paid_amount);

    if (customerName.length < 2 || customerName.length > 120) {
      return NextResponse.json({ error: 'Enter a valid customer name.' }, { status: 400 });
    }
    if (customerPhone && !/^\d{10,15}$/.test(customerPhone.replace(/[^0-9]/g, ''))) {
      return NextResponse.json({ error: 'Enter a valid phone number or leave it blank.' }, { status: 400 });
    }
    if (customerAddress && (customerAddress.length < 5 || customerAddress.length > 500)) {
      return NextResponse.json({ error: 'Enter a valid address or leave it blank.' }, { status: 400 });
    }
    if (notes.length > 500 || !SOURCES.has(source)) {
      return NextResponse.json({ error: 'Invalid order details.' }, { status: 400 });
    }
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: 'Enter a valid paid amount.' }, { status: 400 });
    }
    if (!Array.isArray(rawBody.items) || rawBody.items.length < 1 || rawBody.items.length > 100) {
      return NextResponse.json({ error: 'Add between 1 and 100 order items.' }, { status: 400 });
    }

    const items = rawBody.items as unknown[];
    const normalizedItems = items.map((entry) => {
      if (!isRecord(entry)) return null;
      const item = entry as OrderItemInput;
      const size = item.size ?? null;
      if (
        typeof item.product_id !== 'string' || !UUID_PATTERN.test(item.product_id) ||
        typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50 ||
        (size !== null && (typeof size !== 'string' || size.length > 40))
      ) {
        return null;
      }
      return {
        product_id: item.product_id,
        size: typeof size === 'string' ? size.trim() || null : null,
        quantity: item.quantity,
      };
    });

    if (normalizedItems.some((item) => item === null)) {
      return NextResponse.json({ error: 'One or more order items are invalid.' }, { status: 400 });
    }
    const validItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);
    const partnerId = getPartnerDbId(session.partnerId);
    const normalizedPhone = customerPhone ? customerPhone.replace(/[^0-9]/g, '') : null;

    if (DEMO_MODE) {
      try {
        const order = placeDemoManualOrder({
          partner_id: partnerId,
          customer_name: customerName,
          customer_phone: normalizedPhone,
          customer_address: customerAddress || null,
          source,
          notes: notes || null,
          paid_amount: paidAmount,
          items: validItems,
        });
        return NextResponse.json({ success: true, order, demo: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('PRODUCT_OPTION_INVALID')) {
          return NextResponse.json({ error: 'Choose a valid size for each product.' }, { status: 400 });
        }
        if (message.includes('PRODUCT_UNAVAILABLE')) {
          return NextResponse.json({ error: 'One or more selected products are unavailable in that quantity.' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Could not create the order.' }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin.rpc('place_manual_order', {
      p_partner_id: partnerId,
      p_customer_name: customerName,
      p_customer_phone: normalizedPhone,
      p_customer_address: customerAddress || null,
      p_source: source,
      p_notes: notes || null,
      p_paid_amount: paidAmount,
      p_items: validItems,
    });

    if (error) {
      console.error('[admin/orders] manual transaction failed:', { code: error.code });
      const message = error.message ?? '';
      if (message.includes('PRODUCT_OPTION_INVALID')) {
        return NextResponse.json({ error: 'Choose a valid size for each product.' }, { status: 400 });
      }
      if (message.includes('PRODUCT_UNAVAILABLE')) {
        return NextResponse.json({ error: 'One or more selected products are unavailable in that quantity.' }, { status: 409 });
      }
      if (message.includes('PRODUCT_NOT_OWNED')) {
        return NextResponse.json({ error: 'One or more products do not belong to this partner.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Could not create the order. Check the customer and item details.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, order: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    console.error('[admin/orders] unexpected server error');
    return NextResponse.json({ error: 'Could not create the order.' }, { status: 500 });
  }
}

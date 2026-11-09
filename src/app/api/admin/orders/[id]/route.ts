import { DEMO_MODE } from '@/lib/demo-mode';
import { getPartnerDbId } from '@/lib/partners';
import { updateDemoOrder } from '@/lib/demo-fetch';
import { invalidatePublicCatalog } from '@/lib/catalog-cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { hasSameOrigin, readJsonBody } from '@/lib/request-security';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(['pending', 'processing', 'shipped', 'closed', 'cancelled']);
const NO_STORE = { 'Cache-Control': 'no-store' };

type RouteContext = { params: Promise<{ id: string }> };
type OrderUpdate = { status?: string; paid_amount?: number; activity_log?: unknown; id?: string; total_amount?: number; updated_at?: string };

function getSession(request: NextRequest) {
  return decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function updateError(message: string) {
  if (message.includes('ORDER_NOT_FOUND')) return json({ error: 'Order not found.' }, 404);
  if (message.includes('PAID_AMOUNT_EXCEEDS_TOTAL')) return json({ error: 'Paid amount cannot exceed the order total.' }, 400);
  if (message.includes('INVALID_STATUS_TRANSITION')) return json({ error: 'That order status transition is not allowed.' }, 409);
  if (message.includes('PAYMENT_DECREASE_REQUIRES_REASON')) return json({ error: 'A reason of at least five characters is required to reduce the recorded payment.' }, 400);
  if (message.includes('PAYMENT_REFUND_REQUIRED')) return json({ error: 'Record a verified refund adjustment to zero before cancelling this paid order.' }, 409);
  if (message.includes('INVALID_ORDER_UPDATE')) return json({ error: 'Invalid order update.' }, 400);
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return json({ error: 'Invalid order ID.' }, 400);

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      id, partner_id, customer_name, customer_phone, customer_address,
      source, status, notes, total_amount, paid_amount, discount_amount,
      requested_payment_type, requested_deposit_amount, discount_code_id,
      activity_log, created_at, updated_at,
      order_items(
        id, product_id, product_name_en, product_name_ar, image_url,
        quantity, size, color, unit_price, cost_price,
        products(name_en, name_ar, image_url)
      )
    `)
    .eq('id', id)
    .eq('partner_id', getPartnerDbId(session.partnerId))
    .maybeSingle();

  if (error) {
    console.error('[admin/orders] detail lookup failed:', { code: error.code });
    return json({ error: 'Could not load the order.' }, 500);
  }
  if (!data) return json({ error: 'Order not found.' }, 404);
  return json({ order: data });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!hasSameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return json({ error: 'Invalid order ID.' }, 400);

  try {
    const bodyResult = await readJsonBody(request, 16_384);
    if (!bodyResult.ok) return json({ error: bodyResult.status === 413 ? 'Order update is too large.' : 'Invalid JSON request.' }, bodyResult.status);
    const body = bodyResult.value;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid order update.' }, 400);

    const values = body as { status?: unknown; paid_amount?: unknown; change_reason?: unknown };
    if (values.status === undefined && values.paid_amount === undefined) return json({ error: 'No order changes were provided.' }, 400);
    if (values.status !== undefined && (typeof values.status !== 'string' || !ALLOWED_STATUSES.has(values.status))) {
      return json({ error: 'Invalid order status.' }, 400);
    }
    if (values.paid_amount !== undefined && (
      typeof values.paid_amount !== 'number' || !Number.isFinite(values.paid_amount) || values.paid_amount < 0
    )) return json({ error: 'Paid amount must be a non-negative number.' }, 400);
    if (values.change_reason !== undefined && (
      typeof values.change_reason !== 'string' || values.change_reason.trim().length > 300
    )) return json({ error: 'Payment change reason must be 300 characters or fewer.' }, 400);

    const partnerId = getPartnerDbId(session.partnerId);
    const changeReason = typeof values.change_reason === 'string' ? values.change_reason.trim() : '';
    let updated: OrderUpdate | null = null;

    if (DEMO_MODE) {
      try {
        updated = updateDemoOrder({
          order_id: id,
          partner_id: partnerId,
          partner_name: session.partnerName,
          status: typeof values.status === 'string' ? values.status : null,
          paid_amount: typeof values.paid_amount === 'number' ? values.paid_amount : null,
          change_reason: changeReason || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const known = updateError(message);
        if (known) return known;
        console.error('[admin/orders] demo update failed');
        return json({ error: 'Could not update the order.' }, 500);
      }
    } else {
      const { data, error } = await supabaseAdmin.rpc('update_partner_order_audited', {
        p_order_id: id,
        p_partner_id: partnerId,
        p_status: typeof values.status === 'string' ? values.status : null,
        p_paid_amount: typeof values.paid_amount === 'number' ? values.paid_amount : null,
        p_change_reason: changeReason || null,
      });
      if (error) {
        const known = updateError(error.message);
        if (known) return known;
        console.error('[admin/orders] atomic update failed:', { code: error.code });
        return json({ error: 'Could not update the order.' }, 500);
      }
      updated = data as OrderUpdate | null;
    }

    if (!updated) return json({ error: 'Could not update the order.' }, 500);
    if (values.status === 'cancelled') invalidatePublicCatalog();
    return json({ success: true, order: updated });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON request.' }, 400);
    console.error('[admin/orders] unexpected server error');
    return json({ error: 'Could not update the order.' }, 500);
  }
}

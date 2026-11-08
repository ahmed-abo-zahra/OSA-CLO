import { DEMO_MODE } from '@/lib/demo-mode';
import { getPartnerDbId } from '@/lib/partners';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { hasSameOrigin } from '@/lib/request-security';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(['pending', 'processing', 'shipped', 'closed', 'cancelled']);

type RouteContext = { params: Promise<{ id: string }> };

function getSession(request: NextRequest) {
  return decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
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
    return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({ order: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 });
    }
    const values = body as { status?: unknown; paid_amount?: unknown };
    if (values.status === undefined && values.paid_amount === undefined) {
      return NextResponse.json({ error: 'No order changes were provided.' }, { status: 400 });
    }
    if (values.status !== undefined && (typeof values.status !== 'string' || !ALLOWED_STATUSES.has(values.status))) {
      return NextResponse.json({ error: 'Invalid order status.' }, { status: 400 });
    }
    if (values.paid_amount !== undefined && (
      typeof values.paid_amount !== 'number' || !Number.isFinite(values.paid_amount) || values.paid_amount < 0
    )) {
      return NextResponse.json({ error: 'Paid amount must be a non-negative number.' }, { status: 400 });
    }

    const partnerId = getPartnerDbId(session.partnerId);
    if (DEMO_MODE) {
      const { data: current, error: lookupError } = await supabaseAdmin
        .from('orders')
        .select('id, partner_id, status, total_amount, paid_amount, activity_log')
        .eq('id', id)
        .eq('partner_id', partnerId)
        .maybeSingle();
      if (lookupError) {
        console.error('[admin/orders] demo lookup failed:', { code: lookupError.code });
        return NextResponse.json({ error: 'Could not load the order.' }, { status: 500 });
      }
      if (!current) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

      const paidAmount = typeof values.paid_amount === 'number' ? values.paid_amount : null;
      if (paidAmount !== null && paidAmount > Number(current.total_amount)) {
        return NextResponse.json({ error: 'Paid amount cannot exceed the order total.' }, { status: 400 });
      }

      const updates: Record<string, unknown> = {};
      if (typeof values.status === 'string') {
        updates.status = values.status;
        if (values.status !== current.status) {
          let activity: unknown[] = [];
          try {
            const existing = Array.isArray(current.activity_log)
              ? current.activity_log
              : typeof current.activity_log === 'string' ? JSON.parse(current.activity_log) : [];
            if (Array.isArray(existing)) activity = existing;
          } catch { activity = []; }
          updates.activity_log = [
            ...activity,
            { status: values.status, by: session.partnerName, at: new Date().toISOString() },
          ].slice(-100);
        }
      }
      if (paidAmount !== null) updates.paid_amount = paidAmount;

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('orders')
        .update(updates)
        .eq('id', id)
        .eq('partner_id', partnerId)
        .select('id, status, paid_amount, total_amount, activity_log, updated_at')
        .single();
      if (updateError) {
        console.error('[admin/orders] demo update failed:', { code: updateError.code });
        return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
      }
      return NextResponse.json({ success: true, order: updated }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: updated, error: updateError } = await supabaseAdmin.rpc('update_partner_order', {
      p_order_id: id,
      p_partner_id: partnerId,
      p_status: typeof values.status === 'string' ? values.status : null,
      p_paid_amount: typeof values.paid_amount === 'number' ? values.paid_amount : null,
    });

    if (updateError) {
      if (updateError.message.includes('ORDER_NOT_FOUND')) {
        return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
      }
      if (updateError.message.includes('PAID_AMOUNT_EXCEEDS_TOTAL')) {
        return NextResponse.json({ error: 'Paid amount cannot exceed the order total.' }, { status: 400 });
      }
      if (updateError.message.includes('INVALID_ORDER_UPDATE')) {
        return NextResponse.json({ error: 'Invalid order update.' }, { status: 400 });
      }
      console.error('[admin/orders] atomic update failed:', { code: updateError.code });
      return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, order: updated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    console.error('[admin/orders] unexpected server error');
    return NextResponse.json({ error: 'Could not update the order.' }, { status: 500 });
  }
}

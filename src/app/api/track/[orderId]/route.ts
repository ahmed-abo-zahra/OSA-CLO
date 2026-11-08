import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ orderId: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Public order tracking returns only status, totals and a masked customer name. */
export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimitResponse = await enforceRateLimit(request, 'order-tracking', 30, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const { orderId } = await context.params;
  if (!UUID_PATTERN.test(orderId)) return json({ error: 'Invalid order ID.' }, 400);

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, status, customer_name, total_amount, paid_amount, created_at, updated_at')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('[tracking] order lookup failed:', { code: error.code });
    return json({ error: 'Order tracking is temporarily unavailable.' }, 503);
  }
  if (!data) return json({ error: 'Order not found.' }, 404);

  const maskedName = String(data.customer_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length > 1 ? `${part[0]}${'*'.repeat(Math.min(part.length - 1, 8))}` : '*')
    .join(' ');
  const total = Number(data.total_amount);
  const paid = Number(data.paid_amount ?? 0);

  return json({
    id: data.id,
    status: data.status,
    customer: maskedName,
    total,
    paid,
    remaining: Math.max(0, total - paid),
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}

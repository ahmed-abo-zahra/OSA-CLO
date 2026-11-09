import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hasSameOrigin, readJsonBody } from '@/lib/request-security';
import { verifyTrackingToken } from '@/lib/tracking-token';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function money(value: unknown): number | null {
  const text = String(value ?? '');
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Tracking credentials are sent in a bounded POST body, never in the URL. */
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return json({ error: 'Request rejected.' }, 403);
  const rateLimitResponse = await enforceRateLimit(request, 'order-tracking', 30, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const bodyResult = await readJsonBody(request, 1024);
  if (!bodyResult.ok) return json({ error: 'Invalid tracking request.' }, bodyResult.status);
  const body = bodyResult.value;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as { token?: unknown }).token !== 'string') {
    return json({ error: 'Order not found.' }, 404);
  }

  const orderId = verifyTrackingToken((body as { token: string }).token);
  if (!orderId) return json({ error: 'Order not found.' }, 404);

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

  const total = money(data.total_amount);
  const paid = money(data.paid_amount ?? 0);
  if (total === null || paid === null || paid > total) {
    console.error('[tracking] invalid monetary values');
    return json({ error: 'Order tracking is temporarily unavailable.' }, 503);
  }
  const maskedName = String(data.customer_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length > 1 ? `${part[0]}${'*'.repeat(Math.min(part.length - 1, 8))}` : '*')
    .join(' ');

  return json({
    reference: String(data.id).slice(0, 8).toUpperCase(),
    status: data.status,
    customer: maskedName,
    total,
    paid,
    remaining: Math.max(0, total - paid),
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}

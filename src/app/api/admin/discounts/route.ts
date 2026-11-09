import { getPartnerDbId } from '@/lib/partners';
import { hasSameOrigin, readJsonBody } from '@/lib/request-security';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .select('id, code, type, value, min_order, max_uses, uses_count, expires_at, is_active, created_at')
    .eq('partner_id', getPartnerDbId(session.partnerId))
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[discounts] list failed:', { code: error.code });
    return NextResponse.json({ error: 'Could not load discount codes.' }, { status: 500 });
  }
  return NextResponse.json({ discounts: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  try {
    const bodyResult = await readJsonBody(request, 16_384);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.status === 413 ? 'Discount request is too large.' : 'Invalid JSON request.' }, { status: bodyResult.status });
    const rawBody = bodyResult.value;
    if (!isRecord(rawBody)) return NextResponse.json({ error: 'Invalid discount details.' }, { status: 400 });

    const code = typeof rawBody.code === 'string' ? rawBody.code.trim().toUpperCase() : '';
    const type = rawBody.type;
    const value = Number(rawBody.value);
    const minOrder = rawBody.min_order === undefined ? 0 : Number(rawBody.min_order);
    const maxUses = rawBody.max_uses === undefined || rawBody.max_uses === null || rawBody.max_uses === ''
      ? null
      : Number(rawBody.max_uses);
    const expiresAt = rawBody.expires_at === undefined || rawBody.expires_at === null || rawBody.expires_at === ''
      ? null
      : new Date(String(rawBody.expires_at)).toISOString();

    if (!/^[A-Z0-9_-]{3,50}$/.test(code)) {
      return NextResponse.json({ error: 'Use 3–50 letters, numbers, hyphens or underscores for the code.' }, { status: 400 });
    }
    if ((type !== 'percent' && type !== 'fixed') || !Number.isFinite(value) || value <= 0) {
      return NextResponse.json({ error: 'Enter a valid discount type and value.' }, { status: 400 });
    }
    if (type === 'percent' && value > 100) {
      return NextResponse.json({ error: 'Percentage discounts cannot exceed 100%.' }, { status: 400 });
    }
    if (!Number.isFinite(minOrder) || minOrder < 0) {
      return NextResponse.json({ error: 'Minimum order must be zero or greater.' }, { status: 400 });
    }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
      return NextResponse.json({ error: 'Maximum uses must be a positive whole number.' }, { status: 400 });
    }
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
      return NextResponse.json({ error: 'Enter a valid expiration date.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('discount_codes')
      .insert({
        code,
        type,
        value,
        min_order: minOrder,
        max_uses: maxUses,
        expires_at: expiresAt,
        partner_id: getPartnerDbId(session.partnerId),
        is_active: true,
      })
      .select('id, code, type, value, min_order, max_uses, uses_count, expires_at, is_active, created_at')
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'That discount code already exists.' }, { status: 409 });
      console.error('[discounts] create failed:', { code: error.code });
      return NextResponse.json({ error: 'Could not create the discount code.' }, { status: 500 });
    }
    return NextResponse.json({ discount: data }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid discount details.' }, { status: 400 });
    }
    console.error('[discounts] unexpected server error');
    return NextResponse.json({ error: 'Could not create the discount code.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id || !UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid discount code ID.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .delete()
    .eq('id', id)
    .eq('partner_id', getPartnerDbId(session.partnerId))
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[discounts] delete failed:', { code: error.code });
    return NextResponse.json({ error: 'Could not delete the discount code.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Discount code not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasSameOrigin } from '@/lib/request-security';
import { enforceRateLimit } from '@/lib/rate-limit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);
  const rateLimitResponse = await enforceRateLimit(request, 'review-submit', 3, 3600);
  if (rateLimitResponse) return rateLimitResponse;

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 8192) return json({ error: 'The review is too large.' }, 413);

  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return json({ error: 'Invalid review.' }, 400);

    const productId = body.product_id;
    const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
    const rating = body.rating;
    const comment = body.comment === null || body.comment === undefined
      ? ''
      : typeof body.comment === 'string' ? body.comment.trim() : null;

    if (typeof productId !== 'string' || !UUID_PATTERN.test(productId)) {
      return json({ error: 'Choose a valid product.' }, 400);
    }
    if (customerName.length < 2 || customerName.length > 80) {
      return json({ error: 'Name must be between 2 and 80 characters.' }, 400);
    }
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: 'Rating must be a whole number from 1 to 5.' }, 400);
    }
    if (comment === null || comment.length > 500) {
      return json({ error: 'Review text must be 500 characters or fewer.' }, 400);
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    if (productError) {
      console.error('[reviews] product lookup failed:', { code: productError.code });
      return json({ error: 'Could not submit the review right now.' }, 503);
    }
    if (!product) return json({ error: 'Product not found.' }, 404);

    const { error } = await supabaseAdmin.from('reviews').insert({
      product_id: productId,
      customer_name: customerName,
      rating,
      comment: comment || null,
      is_approved: false,
    });
    if (error) {
      console.error('[reviews] insert failed:', { code: error.code });
      return json({ error: 'Could not submit the review right now.' }, 503);
    }

    return json({ ok: true, message: 'Review submitted for approval.' }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON request.' }, 400);
    console.error('[reviews] unexpected server error');
    return json({ error: 'Could not submit the review right now.' }, 500);
  }
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, 'review-read', 120, 900);
  if (rateLimitResponse) return rateLimitResponse;

  const productId = request.nextUrl.searchParams.get('product_id');
  if (!productId) return json({ reviews: [] });
  if (!UUID_PATTERN.test(productId)) return json({ error: 'Invalid product ID.' }, 400);

  const { data, error } = await supabaseAdmin
    .from('reviews')
    .select('id, customer_name, rating, comment, created_at')
    .eq('product_id', productId)
    .eq('is_approved', true)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[reviews] read failed:', { code: error.code });
    return json({ error: 'Could not load reviews.' }, 503);
  }
  return json({ reviews: data ?? [] });
}

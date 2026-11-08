import { createHmac } from 'node:crypto';
import { DEMO_MODE } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse, type NextRequest } from 'next/server';

/** Returns null when allowed, otherwise a ready-to-return HTTP response. */
export async function enforceRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  if (DEMO_MODE && process.env.NODE_ENV !== 'production') return null;

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    console.error('[rate-limit] ADMIN_SESSION_SECRET is unavailable.');
    return NextResponse.json(
      { error: 'This service is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Vercel overwrites these headers with the public client IP on direct deployments.
  // If an upstream proxy is introduced, it must overwrite forwarded-IP headers too.
  const ip = request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const keyHash = createHmac('sha256', secret).update(`${scope}:${ip}`).digest('hex');

  const { data: allowed, error } = await supabaseAdmin.rpc('consume_api_rate_limit', {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] persistent limiter failed:', { code: error.code });
    return NextResponse.json(
      { error: 'This service is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (allowed !== true) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(windowSeconds),
        },
      },
    );
  }

  return null;
}

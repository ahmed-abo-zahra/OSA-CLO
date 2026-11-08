import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DEMO_MODE } from '@/lib/demo-mode';
import { encodeSession, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/session';
import { PARTNERS } from '@/lib/partners';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasSameOrigin } from '@/lib/request-security';
import { NextResponse, type NextRequest } from 'next/server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesPassword(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function loginKeyHash(request: NextRequest): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET is not configured.');
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Request rejected.' }, { status: 403 });
  }

  try {
    const rawBody: unknown = await request.json();
    if (!isRecord(rawBody)) return NextResponse.json({ error: 'Name and password are required.' }, { status: 400 });

    const name = typeof rawBody.name === 'string' ? rawBody.name.trim() : '';
    const password = typeof rawBody.password === 'string' ? rawBody.password : '';
    if (!name || !password || password.length > 256) {
      return NextResponse.json({ error: 'Name and password are required.' }, { status: 400 });
    }

    let keyHash: string | null = null;
    if (!DEMO_MODE) {
      keyHash = loginKeyHash(request);
      const { data: allowed, error: limitError } = await supabaseAdmin.rpc('consume_admin_login_attempt', {
        p_key_hash: keyHash,
      });
      if (limitError) {
        console.error('[admin/login] rate limiter unavailable:', { code: limitError.code });
        return NextResponse.json({ error: 'Login is temporarily unavailable.' }, { status: 503 });
      }
      if (allowed !== true) {
        return NextResponse.json(
          { error: 'Too many login attempts. Try again in 15 minutes.' },
          { status: 429, headers: { 'Retry-After': '900' } },
        );
      }
    }

    const partner = PARTNERS.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
    const passwordEnvSuffix = partner?.id.replaceAll('-', '_').toUpperCase();
    const expected = passwordEnvSuffix
      ? process.env[`ADMIN_PASSWORD_${passwordEnvSuffix}`] ?? (DEMO_MODE ? 'aso-demo-2026' : '')
      : '';
    const passwordMatches = matchesPassword(password, expected);

    if (!partner || !expected || !passwordMatches) {
      return NextResponse.json({ error: 'Name or password is incorrect.' }, { status: 401 });
    }

    if (keyHash) {
      const { error } = await supabaseAdmin.rpc('reset_admin_login_attempt', { p_key_hash: keyHash });
      if (error) console.error('[admin/login] rate limit reset failed:', { code: error.code });
    }

    const response = NextResponse.json(
      { success: true, partner: { id: partner.id, name: partner.name } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(COOKIE_NAME, encodeSession({ partnerId: partner.id, partnerName: partner.name }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return response;
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    console.error('[admin/login] unexpected server error');
    return NextResponse.json({ error: 'Login is temporarily unavailable.' }, { status: 500 });
  }
}

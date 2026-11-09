import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { resolveInternalRedirect } from '@/lib/internal-redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rawNext = request.nextUrl.searchParams.get('next');
  if (rawNext?.startsWith('//')) {
    return NextResponse.redirect(new URL('/account', request.url));
  }
  const target = resolveInternalRedirect(rawNext, request.nextUrl.origin);
  if (target.origin !== request.nextUrl.origin) {
    return NextResponse.redirect(new URL('/account', request.url));
  }
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/account?auth_error=verification', request.url));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL('/account?auth_error=verification', request.url));
    return NextResponse.redirect(target);
  } catch {
    return NextResponse.redirect(new URL('/account?auth_error=verification', request.url));
  }
}

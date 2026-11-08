import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const session = decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
  const isLoginPage = request.nextUrl.pathname === '/admin/login';

  if (isLoginPage) {
    return session
      ? NextResponse.redirect(new URL('/admin/dashboard', request.url))
      : NextResponse.next();
  }

  if (!session) return NextResponse.redirect(new URL('/admin/login', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};

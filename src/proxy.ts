import { createServerClient } from '@supabase/ssr';
import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { DEMO_MODE } from '@/lib/demo-mode';
import { NextResponse, type NextRequest } from 'next/server';

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    target.cookies.set(name, value, options);
  }
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const hasCustomerAuthCookie = request.cookies.getAll().some(({ name }) => /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!DEMO_MODE && hasCustomerAuthCookie && url && publishableKey) {
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });
    await supabase.auth.getUser();
  }

  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');
  if (!isAdminPath) return response;

  const session = decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
  const isLoginPage = request.nextUrl.pathname === '/admin/login';

  if (isLoginPage && session) {
    const redirect = NextResponse.redirect(new URL('/admin/dashboard', request.url));
    copyCookies(response, redirect);
    return redirect;
  }
  if (isLoginPage || session) return response;

  const redirect = NextResponse.redirect(new URL('/admin/login', request.url));
  copyCookies(response, redirect);
  return redirect;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)'],
};

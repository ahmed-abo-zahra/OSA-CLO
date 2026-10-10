import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Cryptographic verification runs in the Node server page/API guard. Middleware is only a navigation shortcut.
export function middleware(request:NextRequest){
 if(request.nextUrl.pathname!=='/admin/login'&&!request.cookies.has('aso_admin_session'))return NextResponse.redirect(new URL('/admin/login',request.url));
 return NextResponse.next();
}
export const config={matcher:['/admin/:path*']};

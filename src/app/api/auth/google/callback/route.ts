import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Upsert customer record linked to Google identity
      await supabase.from('customers').upsert(
        {
          id: data.user.id,
          email: data.user.email ?? null,
          name:
            data.user.user_metadata?.full_name ??
            data.user.user_metadata?.name ??
            null,
          phone: data.user.phone ?? null,
          last_login: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    }
  }

  // Redirect to home after successful auth
  return NextResponse.redirect(`${origin}/`);
}

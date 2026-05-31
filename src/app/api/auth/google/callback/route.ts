import { createSupabaseRouteClient } from '@/lib/supabase-route';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = createSupabaseRouteClient();

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Upsert customer profile linked to Google identity
      const fullName =
        data.user.user_metadata?.full_name ??
        data.user.user_metadata?.name ??
        null;

      await supabase.from('customers').upsert(
        {
          id: data.user.id,
          email: data.user.email ?? null,
          full_name: fullName,
          phone: data.user.phone ?? null,
          last_login: new Date().toISOString(),
          // Preserve existing profile fields on re-login
          // (governorate, city, detailed_address are only set during checkout)
        },
        {
          onConflict: 'id',
          ignoreDuplicates: false,
        }
      );
    }
  }

  // Redirect to home after successful auth
  return NextResponse.redirect(`${origin}/`);
}

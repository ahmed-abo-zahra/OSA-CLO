import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEMO_MODE } from './demo-mode';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (DEMO_MODE ? 'https://demo.invalid' : '');
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? (DEMO_MODE ? 'demo-only' : '');

if (!DEMO_MODE && (!url || !publishableKey)) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.');
}

const scope = globalThis as typeof globalThis & { asoSupabase?: SupabaseClient };
const demoFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ message: 'External services are disabled in demo mode.' }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  });

export const supabase =
  scope.asoSupabase ??
  createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    ...(DEMO_MODE ? { global: { fetch: demoFetch } } : {}),
  });

if (typeof window !== 'undefined') scope.asoSupabase = supabase;

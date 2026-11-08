import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { DEMO_MODE } from './demo-mode';
import { demoFetch } from './demo-fetch';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (DEMO_MODE ? 'https://demo.invalid' : '');
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!DEMO_MODE && (!url || !secretKey)) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SECRET_KEY are required.');
}

export const supabaseAdmin = createClient(url, DEMO_MODE ? 'demo-only' : secretKey!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  ...(DEMO_MODE ? { global: { fetch: demoFetch } } : {}),
});

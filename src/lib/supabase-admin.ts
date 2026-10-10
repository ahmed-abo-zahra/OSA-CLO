import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { DEMO_MODE } from './demo-mode';
import { demoFetch } from './demo-fetch';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://espqrrunhekvjsoxdfbx.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DEMO_MODE && !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required outside demo mode');
export const supabaseAdmin = createClient(url, DEMO_MODE ? 'isolated-demo' : key!, {
 auth: {autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
 ...(DEMO_MODE ? {global:{fetch:demoFetch}} : {}),
});

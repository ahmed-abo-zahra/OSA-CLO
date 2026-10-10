import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { DEMO_MODE } from './demo-mode';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://espqrrunhekvjsoxdfbx.supabase.co';
const SUPABASE_ANON_KEY = DEMO_MODE ? 'isolated-demo' : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
const scope = globalThis as typeof globalThis & { asoSupabase?: SupabaseClient };
export const supabase = scope.asoSupabase ?? createClient(SUPABASE_URL, SUPABASE_ANON_KEY,{auth:{persistSession:!DEMO_MODE,autoRefreshToken:!DEMO_MODE,detectSessionInUrl:!DEMO_MODE},...(DEMO_MODE?{global:{fetch:async()=>new Response(JSON.stringify({message:"External services are disabled in demo"}),{status:503})}}:{})});
if (typeof window !== "undefined") scope.asoSupabase = supabase;

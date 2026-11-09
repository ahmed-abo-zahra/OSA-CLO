import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_MODE } from '@/lib/demo-mode';

let browserClient: SupabaseClient | null = null;

export function getCustomerAuthClient(): SupabaseClient {
  if (DEMO_MODE) throw new Error('Customer authentication is disabled in Demo mode.');
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Customer authentication is not configured.');
  }

  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}

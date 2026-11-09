import { NextResponse } from 'next/server';
import { DEMO_MODE } from '@/lib/demo-mode';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function GET() {
  if (DEMO_MODE) return json({ error: 'Customer accounts are unavailable in Demo mode.' }, 503);

  try {
    const authClient = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: 'Sign in to view your orders.' }, 401);

    const { data, error } = await authClient
      .from('orders')
      .select('id,status,total_amount,paid_amount,requested_payment_type,requested_deposit_amount,created_at,updated_at,order_items(product_name_en,product_name_ar,image_url,quantity,size,color,unit_price)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[account/orders] query failed:', { code: error.code });
      return json({ error: 'Your order history is temporarily unavailable.' }, 503);
    }

    return json({ orders: data ?? [] });
  } catch {
    console.error('[account/orders] request failed');
    return json({ error: 'Your order history is temporarily unavailable.' }, 503);
  }
}

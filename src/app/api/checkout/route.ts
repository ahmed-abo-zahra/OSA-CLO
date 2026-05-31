import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface OrderItem {
  product_id: string;
  partner_id: string;
  quantity: number;
  cost_price_at_time: number;
  selling_price_at_time: number;
}

interface CheckoutBody {
  customer_name: string;
  customer_phone: string;
  shipping_address: string;
  customer_address?: string;
  items: OrderItem[];
  total_amount: number;
  deposit_amount: number;
  discount_code_id?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body: CheckoutBody = await request.json();

    // ─── Validate required fields ───────────────────────────────────────────
    const { customer_name, customer_phone, shipping_address, items, total_amount, deposit_amount } = body;

    if (!customer_name || !customer_phone || !shipping_address) {
      return NextResponse.json(
        { error: 'Missing required customer fields.' },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must contain at least one item.' },
        { status: 400 }
      );
    }

    // ─── Create order — payment_status ALWAYS starts as "pending" ───────────
    // No Paymob, no automated payment: manual deposit verification only.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_name,
        customer_phone,
        shipping_address,
        customer_address: body.customer_address ?? shipping_address,
        total_amount,
        deposit_amount,
        payment_status: 'pending',       // ← ALWAYS manual/pending
        order_source: 'online_store',
      })
      .select('id, created_at')
      .single();

    if (orderError || !order) {
      console.error('[checkout] order insert error:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order. Please try again.' },
        { status: 500 }
      );
    }

    // ─── Insert order items ─────────────────────────────────────────────────
    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      partner_id: item.partner_id,
      quantity: item.quantity,
      cost_price_at_time: item.cost_price_at_time,
      selling_price_at_time: item.selling_price_at_time,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('[checkout] order_items insert error:', itemsError);
      // Order created but items failed — return partial success with orderId
      // so the timer page can still render; admin sees incomplete order.
      return NextResponse.json(
        { error: 'Order created but items could not be saved. Contact support.' },
        { status: 500 }
      );
    }

    // ─── Decrement stock for each product ───────────────────────────────────
    for (const item of items) {
      await supabase.rpc('decrement_stock', {
        p_product_id: item.product_id,
        p_quantity: item.quantity,
      });
    }

    // ─── Success: return orderId + createdAt for the booking timer ──────────
    return NextResponse.json(
      {
        success: true,
        orderId: order.id,
        createdAt: order.created_at,
        message:
          'Order placed successfully. Awaiting manual deposit verification.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[checkout] unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

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

    // ─── Multi-Vendor: group items by partner_id ───────────────────────────
    // Each partner gets their own order so they can independently
    // track inventory, deposits, and fulfillment.
    const partnerGroups = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = partnerGroups.get(item.partner_id) ?? [];
      list.push(item);
      partnerGroups.set(item.partner_id, list);
    }

    // ─── Calculate per-partner amounts ─────────────────────────────────────
    const grandTotal = items.reduce((sum, i) => sum + i.selling_price_at_time * i.quantity, 0);

    // Distribute deposit proportionally
    const depositRatio = grandTotal > 0 ? deposit_amount / grandTotal : 0;

    // ─── Create one order per partner ──────────────────────────────────────
    const orderIds: string[] = [];
    const createdAts: string[] = [];

    for (const [partnerId, partnerItems] of partnerGroups) {
      const partnerSubtotal = partnerItems.reduce(
        (sum, i) => sum + i.selling_price_at_time * i.quantity,
        0
      );
      const partnerDeposit = Math.round(partnerSubtotal * depositRatio);

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name,
          customer_phone,
          shipping_address,
          customer_address: body.customer_address ?? shipping_address,
          total_amount: partnerSubtotal,
          deposit_amount: partnerDeposit,
          payment_status: 'pending',   // ← always manual/pending
          order_source: 'online_store',
          partner_id: partnerId,
        })
        .select('id, created_at, partner_id')
        .single();

      if (orderError || !order) {
        console.error('[checkout] order insert error for partner:', partnerId, orderError);
        // Rollback? For now, return what we have and let admin reconcile
        return NextResponse.json(
          {
            success: true,
            orderIds,
            partial: true,
            error: `Order for partner ${partnerId} failed. ${orderIds.length} orders created.`,
          },
          { status: 207 }
        );
      }

      orderIds.push(order.id);
      createdAts.push(order.created_at);

      // ─── Insert order_items for this partner's order ──────────────────
      const orderItems = partnerItems.map((item) => ({
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
        console.error('[checkout] order_items insert error for order:', order.id, itemsError);
      }

      // ─── Decrement stock ──────────────────────────────────────────────
      for (const item of partnerItems) {
        await supabase.rpc('decrement_stock', {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
        });
      }
    }

    // ─── Success: return all order IDs + earliest createdAt for timer ───
    const earliestCreatedAt = createdAts.sort()[0] ?? new Date().toISOString();

    return NextResponse.json(
      {
        success: true,
        orderIds,
        createdAt: earliestCreatedAt,
        message:
          `${orderIds.length} order(s) placed. Awaiting manual deposit verification.`,
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

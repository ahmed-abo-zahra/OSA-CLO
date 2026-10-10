import { DEMO_MODE } from '@/lib/demo-mode';
import { placeDemoOrder } from '@/lib/demo-fetch';
import { createSupabaseRouteClient } from '@/lib/supabase-route';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

type ClientCartItem = {
  productId?: string;
  product_id?: string;
  partnerId?: string;
  partner_id?: string;
  size?: string;
  quantity?: number;
  price?: number;
};

type CheckoutBody = {
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: string;
  customer_address?: string;
  notes?: string;
  payment_type?: 'full' | 'deposit';
  discount_amount?: number;
  discount_code?: string;
  items?: ClientCartItem[];
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function POST(request: NextRequest) {
  if(DEMO_MODE){try{return NextResponse.json(placeDemoOrder(await request.json()),{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid order'},{status:400});}}
  try {
    const supabase = createSupabaseRouteClient();
    const body: CheckoutBody = await request.json();

    const customerName = body.customer_name?.trim();
    const customerPhone = body.customer_phone?.trim();
    const shippingAddress = (body.shipping_address ?? body.customer_address)?.trim();
    const items = body.items ?? [];

    if (!customerName || !customerPhone || !shippingAddress) {
      return NextResponse.json(
        { error: 'Missing required customer fields.' },
        { status: 400 }
      );
    }

    if (!items.length) {
      return NextResponse.json(
        { error: 'Order must contain at least one item.' },
        { status: 400 }
      );
    }

    const normalizedItems = items.map((item) => ({
      product_id: item.product_id ?? item.productId,
      partner_id: item.partner_id ?? item.partnerId,
      size: item.size ?? null,
      quantity: Math.max(1, Math.floor(toNumber(item.quantity, 1))),
    }));

    if (normalizedItems.some((item) => !item.product_id || !item.partner_id)) {
      return NextResponse.json(
        { error: 'Invalid cart item data.' },
        { status: 400 }
      );
    }

    const productIds = Array.from(new Set(normalizedItems.map((item) => item.product_id as string)));
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, partner_id, selling_price, cost_price, stock_quantity, in_stock, is_available')
      .in('id', productIds);

    if (productsError || !products?.length) {
      return NextResponse.json(
        { error: productsError?.message || 'Products not found.' },
        { status: 404 }
      );
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of normalizedItems) {
      const product = productMap.get(item.product_id as string);
      if (!product) {
        return NextResponse.json(
          { error: 'One or more products are no longer available.' },
          { status: 400 }
        );
      }
      if (!product.is_available || !product.in_stock || product.stock_quantity < item.quantity) {
        return NextResponse.json(
          { error: 'One or more products are out of stock.' },
          { status: 400 }
        );
      }
      if (product.partner_id !== item.partner_id) {
        return NextResponse.json(
          { error: 'Invalid partner data for cart item.' },
          { status: 400 }
        );
      }
    }

    const discountAmount = Math.max(0, toNumber(body.discount_amount, 0));
    const grandTotalBeforeDiscount = normalizedItems.reduce((sum, item) => {
      const product = productMap.get(item.product_id as string)!;
      return sum + product.selling_price * item.quantity;
    }, 0);
    const grandTotal = Math.max(0, grandTotalBeforeDiscount - discountAmount);
    const requestedDeposit = body.payment_type === 'deposit' ? Math.round(grandTotal * 0.5) : grandTotal;
    const depositRatio = grandTotalBeforeDiscount > 0 ? requestedDeposit / grandTotalBeforeDiscount : 0;

    const partnerGroups = new Map<string, typeof normalizedItems>();
    for (const item of normalizedItems) {
      const list = partnerGroups.get(item.partner_id as string) ?? [];
      list.push(item);
      partnerGroups.set(item.partner_id as string, list);
    }

    const orderIds: string[] = [];
    const createdAts: string[] = [];

    for (const [, partnerItems] of Array.from(partnerGroups.entries())) {
      const partnerSubtotal = partnerItems.reduce((sum, item) => {
        const product = productMap.get(item.product_id as string)!;
        return sum + product.selling_price * item.quantity;
      }, 0);
      const partnerDeposit = Math.round(partnerSubtotal * depositRatio);

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone,
          shipping_address: shippingAddress,
          customer_address: shippingAddress,
          total_amount: partnerSubtotal,
          deposit_amount: partnerDeposit,
          payment_status: 'pending',
          order_source: 'online_store',
        })
        .select('id, created_at')
        .single();

      if (orderError || !order) {
        console.error('[checkout] order insert error:', orderError);
        return NextResponse.json(
          { error: orderError?.message || 'Failed to create order.' },
          { status: 500 }
        );
      }

      orderIds.push(order.id);
      createdAts.push(order.created_at);

      const orderItems = partnerItems.map((item) => {
        const product = productMap.get(item.product_id as string)!;
        return {
          order_id: order.id,
          product_id: item.product_id,
          partner_id: item.partner_id,
          quantity: item.quantity,
          cost_price_at_time: product.cost_price,
          selling_price_at_time: product.selling_price,
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('[checkout] order_items insert error:', itemsError);
        return NextResponse.json(
          { error: itemsError.message },
          { status: 500 }
        );
      }

      for (const item of partnerItems) {
        const { error: stockError } = await supabase.rpc('decrement_stock', {
          p_product_id: item.product_id,
          p_quantity: item.quantity,
        });
        if (stockError) console.error('[checkout] stock decrement error:', stockError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        orderIds,
        createdAt: createdAts.sort()[0] ?? new Date().toISOString(),
        message: `${orderIds.length} order(s) placed. Awaiting manual deposit verification.`,
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

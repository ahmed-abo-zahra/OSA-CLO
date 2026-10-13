import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { decodeSessionValue, COOKIE_NAME } from "@/lib/session";
import { getPartnerById, getPartnerDbId } from "@/lib/partners";

interface OrderItemInput {
  product_id: string;
  size?: string;
  quantity: number;
}

function getSession(req: NextRequest) {
  return decodeSessionValue(req.cookies.get(COOKIE_NAME)?.value);
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbPartnerId = getPartnerDbId(session.partnerId);

  try {
    const body = await request.json();
    const {
      customer_name,
      customer_phone,
      customer_address,
      source,
      notes,
      paid_amount,
      items,
    } = body as {
      customer_name: string;
      customer_phone?: string;
      customer_address?: string;
      source?: string;
      notes?: string;
      paid_amount?: number;
      items: OrderItemInput[];
    };

    if (!customer_name?.trim() || !items?.length) {
      return NextResponse.json({ error: "اسم العميل والمنتجات مطلوبة" }, { status: 400 });
    }

    // Fetch product prices (partner-scoped)
    const productIds = items.map((i) => i.product_id);
    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("id, selling_price, cost_price, name_en, stock_quantity")
      .in("id", productIds)
      .eq("partner_id", dbPartnerId);

    if (fetchError || !products?.length || products.length !== new Set(productIds).size || items.some(i=>!Number.isInteger(i.quantity)||i.quantity<1)) {
      return NextResponse.json({ error: "بعض المنتجات غير موجودة أو لا تنتمي لحسابك" }, { status: 404 });
    }

    if(products.some(p=>items.filter(i=>i.product_id===p.id).reduce((sum,i)=>sum+i.quantity,0)>p.stock_quantity))return NextResponse.json({error:"Quantity exceeds stock"},{status:400});
    const priceMap = Object.fromEntries(
      products.map((p) => [p.id, { selling: p.selling_price, cost: p.cost_price }])
    );

    const total_amount = items.reduce(
      (sum, item) => sum + (priceMap[item.product_id]?.selling ?? 0) * item.quantity,
      0
    );

    const paidAmt = Math.max(0, parseFloat(String(paid_amount ?? 0)) || 0);
    const partner = getPartnerById(session.partnerId);

    // Activity log entry
    const initialLog = JSON.stringify([{
      status: "pending",
      by: partner?.name ?? session.partnerId,
      at: new Date().toISOString(),
    }]);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{
        partner_id:       dbPartnerId,
        customer_name:    customer_name.trim(),
        customer_phone:   customer_phone?.trim()   || null,
        customer_address: customer_address?.trim() || null,
        source:           source || "manual",
        status:           "pending",
        notes:            notes?.trim()            || null,
        total_amount,
        paid_amount:      paidAmt,
        activity_log:     initialLog,
      }])
      .select()
      .single();

    if (orderError) {
      console.error("Order insert error:", orderError);
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderItems = items.map((item) => ({
      order_id:   order.id,
      product_id: item.product_id,
      size:       item.size || null,
      quantity:   item.quantity,
      unit_price: priceMap[item.product_id]?.selling ?? 0,
      cost_price: priceMap[item.product_id]?.cost    ?? 0,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (err) {
    console.error("POST /orders error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

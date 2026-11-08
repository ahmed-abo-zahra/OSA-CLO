import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// Public order tracking — no auth required, minimal data returned
export async function GET(_request: NextRequest, props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params;
  const { orderId } = params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return NextResponse.json({ error: "Invalid Order ID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, status, customer_name, total_amount, paid_amount, created_at, updated_at")
    .eq("id", orderId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Mask customer name for privacy: "Ahmed M." → "A***d M."
  const parts = (data.customer_name as string).split(" ");
  const maskedName = parts
    .map((p) => (p.length > 1 ? p[0] + "*".repeat(p.length - 2) + p[p.length - 1] : p))
    .join(" ");

  return NextResponse.json({
    id:           data.id,
    status:       data.status,
    customer:     maskedName,
    total:        data.total_amount,
    paid:         data.paid_amount,
    remaining:    Math.max(0, (data.total_amount as number) - (data.paid_amount as number ?? 0)),
    created_at:   data.created_at,
    updated_at:   data.updated_at,
  });
}

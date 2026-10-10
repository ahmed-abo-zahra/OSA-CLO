import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { decodeSessionValue, COOKIE_NAME } from "@/lib/session";
import { getPartnerById, getPartnerDbId } from "@/lib/partners";

function getSession(req: NextRequest) {
  return decodeSessionValue(req.cookies.get(COOKIE_NAME)?.value);
}

// GET /api/admin/orders/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbPartnerId = getPartnerDbId(session.partnerId);

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, products(name_en, name_ar, image_url))")
    .eq("id", params.id)
    .eq("partner_id", dbPartnerId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ order: data });
}

// PATCH /api/admin/orders/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbPartnerId = getPartnerDbId(session.partnerId);

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: "Invalid order ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { status, paid_amount } = body as { status?: string; paid_amount?: number };

    const ALLOWED_STATUSES = ["pending", "processing", "shipped", "closed"];
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    if (paid_amount !== undefined) {
      if (typeof paid_amount !== "number" || !isFinite(paid_amount) || paid_amount < 0) {
        return NextResponse.json({ error: "Invalid paid_amount" }, { status: 400 });
      }
    }

    const { data: existing } = await supabase
      .from("orders")
      .select("activity_log, status, paid_amount, total_amount")
      .eq("id", params.id)
      .eq("partner_id", dbPartnerId)
      .single();

    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const safePaid = paid_amount !== undefined
      ? Math.min(Math.max(0, paid_amount), existing.total_amount as number)
      : undefined;

    const partner = getPartnerById(session.partnerId);
    let activityLog: Array<{ status: string; by: string; at: string }> = [];
    try {
      activityLog = JSON.parse(existing.activity_log ?? "[]");
    } catch {
      activityLog = [];
    }

    if (status && status !== existing.status) {
      activityLog.push({
        status,
        by: partner?.name ?? session.partnerId,
        at: new Date().toISOString(),
      });
    }

    const updates: Record<string, unknown> = {
      activity_log: JSON.stringify(activityLog),
      updated_at: new Date().toISOString(),
    };
    if (status) updates.status = status;
    if (safePaid !== undefined) updates.paid_amount = safePaid;

    const { data, error: dbError } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", params.id)
      .eq("partner_id", dbPartnerId)
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ success: true, order: data });
  } catch (err) {
    console.error("PATCH /orders/[id] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

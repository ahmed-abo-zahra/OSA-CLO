import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { decodeSessionValue, COOKIE_NAME } from "@/lib/session";
import { getPartnerDbId } from "@/lib/partners";
import { cookies } from "next/headers";

function getSession() {
  const sessionCookie = cookies().get(COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  try { return decodeSessionValue(sessionCookie); } catch { return null; }
}

// GET /api/admin/discounts — list partner's discount codes
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("partner_id", getPartnerDbId(session.partnerId))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discounts: data });
}

// POST /api/admin/discounts — create a discount code
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { code, type, value, min_order, max_uses, expires_at } = body;

  // Validate
  if (!code || !type || !value) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["percent", "fixed"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (type === "percent" && (value <= 0 || value > 100)) {
    return NextResponse.json({ error: "Percent must be 1–100" }, { status: 400 });
  }
  if (value <= 0) {
    return NextResponse.json({ error: "Value must be positive" }, { status: 400 });
  }

  const cleanCode = String(code).trim().toUpperCase().slice(0, 50);

  const { data, error } = await supabase
    .from("discount_codes")
    .insert({
      code:       cleanCode,
      type,
      value:      Number(value),
      min_order:  Number(min_order) || 0,
      max_uses:   max_uses ? Number(max_uses) : null,
      expires_at: expires_at || null,
      partner_id: getPartnerDbId(session.partnerId),
      is_active:  true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discount: data }, { status: 201 });
}

// DELETE /api/admin/discounts — delete by id (query param)
export async function DELETE(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("discount_codes")
    .delete()
    .eq("id", id)
    .eq("partner_id", getPartnerDbId(session.partnerId)); // security: only own codes

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

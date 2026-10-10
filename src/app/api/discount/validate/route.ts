import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { code, order_total } = await req.json();

    // Basic sanitization
    if (!code || typeof code !== "string" || code.length > 50) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    const cleanCode = code.trim().toUpperCase();

    // Fetch code from DB
    const { data, error } = await supabase
      .from("discount_codes")
      .select("*")
      .eq("code", cleanCode)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 404 });
    }

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ error: "This code has expired" }, { status: 400 });
    }

    // Check max uses
    if (data.max_uses !== null && data.uses_count >= data.max_uses) {
      return NextResponse.json({ error: "This code has reached its usage limit" }, { status: 400 });
    }

    // Check minimum order
    const total = Number(order_total) || 0;
    if (total < (data.min_order ?? 0)) {
      return NextResponse.json({
        error: `Minimum order amount is EGP ${data.min_order?.toLocaleString("en-EG")}`,
      }, { status: 400 });
    }

    // Calculate discount
    let discount = 0;
    if (data.type === "percent") {
      discount = Math.round((total * data.value) / 100);
    } else {
      discount = Math.min(data.value, total); // can't discount more than total
    }

    return NextResponse.json({
      valid: true,
      code: data.code,
      type: data.type,
      value: data.value,
      discount,
      id: data.id,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

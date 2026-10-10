import { DEMO_MODE } from "@/lib/demo-mode";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-()]/g, "");
  if (clean.startsWith("0")) return "+2" + clean;
  if (clean.startsWith("2")) return "+" + clean;
  return clean;
}

// ── POST /api/auth/whatsapp/verify-otp ───────────────────────────────────────
export async function POST(request: NextRequest) {
  if(DEMO_MODE)return NextResponse.json({error:"External authentication disabled in demo"},{status:503});
  try {
    const { phone, otp } = await request.json() as { phone: string; otp: string };

    if (!phone || !otp || otp.length !== 6) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const normalized = normalizePhone(phone);

    // Fetch stored OTP
    const { data, error } = await supabase
      .from("whatsapp_otps")
      .select("otp, expires_at, verified")
      .eq("phone", normalized)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "مفيش كود مبعوت لهذا الرقم، ابعت الكود تاني" },
        { status: 400 }
      );
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "الكود انتهت صلاحيته، ابعت كود جديد" },
        { status: 400 }
      );
    }

    // Check already used
    if (data.verified) {
      return NextResponse.json(
        { error: "الكود ده استُخدم قبل كده" },
        { status: 400 }
      );
    }

    // Check OTP match
    if (data.otp !== otp) {
      return NextResponse.json({ error: "الكود غلط، حاول تاني" }, { status: 400 });
    }

    // Mark as verified
    await supabase
      .from("whatsapp_otps")
      .update({ verified: true })
      .eq("phone", normalized);

    // Upsert customer record
    const { data: customer, error: custError } = await supabase
      .from("customers")
      .upsert(
        { phone: normalized, last_login: new Date().toISOString() },
        { onConflict: "phone" }
      )
      .select("id, phone, name")
      .single();

    if (custError || !customer) {
      // Create new customer
      const { data: newCust } = await supabase
        .from("customers")
        .insert({ phone: normalized, last_login: new Date().toISOString() })
        .select("id, phone, name")
        .single();

      if (newCust) {
        return NextResponse.json({
          success:  true,
          customer: { id: newCust.id, phone: newCust.phone, name: newCust.name },
        });
      }
    }

    return NextResponse.json({
      success:  true,
      customer: { id: customer?.id, phone: customer?.phone, name: customer?.name },
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

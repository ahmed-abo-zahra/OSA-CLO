import { DEMO_MODE } from "@/lib/demo-mode";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function isValidEgyptianPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, "");
  return /^(010|011|012|015)\d{8}$/.test(clean);
}

function normalizePhone(phone: string): string {
  const clean = phone.replace(/[\s\-()]/g, "");
  if (clean.startsWith("0")) return "+2" + clean;
  if (clean.startsWith("2")) return "+" + clean;
  return clean;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendWhatsAppOTP(phone: string, otp: string): Promise<boolean> {
  try {
    const normalized = normalizePhone(phone).replace("+", "");

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      console.log(`[DEV] WhatsApp OTP for +${normalized}: ${otp}`);
      return true;
    }

    const body = new URLSearchParams({
      From: fromNumber,
      To:   `whatsapp:+${normalized}`,
      Body: `🔐 ASO CLO — كود التفعيل: ${otp}\nصالح لمدة 10 دقائق.`,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method:  "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    return res.ok;
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  if(DEMO_MODE)return NextResponse.json({error:"External authentication disabled in demo"},{status:503});
  try {
    const { phone } = await request.json() as { phone: string };

    if (!phone || !isValidEgyptianPhone(phone)) {
      return NextResponse.json(
        { error: "رقم التليفون غير صحيح. ادخل رقم مصري صحيح (010/011/012/015)" },
        { status: 400 }
      );
    }

    const otp        = generateOTP();
    const expiresAt  = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const normalized = normalizePhone(phone);

    const { error: dbError } = await supabase
      .from("whatsapp_otps")
      .upsert(
        { phone: normalized, otp, expires_at: expiresAt, verified: false },
        { onConflict: "phone" }
      );

    if (dbError) {
      console.error("OTP DB error:", dbError);
      return NextResponse.json({ error: "حدث خطأ، حاول تاني" }, { status: 500 });
    }

    const sent = await sendWhatsAppOTP(phone, otp);

    if (!sent) {
      return NextResponse.json(
        { error: "مش قادر يبعت الكود على الواتساب دلوقتي، حاول تاني" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-otp error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

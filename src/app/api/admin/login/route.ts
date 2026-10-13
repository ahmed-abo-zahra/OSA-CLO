import { NextRequest, NextResponse } from "next/server";
import { PARTNERS } from "@/lib/partners";
import { DEMO_MODE } from "@/lib/demo-mode";
import { timingSafeEqual } from "node:crypto";
function findPartner(name:string,password:string){
 const partner=PARTNERS.find(p=>p.name.toLowerCase()===name.toLowerCase().trim());if(!partner)return null;
 const expected=process.env[`ADMIN_PASSWORD_${partner.id.toUpperCase()}`] ?? (DEMO_MODE ? 'aso-demo-2026' : '');
 const a=Buffer.from(password),b=Buffer.from(expected);
 return b.length>0&&a.length===b.length&&timingSafeEqual(a,b)?partner:null;
}
import { encodeSession, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, password } = body as { name: string; password: string };

    if (typeof name !== "string" || typeof password !== "string" || !name || !password) {
      return NextResponse.json(
        { error: "الاسم وكلمة المرور مطلوبان" },
        { status: 400 }
      );
    }

    const partner = findPartner(name, password);
    if (!partner) {
      return NextResponse.json(
        { error: "اسم المستخدم أو كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    const sessionValue = encodeSession({
      partnerId: partner.id,
      partnerName: partner.name,
    });

    const response = NextResponse.json({
      success: true,
      partner: { id: partner.id, name: partner.name },
    });

    response.cookies.set(COOKIE_NAME, sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

"use client";

import { useEffect } from "react";

export default function SecurityConsoleNotice() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      console.log(
        "%cتنبيه أمني صارم | SECURITY WARNING",
        "color: #dc2626; font-size: 28px; font-weight: 800; text-shadow: 1px 1px 0 #000; padding: 4px;"
      );
      console.log(
        "%cهذه النافذة مخصصة للمطورين فقط لأغراض المتابعة والتشخيص.\n" +
        "• يمنع نسخ أو لصق أي أكواد غير موثوقة هنا (Self-XSS).\n" +
        "• يمنع مشاركة أي رموز جلسة أو بيانات مع أي جهة.\n" +
        "• جميع أسعار المنتجات والمخزون والطلبات والصلاحيات يتم التحقق منها خادميًا (Server-Side) وبشكل ذري داخل قاعدة البيانات، ولا يمكن التلاعب بها من خلال المتصفح.\n\n" +
        "This browser console is intended for authorized developers only.\n" +
        "Never paste untrusted code or share session cookies. All pricing, inventory, and order authorizations are enforced server-side.",
        "color: #374151; font-size: 13px; line-height: 1.6; font-family: sans-serif;"
      );
    } catch {
      // Ignore if console is restricted
    }
  }, []);

  return null;
}

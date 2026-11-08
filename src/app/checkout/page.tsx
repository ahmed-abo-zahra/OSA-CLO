"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import type { CartItem } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import ProductImage from "@/components/ProductImage";
import { DEMO_MODE } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

const WA_NUMBER = "201038856486";

// ── Egyptian Governorates & Cities ────────────────────────────────────────────
const EGYPT_GOVERNORATES: Record<string, string[]> = {
  "القاهرة": ["مدينة نصر", "هليوبوليس", "المعادي", "الزيتون", "شبرا", "السيدة زينب", "مصر الجديدة", "العباسية", "باب الشعرية", "التجمع الخامس", "المقطم", "عين شمس", "مصر القديمة"],
  "الجيزة": ["الجيزة", "6 أكتوبر", "الشيخ زايد", "الهرم", "فيصل", "المنيل", "بولاق الدكرور", "عين الصيرة", "حوامدية", "البدرشين", "الصف", "أطفيح"],
  "الإسكندرية": ["محرم بك", "ميامي", "سيدي جابر", "العجمي", "المنتزه", "العامرية", "اللبان", "كليوباترا", "بحري", "الإبراهيمية"],
  "القليوبية": ["بنها", "قليوب", "شبرا الخيمة", "الخانكة", "العبور", "طوخ", "قها", "كفر شكر"],
  "الشرقية": ["الزقازيق", "العاشر من رمضان", "بلبيس", "منيا القمح", "أبو حماد", "كفر صقر", "فاقوس"],
  "الغربية": ["طنطا", "المحلة الكبرى", "كفر الزيات", "سمنود", "بسيون", "زفتى"],
  "المنوفية": ["شبين الكوم", "مينوف", "أشمون", "تلا", "الشهداء", "سرس الليان"],
  "الدقهلية": ["المنصورة", "ميت غمر", "دكرنس", "أجا", "بلقاس", "السنبلاوين", "طلخا", "شربين"],
  "البحيرة": ["دمنهور", "كفر الدوار", "إيتاي البارود", "أبو حمص", "رشيد", "شبراخيت", "الدلنجات"],
  "الفيوم": ["الفيوم", "سنورس", "طامية", "يوسف الصديق", "إطسا"],
  "بني سويف": ["بني سويف", "الواسطى", "ناصر", "إهناسيا", "ببا", "الفشن"],
  "المنيا": ["المنيا", "ملوي", "أبو قرقاص", "مطاي", "بني مزار", "سمالوط", "العدوة"],
  "أسيوط": ["أسيوط", "ديروط", "أبنوب", "القوصية", "منفلوط", "الغنايم", "أبو تيج", "ساحل سليم"],
  "سوهاج": ["سوهاج", "أخميم", "طهطا", "طما", "جرجا", "دار السلام", "البلينا", "المراغة"],
  "قنا": ["قنا", "نجع حمادي", "دشنا", "قوص", "فرشوط", "نقادة", "الوقف"],
  "الأقصر": ["الأقصر", "إسنا", "الطود", "أرمنت", "البياضية"],
  "أسوان": ["أسوان", "كوم أمبو", "إدفو", "دراو", "نصر النوبة"],
  "الإسماعيلية": ["الإسماعيلية", "أبو صوير", "القنطرة", "فايد", "القصاصين"],
  "بورسعيد": ["بورسعيد", "بورفؤاد"],
  "السويس": ["السويس", "عتاقة", "الجناين"],
  "دمياط": ["دمياط", "رأس البر", "فارسكور", "كفر سعد", "الزرقا"],
  "كفر الشيخ": ["كفر الشيخ", "دسوق", "فوه", "سيدي سالم", "بلطيم", "الرياض"],
  "مطروح": ["مرسى مطروح", "سيوة", "الضبعة", "سلوم", "الحمام"],
  "شمال سيناء": ["العريش", "رفح", "الشيخ زويد", "بئر العبد", "نخل"],
  "جنوب سيناء": ["طور سيناء", "شرم الشيخ", "دهب", "نويبع", "سانت كاترين"],
  "البحر الأحمر": ["الغردقة", "سفاجا", "القصير", "مرسى علم", "رأس غارب"],
  "الوادي الجديد": ["الخارجة", "الداخلة", "الفرافرة", "باريس"],
};

// ── Validation helpers ────────────────────────────────────────────────────────
function isValidPhone(phone: string) {
  return /^(010|011|012|015)\d{8}$/.test(phone.replace(/[\s\-()]/g, ""));
}
function isLettersOnly(name: string) {
  return /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s''\-]+$/.test(name.trim());
}

type PayType = "full" | "deposit";

interface FormErrors {
  name?: string;
  phone?: string;
  governorate?: string;
  city?: string;
  detailedAddress?: string;
  terms?: string;
  server?: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { t, lang, isRTL } = useLanguage();
  const { items, total, clearCart, isHydrated, removeItem } = useCart();
  const { warning } = useToast();

  const [name,            setName]            = useState("");
  const [phone,           setPhone]           = useState("");
  const [governorate,     setGovernorate]     = useState("");
  const [city,            setCity]            = useState("");
  const [detailedAddress, setDetailedAddress] = useState("");
  const [notes,           setNotes]           = useState("");
  const [payType,         setPayType]         = useState<PayType>("full");
  const [terms,           setTerms]           = useState(false);
  const [errors,          setErrors]          = useState<FormErrors>({});
  const [loading,         setLoading]         = useState(false);

  const submitted = useRef(false);

  // Discount
  const [discountCode,    setDiscountCode]    = useState("");
  const [discountAmount,  setDiscountAmount]  = useState(0);
  const [discountLabel,   setDiscountLabel]   = useState("");
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError,   setDiscountError]   = useState("");

  const discountedTotal = Math.max(0, total - discountAmount);
  const availableCities = governorate ? (EGYPT_GOVERNORATES[governorate] ?? []) : [];

  // ── Cart Realtime Sync ──────────────────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE || !isHydrated || items.length === 0) return;

    const channel = supabase
      .channel("cart-validation-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          if (eventType === "DELETE") {
            const deletedId = (oldRecord as { id: string }).id;
            const deletedItem = items.find((i) => i.productId === deletedId);
            if (deletedItem) {
              removeItem(deletedId, deletedItem.size);
              warning(`"${deletedItem.nameEn}" has been removed from your cart — it's no longer available.`);
            }
          }

          if (eventType === "UPDATE") {
            const updated = newRecord as { id: string; in_stock: boolean; is_available: boolean; stock_quantity: number };
            if (!updated.in_stock || !updated.is_available || updated.stock_quantity === 0) {
              const affectedItem = items.find((i) => i.productId === updated.id);
              if (affectedItem) {
                removeItem(updated.id, affectedItem.size);
                warning(`"${affectedItem.nameEn}" is now out of stock and has been removed from your cart.`);
              }
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isHydrated, items, removeItem, warning]);

  async function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res  = await fetch("/api/discount/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCode.trim(),
          items: items.map((item) => ({
            product_id: item.productId,
            partner_id: item.partnerId,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setDiscountError(data.error || "Invalid code"); setDiscountAmount(0); setDiscountLabel(""); }
      else {
        setDiscountAmount(data.discount);
        setDiscountLabel(data.type === "percent" ? `${data.value}% OFF` : `EGP ${data.value} OFF`);
      }
    } catch { setDiscountError("Network error"); }
    setDiscountLoading(false);
  }

  // Redirect to home if cart is empty
  useEffect(() => {
    if (isHydrated && items.length === 0 && !submitted.current) router.push("/");
  }, [isHydrated, items.length, router]);

  const paidNow   = payType === "deposit" ? Math.round(discountedTotal * 0.5) : discountedTotal;
  const remaining = discountedTotal - paidNow;
  const fmtP = (n: number) => `EGP ${n.toLocaleString("en-EG")}`;

  // Compose the full address for storage
  const fullAddress = [governorate, city, detailedAddress.trim()].filter(Boolean).join(" — ");

  // Client-side validation
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!name.trim())                    e.name            = t("storefront.checkout.errors.nameRequired");
    else if (!isLettersOnly(name))       e.name            = t("storefront.checkout.errors.nameInvalid");
    if (!phone.trim())                   e.phone           = t("storefront.checkout.errors.phoneRequired");
    else if (!isValidPhone(phone))       e.phone           = t("storefront.checkout.errors.phoneInvalid");
    if (!governorate)                    e.governorate     = t("storefront.checkout.errors.governorateRequired");
    if (!city)                           e.city            = t("storefront.checkout.errors.cityRequired");
    if (!detailedAddress.trim())         e.detailedAddress = t("storefront.checkout.errors.detailedAddressRequired");
    else if (detailedAddress.trim().length < 5) e.detailedAddress = t("storefront.checkout.errors.addressTooShort");
    if (!terms)                          e.terms           = t("storefront.checkout.errors.termsRequired");
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name:    name.trim(),
          customer_phone:   phone.trim(),
          customer_address: fullAddress,
          notes:            notes.trim() || undefined,
          payment_type:     payType,
          discount_code:    discountCode.trim() || undefined,
          items: items.map((i) => ({
            productId: i.productId,
            partnerId: i.partnerId,
            size:      i.size,
            color:     i.color,
            quantity:  i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) { setErrors({ server: data.error }); setLoading(false); return; }

      submitted.current = true;
      clearCart();
      const ids = (data.orderIds as string[]).join(",");
      router.push(`/order/success?ids=${ids}`);

    } catch {
      setErrors({ server: t("storefront.checkout.errors.serverError") });
      setLoading(false);
    }
  }

  // ── Select style helper ──────────────────────────────────────────────────────
  const selectStyle = (hasError?: string) =>
    `input-style appearance-none cursor-pointer ${hasError ? "border-red-400 bg-red-50" : ""}`;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-offwhite dark:bg-brand-black">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-500 hover:text-brand-black dark:text-gray-400 dark:hover:text-offwhite mb-6 flex items-center gap-1 transition-colors active:scale-95"
        >
          ← {t("storefront.product.back")}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">

          {/* ── Form ─────────────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <h1 className="text-xl font-black tracking-[-0.02em] text-brand-black dark:text-offwhite">
                {t("storefront.checkout.title")}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("storefront.checkout.subtitle")}</p>
            </div>

            {/* ── Profile Autofill Badge ───────────────────────────────────── */}
            {/* Name */}
            <Field label={t("storefront.checkout.customerName")} error={errors.name}>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
                placeholder={t("storefront.checkout.namePlaceholder")}
                className={`input-style ${errors.name ? "border-red-400 bg-red-50" : ""}`}
              />
            </Field>

            {/* Phone */}
            <Field label={t("storefront.checkout.phone")} error={errors.phone}>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: undefined })); }}
                placeholder="010XXXXXXXX"
                className={`input-style font-mono ${errors.phone ? "border-red-400 bg-red-50" : ""}`}
                dir="ltr"
              />
            </Field>

            {/* ── Address — 3 Fields ──────────────────────────────────────── */}
            <div className="border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-4 flex flex-col gap-4">
              <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 dark:text-gray-400">
                📍 {t("storefront.checkout.shippingInfo")}
              </p>

              {/* Governorate */}
              <Field label={t("storefront.checkout.governorate")} error={errors.governorate}>
                <div className="relative">
                  <select
                    value={governorate}
                    onChange={(e) => { setGovernorate(e.target.value); setCity(""); setErrors((p) => ({ ...p, governorate: undefined, city: undefined })); }}
                    className={selectStyle(errors.governorate)}
                  >
                    <option value="">{t("storefront.checkout.selectGovernorate")}</option>
                    {Object.keys(EGYPT_GOVERNORATES).map((gov) => (
                      <option key={gov} value={gov}>{gov}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>
              </Field>

              {/* City / Region */}
              <Field label={t("storefront.checkout.city")} error={errors.city}>
                <div className="relative">
                  <select
                    value={city}
                    onChange={(e) => { setCity(e.target.value); setErrors((p) => ({ ...p, city: undefined })); }}
                    disabled={!governorate}
                    className={`${selectStyle(errors.city)} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <option value="">{t("storefront.checkout.selectCity")}</option>
                    {availableCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>
              </Field>

              {/* Detailed Address */}
              <Field label={t("storefront.checkout.detailedAddress")} error={errors.detailedAddress}>
                <input
                  type="text"
                  value={detailedAddress}
                  onChange={(e) => { setDetailedAddress(e.target.value); setErrors((p) => ({ ...p, detailedAddress: undefined })); }}
                  placeholder={t("storefront.checkout.addressPlaceholder")}
                  className={`input-style ${errors.detailedAddress ? "border-red-400 bg-red-50" : ""}`}
                />
              </Field>

              {/* Composed address preview */}
              {fullAddress && (
                <div className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 px-3 py-2 text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  📦 {t("storefront.checkout.shippingTo")} <span className="font-semibold text-brand-black dark:text-offwhite">{fullAddress}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            <Field label={t("storefront.checkout.notes")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("storefront.checkout.notesPlaceholder")}
                rows={2}
                className="input-style resize-none text-xs"
              />
            </Field>

            {/* Payment Method */}
            <div className="flex flex-col gap-2">
              {DEMO_MODE && <p role="note" className="text-sm mb-4 p-3 border border-brand-border">{lang==='ar'?'طلب تجريبي فقط. لا تدفع أو تحول أي مبلغ؛ الدفع الإلكتروني غير مفعل.':'Demo order only. Do not pay or transfer money; online payment is disabled.'}</p>}
              {!DEMO_MODE && <label className="label-style">{t("storefront.checkout.payment")}</label>}

              {!DEMO_MODE && <>
              {/* Vodafone Cash badge */}
              <div className="flex items-center gap-2 px-4 py-3 border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
                <span className="text-lg">📱</span>
                <div>
                  <p className="text-xs font-bold text-brand-black dark:text-offwhite">{t("storefront.checkout.vodafoneCash")}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("storefront.checkout.onlyPaymentMethod")}</p>
                </div>
                <span className="ml-auto text-[10px] font-bold text-green-600 border border-green-200 bg-green-50 px-2 py-0.5">{t("storefront.checkout.active")}</span>
              </div>

              {/* Full vs Deposit toggle */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button type="button" onClick={() => setPayType("full")}
                  className={`py-3 text-[11px] font-bold tracking-wide border transition-all active:scale-[0.98]
                    ${payType === "full" ? "bg-brand-black dark:bg-offwhite text-white dark:text-brand-black border-brand-black dark:border-offwhite" : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-white/30"}`}>
                  {t("storefront.checkout.payFull")}
                </button>
                <button type="button" onClick={() => setPayType("deposit")}
                  className={`py-3 text-[11px] font-bold tracking-wide border transition-all active:scale-[0.98]
                    ${payType === "deposit" ? "bg-brand-black dark:bg-offwhite text-white dark:text-brand-black border-brand-black dark:border-offwhite" : "border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-white/30"}`}>
                  {t("storefront.checkout.payDeposit")}
                </button>
              </div>

                </>}
            {/* Deposit breakdown */}
              {payType === "deposit" && (
                <div className="grid grid-cols-3 gap-2 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-3">
                  <FinLine label={t("storefront.checkout.total")}     value={fmtP(total)}     />
                  <FinLine label={t("storefront.checkout.paidNow")}   value={fmtP(paidNow)}   highlight />
                  <FinLine label={t("storefront.checkout.remaining")} value={fmtP(remaining)} warning />
                </div>
              )}
            </div>

            {/* Terms */}
            <label className={`flex items-start gap-3 cursor-pointer group ${errors.terms ? "text-red-600" : ""}`}>
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => { setTerms(e.target.checked); setErrors((p) => ({ ...p, terms: undefined })); }}
                className="mt-0.5 w-4 h-4 accent-[#1A1A1A]"
              />
              <span className="text-xs text-gray-600 leading-relaxed group-hover:text-brand-black dark:text-offwhite transition-colors">
                {t("storefront.checkout.terms")}
              </span>
            </label>
            {errors.terms && <p className="text-xs text-red-600 -mt-3">{errors.terms}</p>}

            {/* Discount Code */}
            {!DEMO_MODE && <div className="flex flex-col gap-2">
              <label className="label-style">{t("storefront.checkout.discountOptional")}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountAmount(0); setDiscountLabel(""); setDiscountError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyDiscount())}
                  placeholder="SUMMER20"
                  className="input-style flex-1 font-mono tracking-widest text-sm"
                />
                <button type="button" onClick={applyDiscount} disabled={discountLoading || !discountCode.trim()}
                  className="px-4 py-2 border border-gray-300 text-xs font-bold text-gray-600 hover:border-gray-500 disabled:opacity-40 transition-all active:scale-95 shrink-0">
                  {discountLoading ? "..." : t("storefront.checkout.apply")}
                </button>
              </div>
              {discountError && <p className="text-xs text-red-500">{discountError}</p>}
              {discountLabel && <p className="text-xs text-green-600 font-bold">✓ {discountLabel} {t("storefront.checkout.applied")}</p>}
            </div>}

            {/* Server error */}
            {errors.server && (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3">
                <p className="text-xs text-red-600 font-medium">{errors.server}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-black dark:bg-offwhite text-white dark:text-brand-black py-4 text-xs font-black tracking-[0.15em] uppercase hover:bg-[#333] dark:hover:bg-gray-200 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {loading ? t("storefront.checkout.submitting") : t("storefront.checkout.submit")}
            </button>

            {/* WhatsApp support */}
            <a
              href={`https://wa.me/${WA_NUMBER}?text=Hi, I need help with my order.`}
              target="_blank" rel="noreferrer"
              className="text-center text-[10px] text-gray-500 dark:text-gray-400 hover:text-green-600 transition-colors"
            >
              💬 {t("storefront.checkout.chatOnWhatsApp")}
            </a>
          </form>

          {/* ── Order Summary ─────────────────────────────────────────────── */}
          <OrderSummary items={items} total={total} discountAmount={discountAmount} discountLabel={discountLabel} paidNow={paidNow} payType={payType} lang={lang} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-style">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function FinLine({ label, value, highlight, warning }: { label: string; value: string; highlight?: boolean; warning?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-bold tracking-wide uppercase text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-black font-mono ${highlight ? "text-blue-700 dark:text-blue-400" : warning ? "text-orange-600 dark:text-orange-400" : "text-brand-black dark:text-offwhite"}`}>{value}</p>
    </div>
  );
}

function OrderSummary({ items, total, discountAmount = 0, discountLabel, paidNow, payType, lang }: {
  items: CartItem[];
  total: number;
  discountAmount?: number;
  discountLabel?: string;
  paidNow: number;
  payType: PayType;
  lang: string;
}) {
  const { t } = useLanguage();
  const fmtP       = (n: number) => `EGP ${n.toLocaleString("en-EG")}`;
  const finalTotal = Math.max(0, total - discountAmount);
  return (
    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-5 h-fit sticky top-20">
      <h2 className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-500 dark:text-gray-400 mb-4">{t("storefront.checkout.orderSummary")}</h2>
      <ul className="space-y-3 mb-4">
        {items.map((item) => (
          <li key={`${item.nameEn}-${item.size}`} className="flex items-center gap-3">
            <div className="w-10 h-12 bg-gray-100 dark:bg-brand-black shrink-0 overflow-hidden">
              {item.imageUrl
                ? <ProductImage src={item.imageUrl} alt={item.nameEn} sizes="320px" />
                : <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-gray-300">{item.nameEn.slice(0,2)}</div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-brand-black dark:text-offwhite truncate">{lang === "ar" && item.nameAr ? item.nameAr : item.nameEn}</p>
              {item.size && <p className="text-[9px] text-gray-500 dark:text-gray-400">{t("storefront.checkout.size")}: {item.size}</p>}
              <p className="text-[10px] text-gray-500 dark:text-gray-400">× {item.quantity}</p>
            </div>
            <p className="text-xs font-mono font-bold text-brand-black dark:text-offwhite shrink-0">{fmtP(item.price * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <div className="border-t border-gray-100 dark:border-brand-border/10 pt-4 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">{t("storefront.checkout.subtotal")}</span>
          <span className="font-mono font-bold text-brand-black dark:text-offwhite">{fmtP(total)}</span>
        </div>
        {discountAmount > 0 && discountLabel && (
          <div className="flex justify-between text-xs">
            <span className="text-green-600 font-bold">🎟 {discountLabel}</span>
            <span className="font-mono font-bold text-green-600">−{fmtP(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs border-t border-gray-100 dark:border-brand-border/10 pt-2 mt-1">
          <span className="font-bold text-brand-black dark:text-offwhite">{t("storefront.checkout.total")}</span>
          <span className="font-mono font-black text-brand-black dark:text-offwhite">{fmtP(finalTotal)}</span>
        </div>
        {payType === "deposit" && (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-blue-600">{t("storefront.checkout.dueNow")}</span>
              <span className="font-mono font-bold text-blue-700">{fmtP(paidNow)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-orange-600">{t("storefront.checkout.onDelivery")}</span>
              <span className="font-mono font-bold text-orange-600">{fmtP(finalTotal - paidNow)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

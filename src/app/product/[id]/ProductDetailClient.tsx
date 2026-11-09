"use client";
import { colorLabel } from "@/lib/colors";

import ProductImage from "@/components/ProductImage";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import { getSubcategoryLabel } from "@/lib/categories";
import { DEMO_MODE } from "@/lib/demo-mode";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useCart } from "@/context/CartContext";
import SmartSizeGuide from "@/components/SmartSizeGuide";
import WishlistButton from "@/components/WishlistButton";

export interface PDPProduct {
  id: string;
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
  category?: string | null;
  selling_price: number;
  sizes?: string[] | null;
  in_stock: boolean;
  colors?: string[];
  description_ar?: string;
  image_url?: string | null;
  image_urls?: string[] | null;
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type={onChange ? "button" : "submit"}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHovered(n)}
          onMouseLeave={() => onChange && setHovered(0)}
          className={`text-xl transition-colors ${onChange ? "cursor-pointer" : "cursor-default"} ${
            n <= (hovered || value) ? "text-yellow-400" : "text-gray-200"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── Reviews Section ───────────────────────────────────────────────────────────
function ReviewsSection({ productId }: { productId: string }) {
  const { t } = useLanguage();
  const [name,    setName]    = useState("");
  const [rating,  setRating]  = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || rating === 0) {
      setError(t("storefront.product.reviewError"));
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, customer_name: name.trim(), rating, comment: comment.trim() }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); }
      else {
        setSuccess(true);
        setName(""); setRating(0); setComment("");
      }
    } catch { setError(t("storefront.checkout.errors.serverError")); }
    setLoading(false);
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 border-t border-gray-100">
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 dark:text-gray-400 mb-6 text-center">
        {t("storefront.product.customerReviews")}
      </p>

      {success ? (
        <div className="max-w-md mx-auto bg-green-50 border border-green-200 px-6 py-5 text-center">
          <p className="text-sm font-bold text-green-700">✓ {t("storefront.product.reviewSuccess")}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-md mx-auto bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/30 p-6 flex flex-col gap-4">
          <h3 className="text-xs font-bold tracking-widest uppercase text-brand-black dark:text-offwhite">{t("storefront.product.writeReview")}</h3>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="label-style">{t("storefront.product.yourName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("storefront.product.reviewNamePlaceholder")}
              className="input-style"
            />
          </div>

          {/* Rating */}
          <div className="flex flex-col gap-1.5">
            <label className="label-style">{t("storefront.product.rating")}</label>
            <StarRating value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {["","Poor","Fair","Good","Very Good","Excellent"][rating]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1.5">
            <label className="label-style">{t("storefront.product.commentOptional")}</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={t("storefront.product.greatQuality")}
              className="input-style resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-black dark:bg-offwhite text-white dark:text-brand-black text-[11px] font-black tracking-[0.15em] uppercase hover:bg-[#333] dark:hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            {loading ? t("storefront.checkout.submitting") : t("storefront.product.submitReview")}
          </button>
        </form>
      )}
    </section>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductDetailClient({ product }: { product: PDPProduct }) {
  const router = useRouter();
  const { t, lang, isRTL } = useLanguage();
  const { addItem } = useCart();

  const [selectedColor,setSelectedColor]=useState(product.colors?.[0]??"");
  const [selectedSize, setSelectedSize] = useState("");
  const [sizeError,    setSizeError]    = useState(false);
  const [added,        setAdded]        = useState(false);
  const [shared,       setShared]       = useState(false);

  // ── Gallery state ─────────────────────────────────────────────────────────
  const allImages = [
    ...(product.image_url ? [product.image_url] : []),
    ...(product.image_urls ?? []).filter((u) => u && u !== product.image_url),
  ];
  const [activeImg, setActiveImg] = useState(0);

  const displayName = lang === "ar" && product.name_ar ? product.name_ar : product.name_en;
  const hasSizes    = (product.sizes?.length ?? 0) > 0;

  function handleAddToCart() {
    if (!product.in_stock) return;
    if (hasSizes && !selectedSize) { setSizeError(true); return; }
    setSizeError(false);
    addItem({
      productId: product.id,
      nameEn:    product.name_en,
      nameAr:    product.name_ar ?? undefined,
      price:     product.selling_price,
      imageUrl:  allImages[0] ?? undefined,
      size:      selectedSize,
      quantity:  1,
      color: selectedColor,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleWABuy() {
    const msg = encodeURIComponent(
      `مرحباً، أريد طلب:\n${product.name_en}${selectedSize ? ` - Size: ${selectedSize}` : ""}\nالسعر: EGP ${product.selling_price}`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank", "noopener,noreferrer");
  }

  async function handleShare() {
    const url = `${window.location.origin}/product/${product.id}`;
    if ("share" in navigator) {
      try { await navigator.share({ title: displayName, url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  // ── Gallery navigation ────────────────────────────────────────────────────
  function prevImg() { setActiveImg((i) => (i === 0 ? allImages.length - 1 : i - 1)); }
  function nextImg() { setActiveImg((i) => (i === allImages.length - 1 ? 0 : i + 1)); }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-[#FAF9F6] dark:bg-brand-black">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Back */}
        <button onClick={() => router.back()} className="text-xs text-gray-500 hover:text-brand-black dark:text-gray-400 dark:hover:text-offwhite mb-6 flex items-center gap-1 transition-colors">
          {t("storefront.product.back")}
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">

          {/* ── Image Gallery ── */}
          <div className="flex flex-col gap-3">
            {/* Main image */}
            <div className="group relative aspect-[3/4] bg-gray-100 dark:bg-brand-black overflow-hidden cursor-zoom-in" style={{overflow:"hidden"}}>
              {allImages.length > 0 ? (
                <div className="absolute inset-0">
                <ProductImage src={allImages[activeImg]} alt={displayName} sizes="1000px" priority />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl font-black text-gray-200">{displayName.slice(0, 2).toUpperCase()}</span>
                </div>
              )}

              {/* Arrows — only if multiple images */}
              {allImages.length > 1 && (
                <>
                  <button onClick={prevImg}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-brand-gray/80 backdrop-blur flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-brand-gray transition-all shadow-sm">
                    ‹
                  </button>
                  <button onClick={nextImg}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-brand-gray/80 backdrop-blur flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-brand-gray transition-all shadow-sm">
                    ›
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button key={i} onClick={() => setActiveImg(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeImg ? "bg-white dark:bg-brand-gray w-4" : "bg-white dark:bg-brand-gray/50"}`}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Share button */}
              <button
                onClick={handleShare}
                className="absolute top-3 right-3 bg-white dark:bg-brand-gray/90 backdrop-blur px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-brand-gray shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                {shared ? "✓ Copied!" : t("storefront.products.share")}
              </button>
            </div>

            {/* Thumbnails strip */}
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {allImages.map((img, i) => (
                  <button key={i} onClick={() => setActiveImg(i)}
                    className={`shrink-0 w-16 h-20 overflow-hidden border-2 transition-all ${
                      i === activeImg ? "border-[#1A1A1A]" : "border-transparent opacity-60 hover:opacity-100"
                    }`}>
                    <ProductImage src={img} alt={`${displayName} ${i+1}`} sizes="320px" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Details ── */}
          <div className="flex flex-col gap-5">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {product.category && (
                <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-brand-border/30 px-2 py-0.5">
                  {getSubcategoryLabel(product.category,lang)}
                </span>
              )}
            </div>

            {/* Name */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-brand-black dark:text-offwhite leading-tight">
                {displayName}
              </h1>
              {lang === "en" && product.name_ar && (
                <p className="text-lg font-semibold text-gray-500 dark:text-gray-400 mt-1" dir="rtl">{product.name_ar}</p>
              )}
            </div>

            {/* Price */}
            <p className="text-2xl font-black text-brand-black dark:text-offwhite font-mono tracking-tight">
              EGP {product.selling_price.toLocaleString("en-EG")}
            </p>

            {/* Description */}
            {product.description && (
              <div>
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-gray-500 dark:text-gray-400 mb-1.5">
                  {t("storefront.product.description")}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{lang === "ar" ? (product.description_ar??product.description) : product.description}</p>
              </div>
            )}

            {/* Size Picker */}
            {hasSizes && (
              <div>
                <p className={`text-[10px] font-bold tracking-[0.1em] uppercase mb-2 ${sizeError ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                  {t("storefront.product.sizes")} {sizeError && `— ${t("storefront.products.sizeRequired")}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes!.map((size) => (
                    <button
                      key={size}
                      onClick={() => { setSelectedSize(size); setSizeError(false); }}
                      className={`min-w-[44px] h-10 px-3 text-sm font-bold border transition-all
                        ${selectedSize === size
                          ? "bg-brand-black dark:bg-offwhite text-white dark:text-brand-black border-brand-black dark:border-offwhite"
                          : sizeError
                          ? "border-red-300 text-red-500 hover:border-red-500"
                          : "border-gray-200 dark:border-brand-border/30 text-gray-600 dark:text-gray-300 hover:border-brand-black dark:hover:border-offwhite"
                        }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>

                {/* Smart Size Guide */}
                <div className="mt-3">
                  <SmartSizeGuide
                    category={product.category}
                    availableSizes={product.sizes}
                    onSizeSelect={(size) => { setSelectedSize(size); setSizeError(false); }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-brand-muted">{product.in_stock ? (lang === "ar" ? "متاح للطلب" : "Available") : (lang === "ar" ? "غير متاح حاليًا" : "Currently unavailable")}</p>
              {product.colors?.length ? <fieldset><legend className="text-xs font-bold mb-2">{lang==="ar"?"اللون":"Color"}</legend><div className="flex flex-wrap gap-2">{product.colors.map(color=><button key={color} type="button" aria-pressed={selectedColor===color} onClick={()=>setSelectedColor(color)} className={`px-4 py-2 border text-xs ${selectedColor===color?'bg-brand-black text-white dark:bg-offwhite dark:text-brand-black':'border-brand-border'}`}>{colorLabel(color,lang)}</button>)}</div></fieldset> : null}
            </div>
            {/* CTAs */}
            <div className="flex flex-col gap-3 pt-2">
              <button
                disabled={!product.in_stock} onClick={handleAddToCart}
                className={`w-full py-4 text-xs font-black tracking-[0.15em] uppercase transition-all
                  ${added
                    ? "bg-green-600 text-white"
                    : "bg-brand-black dark:bg-offwhite text-white dark:text-brand-black hover:bg-brand-gray dark:hover:bg-gray-200"
                  }`}
              >
                {added ? `✓ ${t("storefront.products.inCart")}` : t("storefront.products.addToCart")}
              </button>

              {WHATSAPP_NUMBER && <button
                disabled={DEMO_MODE} onClick={handleWABuy}
                className="w-full py-4 text-xs font-black tracking-[0.15em] uppercase bg-[#25D366] text-white hover:bg-[#1EBE57] transition-colors flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 1.991.52 3.863 1.432 5.482L2 22l4.664-1.408A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
                </svg>
                {DEMO_MODE ? (lang==="ar"?"الطلب عبر واتساب غير مفعّل في العرض":"WhatsApp ordering disabled in demo") : t("storefront.products.buyWhatsApp")}
              </button>}

              {/* Wishlist button */}
              <div className="flex justify-center pt-1">
                <WishlistButton product={product} showLabel />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Reviews Section (outside the main grid) ── */}
      {!DEMO_MODE && <ReviewsSection productId={product.id} />}
    </div>
  );
}

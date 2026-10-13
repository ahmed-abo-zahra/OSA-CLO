"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { DEMO_MODE } from "@/lib/demo-mode";
import { CATEGORY_GROUPS, getSubcategoryLabel } from "@/lib/categories";
import { useLanguage } from "@/context/LanguageContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase";
import CategoryFilter from "@/components/CategoryFilter";
import Fuse from "fuse.js";
import WishlistButton from "@/components/WishlistButton";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StorefrontProduct {
  id: string;
  partner_id: string;
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
  category?: string | null;
  selling_price: number;
  sizes?: string[] | null;
  stock_quantity: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  is_available?: boolean;
  in_stock?: boolean;
}

interface Props {
  products: StorefrontProduct[];
  categories: string[];
  loadError?: boolean;
}

const WA_NUMBER = "201038856486";

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Return image URL as-is — each upload already gets a unique timestamped filename.
 *  We only need to bust cache when an image is replaced (URL changes automatically). */
function bustImageCache(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url;
}

// ── Main Client Component ─────────────────────────────────────────────────────
export default function StorefrontClient({ products: initialProducts, loadError }: Props) {
  const { t, lang, isRTL } = useLanguage();
  const { addItem }        = useCart();
  const { success, info }  = useToast();

  const [products,  setProducts]  = useState<StorefrontProduct[]>(initialProducts);
  const [search,    setSearch]    = useState("");
  const [category,  setCategory]  = useState("all");
  const [sort, setSort] = useState("featured");
  const [maxPrice, setMaxPrice] = useState("");
  const [mounted,   setMounted]   = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // ── Supabase Realtime Subscription ─────────────────────────────────────────
  useEffect(() => {
    if (DEMO_MODE) return;
    // Subscribe to all changes on the products table
    const channel = supabase
      .channel("storefront-products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          setProducts((prev) => {
            switch (eventType) {
              case "INSERT": {
                const inserted = newRecord as StorefrontProduct;
                // Only show if available and in stock
                if (!inserted.is_available || !inserted.in_stock) return prev;
                // Avoid duplicates
                if (prev.some((p) => p.id === inserted.id)) return prev;
                return [inserted, ...prev];
              }

              case "UPDATE": {
                const updated = newRecord as StorefrontProduct;
                // If product is no longer available/in-stock, remove from list
                if (!updated.is_available || !updated.in_stock) {
                  return prev.filter((p) => p.id !== updated.id);
                }
                // Otherwise update in place
                return prev.some(p=>p.id===updated.id) ? prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) : [updated,...prev];
              }

              case "DELETE": {
                const deleted = oldRecord as { id: string };
                return prev.filter((p) => p.id !== deleted.id);
              }

              default:
                return prev;
            }
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);



  const filtered = useMemo(() => {
    let result = products.filter(p => p.is_available && p.in_stock);

    // Category filter
    if (category !== "all") {
      const group = CATEGORY_GROUPS.find(g=>g.key===category);
      result = result.filter((p) => group ? group.subcategories.some(sub=>sub.key===p.category) : p.category === category);
    }

    // Fuzzy search filter
    if (search.trim().length >= 2) {
      const fuse = new Fuse(result, {
        keys: ["name_en", "name_ar", "description", "category"],
        threshold: 0.4,
        minMatchCharLength: 2,
      });
      result = fuse.search(search).map((r) => r.item);
    } else if (search.trim().length > 0) {
      const q = search.toLowerCase().trim();
      result = result.filter(p =>
        p.name_en.toLowerCase().includes(q) ||
        (p.name_ar?.includes(q) ?? false)
      );
    }

    if(maxPrice!=="" && Number.isFinite(Number(maxPrice))) result=result.filter(p=>p.selling_price<=Number(maxPrice));
    if(sort!=="featured")result=[...result].sort((a,b)=>(a.selling_price-b.selling_price)*(sort==="price-asc"?1:-1));
    return result;
  }, [products, search, category, maxPrice, sort]);

  const handleShare = useCallback(async (p: StorefrontProduct) => {
    const url  = `${window.location.origin}/product/${p.id}`;
    const name = lang === "ar" && p.name_ar ? p.name_ar : p.name_en;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await navigator.share({ title: name, url }); return; } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    info(t("storefront.products.linkCopied"));
  }, [lang, t, info]);

  // Skeleton loading
  if (!mounted) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[3/4] skeleton mb-3" />
              <div className="h-3.5 skeleton mb-2 w-3/4 rounded" />
              <div className="h-3.5 skeleton w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"}>
      {/* ── Hero Section ── */}
      <section className="border-b border-brand-border dark:border-brand-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 sm:py-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-brand-muted mb-3">ASO / THE EVERYDAY COLLECTION</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.08] mb-4">{lang === "ar" ? <>أسلوبك.<br/>بمعيار جديد.</> : <>YOUR STYLE.<br/>A NEW STANDARD.</>}</h1>
            <p className="text-sm text-brand-muted max-w-md leading-relaxed">{lang==="ar"?"ملابس وقطع مختارة بتفاصيل مدروسة. اكتشف مجموعات ASO واختر ما يشبهك.":"Considered clothing. Everyday essentials. Discover the ASO collections and make them your own."}</p>
            <a href="#collections" className="inline-flex items-center gap-4 mt-5 px-6 py-3 bg-brand-black text-white dark:bg-offwhite dark:text-brand-black text-xs font-bold">{lang==="ar"?"اكتشف المجموعة":"EXPLORE THE COLLECTION"}<span aria-hidden="true">↗</span></a>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-2 h-64 lg:h-72" aria-label={lang==="ar"?"مختارات ASO":"ASO collection preview"}>
            {['tshirts','dresses','abayas'].map((c,i)=><div key={c} className="h-full overflow-hidden bg-[#eae3d9]"><ProductImage src={`/demo/${c}.png#tile=${i}`} alt={`ASO ${c}`} priority /></div>)}
          </div>
        </div>
      </section>

      {/* ── Search + Filter bar ── */}
      <div id="collections" className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-2 scroll-mt-24">
        <div className={`flex flex-col sm:flex-row gap-4 mb-4 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
          {/* Feature 3: Fuzzy Search */}
          <div className="flex-1">
            <label className="sr-only" htmlFor="product-search">{lang==="ar"?"ابحث عن منتج":"Search products"}</label>
            <input id="product-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={lang==="ar"?"ابحث عن منتج أو فئة…":"Search products or categories…"} className="input-style w-full" />

          </div>
        </div>

        {/* Feature 2: Category filter */}
        <div className="mb-4">
          <CategoryFilter
            activeCategory={category}
            onSelect={(cat) => {
              setCategory(cat);
              setSearch("");
            }}
          />
        </div>

        <div className="flex flex-wrap gap-3 items-end mb-4">
          <label className="text-xs flex flex-col gap-2">{lang==="ar"?"الترتيب":"Sort by"}<select aria-label={lang==="ar"?"الترتيب":"Sort by"} value={sort} onChange={e=>setSort(e.target.value)} className="input-style"><option value="featured">{lang==="ar"?"المختارات":"Featured"}</option><option value="price-asc">{lang==="ar"?"السعر: من الأقل للأعلى":"Price: low to high"}</option><option value="price-desc">{lang==="ar"?"السعر: من الأعلى للأقل":"Price: high to low"}</option></select></label>
          <label className="text-xs flex flex-col gap-2">{lang==="ar"?"أقصى سعر (ج.م)":"Maximum price (EGP)"}<input type="number" min="0" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} className="input-style w-40" /></label>
          {(search||category!=="all"||maxPrice)&&<button className="text-xs underline p-3" onClick={()=>{setSearch("");setCategory("all");setMaxPrice("");}}>{lang==="ar"?"مسح الفلاتر":"Clear filters"}</button>}
        </div>
        {loadError && <div role="alert" className="p-4 border border-red-200 text-sm mb-4">{lang==="ar"?"تعذر تحميل المنتجات. حاول مرة أخرى.":"Products could not be loaded. Please try again."}<button className="underline ms-3" onClick={()=>window.location.reload()}>{lang==="ar"?"إعادة المحاولة":"Retry"}</button></div>}
        {/* Results count */}
        <p className="text-xs text-brand-muted mb-2 tracking-wider">
          {filtered.length} {lang === "ar" ? "منتج" : "products"}
          {category !== "all" && ` — ${getSubcategoryLabel(category,lang)}`}
        </p>
      </div>

      {/* ── Product Grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-8">
        {filtered.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-2xl mb-3">🔍</p>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t("storefront.search.noResults")}</p>
            {search && (
              <button onClick={() => setSearch("")}
                className="mt-4 text-xs text-gray-400 underline hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite">
                {t("storefront.search.clear")}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8 sm:gap-x-6">
            {filtered.map((p, idx) => (
              <div key={`${p.id}-${p.image_url ?? "no-img"}`} className="product-grid-item" style={{ animationDelay: `${Math.min(idx * 40, 320)}ms` }}>
                <ProductCard
                  product={p}
                  lang={lang}
                  isRTL={isRTL}
                  t={t}
                  onShare={handleShare}
                  onAdd={(item) => { addItem(item); success("✓ " + (lang === "ar" && p.name_ar ? p.name_ar : p.name_en) + (lang === "ar" ? " — أضيف للسلة" : " — added to cart")); }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-brand-border dark:border-brand-border/20 bg-white dark:bg-brand-black mt-8">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-black tracking-[0.2em] text-brand-black dark:text-offwhite">ASO CLO.</p>
          <div className="flex gap-6">
            <Link href="/track" className="text-xs text-gray-400 dark:text-gray-500 dark:text-gray-400 hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite dark:hover:text-offwhite transition-colors">
              {t("storefront.footer.track")}
            </Link>
            <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer"
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-green-600 transition-colors">
              WhatsApp
            </a>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-600">{t("storefront.footer.copyright")}</p>
        </div>
      </footer>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({
  product, lang, isRTL, t, onShare, onAdd,
}: {
  product: StorefrontProduct;
  lang: string;
  isRTL: boolean;
  t: (k: string) => string;
  onShare: (p: StorefrontProduct) => void;
  onAdd: (item: import("@/context/CartContext").CartItem) => void;
}) {
  const displayName = lang === "ar" && product.name_ar ? product.name_ar : product.name_en;
  const isLowStock  = product.stock_quantity > 0 && product.stock_quantity < 5;
  const hasSizes    = (product.sizes?.length ?? 0) > 0;
  // Cache-busted image URL — ensures newly uploaded images show immediately
  const imageSrc    = bustImageCache(product.image_url);

  function quickAdd() {
    if (hasSizes) return;
    onAdd({
      productId: product.id,
      partnerId: product.partner_id,
      nameEn:    product.name_en,
      nameAr:    product.name_ar ?? undefined,
      price:     product.selling_price,
      imageUrl:  product.image_url ?? undefined,
      size:      "",
      quantity:  1,
      maxStock: product.stock_quantity,
    });
  }

  return (
    <div className="group flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      {/* Image */}
      <div className="relative overflow-hidden bg-gray-100 dark:bg-brand-gray aspect-[3/4]">
        {/* Link covers the full image area — valid HTML, no nested interactive elements */}
        <Link href={`/product/${product.id}`} className="block absolute inset-0">
          {imageSrc ? (
            <ProductImage src={imageSrc} alt={displayName} className="group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-brand-gray">
              <span className="text-2xl font-black text-gray-300">{displayName.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
        </Link>

        {/* Badges — pointer-events-none so they don't block the Link */}
        <div className={`absolute top-2 ${isRTL ? "right-2" : "left-2"} flex flex-col gap-1 pointer-events-none`}>
          {isLowStock && (
            <span className="bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 tracking-wide">
              {t("storefront.products.onlyLeft").replace("{{n}}", String(product.stock_quantity))}
            </span>
          )}
          {hasSizes && (
            <span className="bg-brand-black dark:bg-offwhite text-white dark:text-brand-black text-[9px] font-bold px-2 py-0.5 tracking-wide">
              {lang==="ar"?"جاهز للشحن":"READY TO SHIP"}
            </span>
          )}
        </div>

        {/* Share Button — sibling of Link, NOT nested inside it (valid HTML) */}
        <button
          onClick={(e) => { e.stopPropagation(); onShare(product); }}
          className={`absolute top-2 ${isRTL ? "left-2" : "right-2"} z-10 w-7 h-7 bg-white dark:bg-brand-gray/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50 dark:hover:bg-brand-gray shadow-sm`}
          title={t("storefront.products.share")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>

        {/* Wishlist Button */}
        <div
          className={`absolute bottom-2 ${isRTL ? "left-2" : "right-2"} z-10`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-brand-gray/90 backdrop-blur w-7 h-7 flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-brand-gray transition-colors">
            <WishlistButton
              product={{
                id:            product.id,
                name_en:       product.name_en,
                name_ar:       product.name_ar,
                selling_price: product.selling_price,
                image_url:     product.image_url,
                category:      product.category,
              }}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="pt-3 flex-1 flex flex-col gap-1.5">
        <Link href={`/product/${product.id}`} className="hover:underline underline-offset-2">
          <h3 className="text-xs font-bold text-brand-black dark:text-offwhite leading-tight line-clamp-2">{displayName}</h3>
        </Link>

        {product.category && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide">{getSubcategoryLabel(product.category,lang as "en"|"ar")}</p>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 justify-between mt-auto pt-1">
          <p className="text-sm font-black text-brand-black dark:text-offwhite font-mono tracking-tight">
            EGP {product.selling_price.toLocaleString("en-EG")}
          </p>

          {hasSizes ? (
            <Link href={`/product/${product.id}`}
              className="text-[10px] font-bold tracking-wide border border-brand-black dark:border-offwhite text-brand-black dark:text-offwhite px-3 py-1.5 hover:bg-brand-black dark:hover:bg-offwhite hover:text-white dark:hover:text-brand-black dark:text-offwhite transition-all">
              {t("storefront.products.selectSize")}
            </Link>
          ) : (
            <button onClick={quickAdd}
              className="text-[10px] font-bold tracking-wide border border-brand-black dark:border-offwhite text-brand-black dark:text-offwhite px-3 py-1.5 hover:bg-brand-black dark:hover:bg-offwhite hover:text-white dark:hover:text-brand-black dark:text-offwhite transition-all">
              {t("storefront.products.addToCart")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

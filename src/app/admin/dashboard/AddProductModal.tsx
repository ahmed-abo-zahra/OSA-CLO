"use client";

import ProductImage from "@/components/ProductImage";
import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProductForModal {
  id: string;
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
  category?: string | null;
  cost_price: number;
  selling_price: number;
  sizes?: string[] | null;
  colors?: string[] | null;
  stock_quantity: number;
  image_url?: string | null;
  in_stock?: boolean;
  is_available?: boolean;
}

interface Props {
  product?: ProductForModal; // if provided → Edit mode
  partnerName: string;
  onSuccess: () => void;
  onClose: () => void;
}

// const CATEGORIES = [
//   "T-Shirts", "Hoodies", "Pants", "Shorts",
//   "Outerwear", "Accessories", "Shoes", "Other",
// ];
const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "Oversized", "One Size"];

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProductModal({ product, partnerName, onSuccess, onClose }: Props) {
  const { t, isRTL, lang } = useLanguage();
  const isEdit = !!product;

  let allowedCategories = [
    "T-Shirts", "Hoodies", "Pants", "Shorts", "Outerwear",
    "Accessories", "Shoes", "Abayas", "Dresses", "Shirts",
    "Skirts", "Suits", "Loungewear", "Lingerie", "Bags",
    "Makeup", "Home Appliances", "Other"
  ];

  if (partnerName === "Safia" || partnerName === "صافيه") {
    allowedCategories = ["Abayas", "Dresses", "T-Shirts", "Pants", "Shirts", "Skirts", "Suits"];
  } else if (partnerName === "Omaima" || partnerName === "Omayma" || partnerName === "اميمه") {
    allowedCategories = ["Shoes", "Loungewear", "Lingerie"];
  } else if (partnerName === "Aisha" || partnerName === "عائشه") {
    allowedCategories = ["Bags", "Accessories"];
  }


  const fileRef      = useRef<HTMLInputElement>(null);
  const extraFileRef  = useRef<HTMLInputElement>(null);
  const [colors,setColors]=useState(product?.colors?.join(", ")??"");
  const [preview, setPreview]             = useState<string | null>(product?.image_url ?? null);
  const [extraPreviews, setExtraPreviews] = useState<{ url: string; file: File }[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);

  // ── Financial formula state ─────────────────────────────────────────────────
  const [form, setForm] = useState({
    name_en:        "",
    name_ar:        "",
    description:    "",
    category:       "",
    cost_price:     "",
    target_profit:  "",
    custom_sizes:   "",
    stock_quantity: "",
  });

  // Pre-fill when editing
  useEffect(() => {
    if (product) {
      setColors(product.colors?.join(", ") ?? "");
      const cost          = product.cost_price ?? 0;
      const selling       = product.selling_price ?? 0;
      const derivedProfit = Math.max(0, selling - cost);

      setForm({
        name_en:        product.name_en ?? "",
        name_ar:        product.name_ar ?? "",
        description:    product.description ?? "",
        category:       product.category ?? "",
        cost_price:     String(cost),
        target_profit:  String(derivedProfit),
        custom_sizes:   "",
        stock_quantity: String(product.stock_quantity ?? 0),
      });

      if (product.sizes?.length) setSelectedSizes(product.sizes);
    }
  }, [product]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSize(size: string) {
    setSelectedSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  function handleExtraFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const newPreviews = files.map((f) => ({ url: URL.createObjectURL(f), file: f }));
    setExtraPreviews((prev) => [...prev, ...newPreviews]);
    // reset input so same file can be re-added
    if (extraFileRef.current) extraFileRef.current.value = "";
  }

  function removeExtraImage(idx: number) {
    setExtraPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Computed selling price ──────────────────────────────────────────────────
  const cost         = parseFloat(form.cost_price) || 0;
  const targetProfit = parseFloat(form.target_profit) || 0;
  const sellingPrice = cost + targetProfit;
  const marginPct    = sellingPrice > 0
    ? ((targetProfit / sellingPrice) * 100).toFixed(1)
    : "0.0";

  // ── Submit via FormData ─────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!form.name_en.trim()) { setError("Product name (EN) is required"); return; }
    if (!form.cost_price || cost <= 0) { setError("Cost price must be greater than 0"); return; }
    if (!form.target_profit || targetProfit < 0) { setError("Target profit is required (can be 0)"); return; }

    setLoading(true);

    try {
      // Merge preset + custom typed sizes
      const customSizes = form.custom_sizes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allSizes = Array.from(new Set([...selectedSizes, ...customSizes]));

      // ── Build FormData — browser auto-sets multipart Content-Type + boundary ──
      const fd = new FormData();
      fd.append("name_en",        form.name_en.trim());
      fd.append("name_ar",        form.name_ar.trim());
      fd.append("description",    form.description.trim());
      fd.append("category",       form.category);
      fd.append("cost_price",     String(cost));
      fd.append("selling_price",  String(sellingPrice)); // auto-calculated
      fd.append("sizes",          allSizes.join(","));
      fd.append("colors", colors);
      fd.append("stock_quantity", form.stock_quantity || "0");

      // Attach primary image
      const imageFile = fileRef.current?.files?.[0];
      if (imageFile) {
        fd.append("image", imageFile);
        console.log("[ProductModal] Attaching primary image:", imageFile.name);
      }

      // Attach extra images
      extraPreviews.forEach(({ file }) => {
        fd.append("extra_images", file);
      });
      if (extraPreviews.length > 0) {
        console.log(`[ProductModal] Attaching ${extraPreviews.length} extra image(s)`);
      } else {
        console.log("[ProductModal] No extra images selected");
      }

      const url    = isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products";
      const method = isEdit ? "PUT" : "POST";

      console.log(`[ProductModal] Sending ${method} to ${url} via FormData`);

      // ⚠️ CRITICAL: Do NOT set Content-Type header manually.
      // The browser must set it automatically so it includes the multipart boundary.
      const res = await fetch(url, {
        method,
        body: fd,
        // No headers object — browser handles Content-Type: multipart/form-data; boundary=...
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[ProductModal] Server responded with error:", res.status, data);
        setError(data.error || "Failed to save product. Check the terminal for details.");
        setLoading(false);
        return;
      }

      console.log("[ProductModal] ✅ Product saved:", data.product?.id);
      onSuccess();

    } catch (err) {
      console.error("[ProductModal] ❌ Network/fetch error:", err);
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        dir={isRTL ? "rtl" : "ltr"}
        className="bg-white dark:bg-gray-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold tracking-[0.08em] uppercase text-[#1A1A1A] dark:text-gray-100">
              {isEdit ? t("admin.addProduct.editTitle") : t("admin.addProduct.title")}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? t("admin.addProduct.editSubtitle") : t("admin.addProduct.subtitle")}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500
                       hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">

          {/* Image Upload — Primary */}
          <div className="flex flex-col gap-2">
            <label className="label-style">{t("admin.addProduct.image")} — Primary</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="relative border-2 border-dashed border-gray-200 dark:border-gray-700 cursor-pointer
                         hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-gray-50 dark:bg-gray-800
                         flex items-center justify-center h-36 overflow-hidden group"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <ProductImage src={preview} alt="Preview" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-xs font-medium">{t("admin.addProduct.imageHint")}</span>
                  <span className="text-[10px] text-gray-300">PNG, JPG, WEBP — max 5MB</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFileChange} />
          </div>

          <label className="label-style">{lang==="ar"?"الألوان (افصل بفاصلة)":"Colors (comma separated)"}<input className="input-style mt-2" value={colors} onChange={e=>setColors(e.target.value)} /></label>
          {/* Extra Images (Gallery) */}
          <div className="flex flex-col gap-2">
            <label className="label-style">Extra Images — Gallery (optional)</label>
            <div className="flex flex-wrap gap-2">
              {extraPreviews.map((ep, i) => (
                <div key={i} className="relative w-20 h-20 border border-gray-200 overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ep.url} alt={`extra-${i}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removeExtraImage(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-50 dark:bg-red-950/400 text-white text-[10px] font-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    ✕
                  </button>
                </div>
              ))}
              {/* Add more button */}
              <button type="button" onClick={() => extraFileRef.current?.click()}
                className="w-20 h-20 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-300 hover:text-gray-500 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <input ref={extraFileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleExtraFiles} />
            {extraPreviews.length > 0 && (
              <p className="text-[10px] text-gray-400">{extraPreviews.length} extra image(s) selected — hover to remove</p>
            )}
          </div>

          {/* Names */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label={t("admin.addProduct.nameEn")}
              value={form.name_en}
              onChange={(v) => set("name_en", v)}
              placeholder={t("admin.addProduct.namePlaceholderEn")}
              required
            />
            <FormField
              label={t("admin.addProduct.nameAr")}
              value={form.name_ar}
              onChange={(v) => set("name_ar", v)}
              placeholder={t("admin.addProduct.namePlaceholderAr")}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="label-style">{t("admin.addProduct.description")}</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={t("admin.addProduct.descPlaceholder")}
              rows={2}
              className="input-style resize-none"
            />
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="label-style">{t("admin.addProduct.category")}</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="input-style"
            >
              <option value="">{t("admin.addProduct.categoryPlaceholder")}</option>
              {allowedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* ── Financial Formula ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="label-style">{t("admin.addProduct.costPrice")}</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => set("cost_price", e.target.value)}
                placeholder="0.00"
                className="input-style"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="label-style">{t("admin.addProduct.targetProfit")}</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.target_profit}
                onChange={(e) => set("target_profit", e.target.value)}
                placeholder="0.00"
                className="input-style"
              />
            </div>
          </div>

          {/* Calculated Selling Price Banner */}
          {(cost > 0 || targetProfit > 0) && (
            <div className="flex items-center justify-between bg-[#1A1A1A] text-white px-4 py-3">
              <div>
                <p className="text-[10px] font-bold tracking-[0.12em] uppercase opacity-50">
                  {t("admin.addProduct.sellingPrice")}
                </p>
                <p className="text-lg font-bold tracking-[-0.02em] mt-0.5">
                  EGP {sellingPrice.toLocaleString("en-EG")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] opacity-50 uppercase tracking-wide">
                  {t("admin.addProduct.profitPerUnit")}
                </p>
                <p className="text-sm font-semibold text-green-400 mt-0.5">
                  +EGP {targetProfit.toLocaleString("en-EG")}
                  <span className="text-[10px] opacity-70 ml-1">
                    ({marginPct}% {t("admin.addProduct.marginLabel")})
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Sizes */}
          <div className="flex flex-col gap-2">
            <label className="label-style">{t("admin.addProduct.sizes")}</label>
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleSize(size)}
                  className={`px-3 py-1.5 text-[11px] font-semibold tracking-wide border transition-all duration-150
                    ${selectedSizes.includes(size)
                      ? "bg-[#1A1A1A] text-white border-[#1A1A1A] dark:bg-offwhite dark:text-brand-black dark:border-offwhite"
                      : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500"
                    }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.custom_sizes}
              onChange={(e) => set("custom_sizes", e.target.value)}
              placeholder={t("admin.addProduct.sizesHint")}
              className="input-style text-xs"
            />
          </div>

          {/* Stock */}
          <FormField
            label={t("admin.addProduct.stockQty")}
            value={form.stock_quantity}
            onChange={(v) => set("stock_quantity", v)}
            type="number"
            placeholder="0"
          />

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3">
              <p className="text-red-600 dark:text-red-400 text-xs font-medium">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs
                         font-semibold tracking-widest uppercase hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-[#1A1A1A] dark:bg-offwhite text-white dark:text-brand-black text-xs font-bold
                         tracking-widest uppercase hover:bg-[#333] dark:hover:bg-gray-200 disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? t("admin.addProduct.submitting")
                : isEdit
                ? t("admin.addProduct.submitEdit")
                : t("admin.addProduct.submitAdd")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function FormField({
  label, value, onChange, placeholder, required, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-style">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
        className="input-style"
      />
    </div>
  );
}

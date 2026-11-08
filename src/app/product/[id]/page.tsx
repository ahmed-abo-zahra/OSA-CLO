import LocalizedProductName from "@/components/LocalizedProductName";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ProductImage from "@/components/ProductImage";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ProductDetailClient, { type PDPProduct } from "./ProductDetailClient";

// ── OpenGraph SEO ─────────────────────────────────────────────────────────────
export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const { data } = await supabaseAdmin
    .from("products")
    .select("name_en, name_ar, description, selling_price, image_url, category")
    .eq("id", params.id)
    .single();

  if (!data) return { title: "Product Not Found — ASO CLO" };

  const title = `${data.name_en} — ASO CLO`;
  const desc  = data.description ?? `${data.name_en} | EGP ${data.selling_price} | ${data.category ?? "Streetwear"}`;

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: `EGP ${data.selling_price} — ${data.category ?? "ASO CLO Streetwear"}`,
      images: data.image_url ? [{ url: data.image_url, width: 800, height: 1067, alt: data.name_en }] : [],
      siteName: "ASO CLO",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: data.image_url ? [data.image_url] : [],
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data } = await supabaseAdmin
    .from("products")
    .select("id, name_en, name_ar, description, category, selling_price, sizes, stock_quantity, image_url, image_urls, colors, description_ar")
    .eq("id", params.id)
    .eq("is_available", true)
    .single();

  if (!data) notFound();

  // ── Upsell: fetch 4 related products from same category ──────────────────
  const { data: relatedRaw } = await supabaseAdmin
    .from("products")
    .select("id, name_en, name_ar, selling_price, image_url, category, stock_quantity")
    .eq("is_available", true)
    .eq("in_stock", true)
    .eq("category", data.category ?? "")
    .neq("id", data.id)
    .limit(4);

  // Fallback: if not enough from same category, fetch latest products
  let related = relatedRaw ?? [];
  if (related.length < 2) {
    const { data: fallback } = await supabaseAdmin
      .from("products")
      .select("id, name_en, name_ar, selling_price, image_url, category, stock_quantity")
      .eq("is_available", true)
      .eq("in_stock", true)
      .neq("id", data.id)
      .order("created_at", { ascending: false })
      .limit(4);
    related = fallback ?? [];
  }

  return (
    <div>
      <ProductDetailClient product={data as PDPProduct} />

      {/* ── Upsell Section ── */}
      {related.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-gray-100">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 dark:text-gray-400 mb-6 text-center">
            قد يعجبك أيضاً — You May Also Like
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((p) => (
              <Link key={p.id} href={`/product/${p.id}`}
                className="group bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 hover:border-gray-400 dark:hover:border-brand-border/60 hover:shadow-md transition-all overflow-hidden">
                <div className="aspect-[3/4] overflow-hidden bg-gray-100 dark:bg-brand-gray">
                  {p.image_url
                    ? <ProductImage src={p.image_url} alt={p.name_en} />
                    : <div className="w-full h-full flex items-center justify-center text-gray-200 text-2xl font-black">
                        {p.name_en.slice(0, 2).toUpperCase()}
                      </div>
                  }
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold text-brand-black dark:text-offwhite truncate leading-tight"><LocalizedProductName en={p.name_en} ar={p.name_ar} /></p>
                  <p className="text-[11px] font-mono font-bold text-brand-black dark:text-offwhite mt-1">
                    EGP {p.selling_price.toLocaleString("en-EG")}
                  </p>
                  {(p.stock_quantity ?? 0) < 5 && (p.stock_quantity ?? 0) > 0 && (
                    <span className="text-[9px] font-bold text-red-500 mt-0.5 block">
                      Only {p.stock_quantity} left!
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

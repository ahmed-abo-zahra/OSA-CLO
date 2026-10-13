import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase-admin";
import StorefrontClient from "@/components/storefront/StorefrontClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ASO CLO — The New Standard in Streetwear",
  description: "Minimalist streetwear crafted for those who define the culture — not follow it. Shop the latest drop from ASO CLO.",
  openGraph: {
    title: "ASO CLO — The New Standard",
    description: "Minimalist Egyptian streetwear. Shop the latest drop.",
    siteName: "ASO CLO",
    type: "website",
  },
};

export default async function StorefrontPage() {
  const { data: products, error } = await supabaseAdmin
    .from("products")
    .select("id, partner_id, name_en, name_ar, description, category, selling_price, sizes, stock_quantity, image_url, image_urls, colors, description_ar, is_available, in_stock")
    .eq("is_available", true)
    .eq("in_stock", true)
    .order("created_at", { ascending: false });

  const categories = Array.from(
    new Set(
      (products ?? [])
        .map((p) => p.category)
        .filter((c): c is string => Boolean(c))
    )
  );

  return (
    <StorefrontClient products={products ?? []} categories={categories} loadError={Boolean(error)} />
  );
}

import type { Metadata } from "next";
import { getPublicCatalogPage, type PublicCatalogProduct } from "@/lib/catalog-cache";
import StorefrontClient from "@/components/storefront/StorefrontClient";

export const revalidate = 30;

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
  let products: PublicCatalogProduct[] = [];
  let loadError = false;
  try {
    products = (await getPublicCatalogPage(0)).products;
  } catch {
    loadError = true;
  }

  return (
    <StorefrontClient products={products} loadError={loadError} />
  );
}

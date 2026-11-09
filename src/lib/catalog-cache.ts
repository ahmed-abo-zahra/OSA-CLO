import 'server-only';
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { DEMO_MODE } from '@/lib/demo-mode';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const PUBLIC_CATALOG_TAG = 'public-catalog';
export const PUBLIC_CATALOG_PAGE_SIZE = 100;
const PRODUCT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PUBLIC_PRODUCT_FIELDS = [
  'id',
  'name_en',
  'name_ar',
  'description',
  'description_ar',
  'category',
  'selling_price',
  'sizes',
  'colors',
  'in_stock',
  'is_available',
  'image_url',
  'image_urls',
  'created_at',
  'updated_at',
].join(', ');

export type PublicCatalogProduct = {
  id: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  category: string | null;
  selling_price: number;
  sizes: string[] | null;
  colors: string[] | null;
  in_stock: boolean;
  is_available: boolean;
  image_url: string | null;
  image_urls: string[] | null;
  created_at: string;
  updated_at: string;
};

export type PublicCatalogPage = {
  products: PublicCatalogProduct[];
  hasMore: boolean;
  nextOffset: number | null;
};

async function queryPublicCatalogPage(offset: number): Promise<PublicCatalogPage> {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq('is_available', true)
    .eq('in_stock', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + PUBLIC_CATALOG_PAGE_SIZE - 1);

  if (error) throw new Error(error.code || 'PUBLIC_CATALOG_QUERY_FAILED');

  const products = (data ?? []) as unknown as PublicCatalogProduct[];
  const hasMore = products.length === PUBLIC_CATALOG_PAGE_SIZE;
  return {
    products,
    hasMore,
    nextOffset: hasMore ? offset + products.length : null,
  };
}

const queryCachedCatalogPage = unstable_cache(
  queryPublicCatalogPage,
  ['aso-public-catalog-v1'],
  { revalidate: 30, tags: [PUBLIC_CATALOG_TAG] },
);

export function getPublicCatalogPage(offset: number): Promise<PublicCatalogPage> {
  return DEMO_MODE ? queryPublicCatalogPage(offset) : queryCachedCatalogPage(offset);
}

export async function getPublicProduct(id: string) {
  if (!PRODUCT_UUID_PATTERN.test(id)) return null;

  const query = async (productId: string) => {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select(PUBLIC_PRODUCT_FIELDS)
      .eq('id', productId)
      .eq('is_available', true)
      .maybeSingle();
    if (error) throw new Error(error.code || 'PUBLIC_PRODUCT_QUERY_FAILED');
    return (data ?? null) as PublicCatalogProduct | null;
  };

  if (DEMO_MODE) return query(id);
  const cachedQuery = unstable_cache(query, ['aso-public-product-v1'], {
    revalidate: 30,
    tags: [PUBLIC_CATALOG_TAG],
  });
  return cachedQuery(id);
}

export function invalidatePublicCatalog(productIds: string[] = []): void {
  try {
    revalidateTag(PUBLIC_CATALOG_TAG, { expire: 0 });
    revalidatePath('/');
    revalidatePath('/api/products');
    for (const id of new Set(productIds)) revalidatePath(`/product/${id}`);
  } catch {
    // A post-commit cache failure must not turn a successful order into an HTTP error.
    console.error('[catalog-cache] invalidation failed; short TTL remains the fallback');
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const PAGE_SIZE = 500;
const MAX_OFFSET = 100_000;

const PUBLIC_PRODUCT_FIELDS = [
  'id',
  'partner_id',
  'name_en',
  'name_ar',
  'description',
  'description_ar',
  'category',
  'selling_price',
  'sizes',
  'colors',
  'stock_quantity',
  'in_stock',
  'is_available',
  'image_url',
  'image_urls',
  'created_at',
  'updated_at',
].join(', ');

export async function GET(request: NextRequest) {
  const rawOffset = request.nextUrl.searchParams.get('offset');
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return NextResponse.json({ error: 'Invalid catalog offset.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .select(PUBLIC_PRODUCT_FIELDS)
    .eq('is_available', true)
    .eq('in_stock', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) {
    console.error('[products] public catalog lookup failed:', { code: error.code });
    return NextResponse.json(
      { error: 'Products are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const products = data ?? [];
  const hasMore = products.length === PAGE_SIZE;
  return NextResponse.json(
    { products, hasMore, nextOffset: hasMore ? offset + products.length : null },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
  );
}

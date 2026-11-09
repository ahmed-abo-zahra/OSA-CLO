import { NextResponse, type NextRequest } from 'next/server';
import { getPublicCatalogPage, PUBLIC_CATALOG_PAGE_SIZE } from '@/lib/catalog-cache';

const MAX_OFFSET = 10_000;

export async function GET(request: NextRequest) {
  const rawOffset = request.nextUrl.searchParams.get('offset');
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET || offset % PUBLIC_CATALOG_PAGE_SIZE !== 0) {
    return NextResponse.json({ error: 'Invalid catalog offset.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const page = await getPublicCatalogPage(offset);
    return NextResponse.json(page, {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('[products] public catalog lookup failed:', {
      code: error instanceof Error ? error.message : 'UNKNOWN',
    });
    return NextResponse.json(
      { error: 'Products are temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}

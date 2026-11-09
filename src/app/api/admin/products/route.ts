import { NextResponse, type NextRequest } from 'next/server';
import { invalidatePublicCatalog } from '@/lib/catalog-cache';
import { ALL_SUBCATEGORY_KEYS } from '@/lib/categories';
import { getPartnerCategoryKeys, getPartnerDbId } from '@/lib/partners';
import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { hasSameOrigin, readFormDataBody } from '@/lib/request-security';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { uploadProductImage } from '@/lib/product-images';

const MAX_MULTIPART_BODY_BYTES = 4_200_000;

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function parseList(value: string, maxItems = 20): string[] | null {
  const items = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  if (items.length > maxItems || items.some((item) => item.length > 40)) return null;
  return items;
}

export async function POST(request: NextRequest) {
  const session = decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  const bodyResult = await readFormDataBody(request, MAX_MULTIPART_BODY_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.status === 413 ? 'The total image upload must be 4 MB or smaller.' : 'Expected a valid multipart form submission.' }, { status: bodyResult.status });
  }
  const formData = bodyResult.value;

  const nameEn = getFormString(formData, 'name_en');
  const nameAr = getFormString(formData, 'name_ar');
  const description = getFormString(formData, 'description');
  const descriptionAr = getFormString(formData, 'description_ar');
  const category = getFormString(formData, 'category');
  const costPrice = Number(getFormString(formData, 'cost_price'));
  const sellingPrice = Number(getFormString(formData, 'selling_price'));
  const stockQuantity = Number(getFormString(formData, 'stock_quantity'));
  const sizes = parseList(getFormString(formData, 'sizes'));
  const colors = parseList(getFormString(formData, 'colors'));
  const mainValue = formData.get('image');
  const mainImage = mainValue instanceof File && mainValue.size > 0 ? mainValue : null;
  const extraImages = formData.getAll('extra_images').filter((value): value is File => value instanceof File && value.size > 0);
  const totalImageBytes = (mainImage?.size ?? 0) + extraImages.reduce((sum, image) => sum + image.size, 0);

  if (nameEn.length < 1 || nameEn.length > 160 || nameAr.length > 160) {
    return NextResponse.json({ error: 'Product names must be within 160 characters.' }, { status: 400 });
  }
  if (description.length > 2000 || descriptionAr.length > 2000) {
    return NextResponse.json({ error: 'Product descriptions must be within 2,000 characters.' }, { status: 400 });
  }
  if (!ALL_SUBCATEGORY_KEYS.includes(category)) {
    return NextResponse.json({ error: 'Choose a supported product category.' }, { status: 400 });
  }
  if (!getPartnerCategoryKeys(session.partnerId).includes(category)) {
    return NextResponse.json({ error: 'This partner cannot manage products in that category.' }, { status: 403 });
  }
  if (!Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return NextResponse.json({ error: 'Enter valid cost and selling prices.' }, { status: 400 });
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000) {
    return NextResponse.json({ error: 'Enter a valid stock quantity.' }, { status: 400 });
  }
  if (!sizes || !colors || extraImages.length > 5) {
    return NextResponse.json({ error: 'Use up to 20 sizes/colors and up to 5 extra images.' }, { status: 400 });
  }
  if (totalImageBytes > MAX_MULTIPART_BODY_BYTES) {
    return NextResponse.json({ error: 'The total image upload must be 4 MB or smaller.' }, { status: 413 });
  }

  try {
    const partnerId = getPartnerDbId(session.partnerId);
    const imageUrl = mainImage ? await uploadProductImage(mainImage, session.partnerId) : null;
    const imageUrls: string[] = [];
    for (const image of extraImages) imageUrls.push(await uploadProductImage(image, session.partnerId));

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        partner_id: partnerId,
        name_en: nameEn,
        name_ar: nameAr || null,
        description: description || null,
        description_ar: descriptionAr || null,
        category,
        cost_price: costPrice,
        selling_price: sellingPrice,
        sizes,
        colors,
        stock_quantity: stockQuantity,
        in_stock: stockQuantity > 0,
        is_available: true,
        image_url: imageUrl,
        image_urls: imageUrls,
      })
      .select()
      .single();

    if (error) {
      console.error('[admin/products] create failed:', { code: error.code });
      return NextResponse.json({ error: 'Could not create the product. Check the details and try again.' }, { status: 400 });
    }

    invalidatePublicCatalog([data.id]);
    return NextResponse.json({ success: true, product: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('image') || message.includes('Image') || message.includes('JPEG') || message.includes('WebP')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[admin/products] create failed unexpectedly');
    return NextResponse.json({ error: 'Could not create the product.' }, { status: 500 });
  }
}

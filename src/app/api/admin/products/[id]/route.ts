import { NextResponse, type NextRequest } from 'next/server';
import { ALL_SUBCATEGORY_KEYS } from '@/lib/categories';
import { getPartnerCategoryKeys, getPartnerDbId } from '@/lib/partners';
import { COOKIE_NAME, decodeSessionValue } from '@/lib/session';
import { hasSameOrigin, readFormDataBody, readJsonBody } from '@/lib/request-security';
import { invalidatePublicCatalog } from '@/lib/catalog-cache';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { uploadProductImage } from '@/lib/product-images';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MULTIPART_BODY_BYTES = 4_200_000;
type RouteContext = { params: Promise<{ id: string }> };

function getSession(request: NextRequest) {
  return decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
}

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function parseList(value: string, maxItems = 20): string[] | null {
  const items = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  if (items.length > maxItems || items.some((item) => item.length > 40)) return null;
  return items;
}

async function getOwnedProduct(id: string, partnerId: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data || data.partner_id !== partnerId) return { data: null, error: null };
  return { data, error: null };
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 });

  const partnerId = getPartnerDbId(session.partnerId);
  const { data: existing, error: lookupError } = await getOwnedProduct(id, partnerId);
  if (lookupError) {
    console.error('[admin/products] update lookup failed:', { code: lookupError.code });
    return NextResponse.json({ error: 'Could not load the product.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

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
  const sizes = parseList(formData.has('sizes') ? getFormString(formData, 'sizes') : (existing.sizes ?? []).join(','));
  const colors = parseList(formData.has('colors') ? getFormString(formData, 'colors') : (existing.colors ?? []).join(','));
  const imageValue = formData.get('image');
  const imageFile = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  const extraImages = formData.getAll('extra_images').filter((value): value is File => value instanceof File && value.size > 0);
  const totalImageBytes = (imageFile?.size ?? 0) + extraImages.reduce((sum, image) => sum + image.size, 0);

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
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000 || !sizes || !colors) {
    return NextResponse.json({ error: 'Enter valid stock, size, and color values.' }, { status: 400 });
  }
  if (extraImages.length > 5) return NextResponse.json({ error: 'Use up to five extra images.' }, { status: 400 });
  if (totalImageBytes > MAX_MULTIPART_BODY_BYTES) {
    return NextResponse.json({ error: 'The total image upload must be 4 MB or smaller.' }, { status: 413 });
  }

  try {
    const imageUrl = imageFile ? await uploadProductImage(imageFile, session.partnerId) : existing.image_url;
    const imageUrls: string[] = [...(existing.image_urls ?? [])];
    for (const image of extraImages) imageUrls.push(await uploadProductImage(image, session.partnerId));
    const updates: Record<string, unknown> = {
      name_en: nameEn,
      name_ar: nameAr || null,
      description: description || null,
      category,
      cost_price: costPrice,
      selling_price: sellingPrice,
      sizes,
      colors,
      stock_quantity: stockQuantity,
      in_stock: stockQuantity > 0,
      image_url: imageUrl,
      image_urls: imageUrls,
    };
    if (formData.has('description_ar')) updates.description_ar = descriptionAr || null;

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .eq('partner_id', partnerId)
      .select()
      .single();

    if (error) {
      console.error('[admin/products] update failed:', { code: error.code });
      return NextResponse.json({ error: 'Could not update the product. Check the details and try again.' }, { status: 400 });
    }

    invalidatePublicCatalog([id]);
    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('image') || message.includes('Image') || message.includes('JPEG') || message.includes('WebP')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('[admin/products] update failed unexpectedly');
    return NextResponse.json({ error: 'Could not update the product.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 });

  const partnerId = getPartnerDbId(session.partnerId);
  const { data: product, error: lookupError } = await getOwnedProduct(id, partnerId);
  if (lookupError) {
    console.error('[admin/products] delete lookup failed:', { code: lookupError.code });
    return NextResponse.json({ error: 'Could not load the product.' }, { status: 500 });
  }
  if (!product) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('products')
    .delete()
    .eq('id', id)
    .eq('partner_id', partnerId);
  if (error) {
    console.error('[admin/products] delete failed:', { code: error.code });
    return NextResponse.json({ error: 'Could not delete the product.' }, { status: 500 });
  }

  invalidatePublicCatalog([id]);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 });

  try {
    const bodyResult = await readJsonBody(request, 4096);
    if (!bodyResult.ok) return NextResponse.json({ error: bodyResult.status === 413 ? 'Product update is too large.' : 'Invalid JSON request.' }, { status: bodyResult.status });
    const body = bodyResult.value;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid product update.' }, { status: 400 });
    }
    const values = body as { field?: unknown; value?: unknown };
    if ((values.field !== 'in_stock' && values.field !== 'is_available') || typeof values.value !== 'boolean') {
      return NextResponse.json({ error: 'Invalid product update.' }, { status: 400 });
    }

    const partnerId = getPartnerDbId(session.partnerId);
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('products')
      .select('id, partner_id, stock_quantity')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) {
      console.error('[admin/products] toggle lookup failed:', { code: lookupError.code });
      return NextResponse.json({ error: 'Could not load the product.' }, { status: 500 });
    }
    if (!existing || existing.partner_id !== partnerId) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    if (values.field === 'in_stock' && values.value && existing.stock_quantity < 1) {
      return NextResponse.json({ error: 'Add stock before marking the product in stock.' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ [values.field]: values.value })
      .eq('id', id)
      .eq('partner_id', partnerId)
      .select()
      .single();
    if (error) {
      console.error('[admin/products] toggle update failed:', { code: error.code });
      return NextResponse.json({ error: 'Could not update the product.' }, { status: 500 });
    }

    invalidatePublicCatalog([id]);
    return NextResponse.json({ success: true, product: data });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 });
    console.error('[admin/products] toggle failed unexpectedly');
    return NextResponse.json({ error: 'Could not update the product.' }, { status: 500 });
  }
}

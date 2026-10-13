import { DEMO_MODE } from "@/lib/demo-mode";
import { saveDemoImage } from "@/lib/demo-upload";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decodeSessionValue, COOKIE_NAME } from "@/lib/session";
import { getPartnerDbId } from "@/lib/partners";

const LOG = (tag: string, msg: string, data?: unknown) =>
  console.log(`[${tag} /api/admin/products/[id]] ${msg}`, data ?? "");

function getSession(request: NextRequest) {
  return decodeSessionValue(request.cookies.get(COOKIE_NAME)?.value);
}

// ── Helper: upload image buffer to Supabase Storage ──────────────────────────
async function uploadToStorage(
  file: File,
  partnerId: string
): Promise<string | null> {
  if (DEMO_MODE) return saveDemoImage(file);
  try {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const fileName = `${partnerId}/${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[PUT /api/admin/products/[id]] ❌ Storage upload error:", uploadError.message);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("product-images")
      .getPublicUrl(uploadData.path);

    return publicUrl;
  } catch (imgErr) {
    console.error("[PUT /api/admin/products/[id]] ❌ Unexpected image error:", imgErr);
    return null;
  }
}

// ── PUT /api/admin/products/[id] — Update a product ─────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  LOG("PUT", `Product ID: ${params.id}, Partner: ${session.partnerId}`);

  try {
    // Parse FormData (same as POST — supports file + text)
    const formData = await request.formData();

    const name_en       = (formData.get("name_en")       as string | null)?.trim() ?? "";
    const name_ar       = (formData.get("name_ar")       as string | null)?.trim() ?? "";
    const description   = (formData.get("description")   as string | null)?.trim() ?? "";
    const category      = (formData.get("category")      as string | null)?.trim() ?? "";
    const cost_price    = (formData.get("cost_price")    as string | null) ?? "";
    const selling_price = (formData.get("selling_price") as string | null) ?? "";
    const sizes_raw     = (formData.get("sizes")         as string | null) ?? "";
    const stock_qty     = (formData.get("stock_quantity") as string | null) ?? "0";
    const imageFile     = formData.get("image") as File | null;

    LOG("PUT", "Fields:", { name_en, cost_price, selling_price, has_image: !!imageFile && imageFile.size > 0 });

    if (!name_en) {
      return NextResponse.json({ error: "الاسم بالإنجليزية مطلوب" }, { status: 400 });
    }

    const costNum    = parseFloat(cost_price);
    const sellingNum = parseFloat(selling_price);

    if (!Number.isFinite(costNum) || !Number.isFinite(sellingNum) || costNum < 0 || sellingNum <= 0 || !Number.isInteger(Number(stock_qty)) || Number(stock_qty)<0) {
      return NextResponse.json({ error: "أسعار غير صالحة" }, { status: 400 });
    }

    // Verify ownership before update
    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id, partner_id, image_url")
      .eq("id", params.id)
      .single();

    const dbPartnerId = getPartnerDbId(session.partnerId);

    if (!existing || existing.partner_id !== dbPartnerId) {
      LOG("PUT", "❌ Forbidden — wrong partner");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Handle image: upload new one if provided, keep existing otherwise
    let image_url: string | null = existing.image_url ?? null;
    if (imageFile && imageFile.size > 0) {
      const newUrl = await uploadToStorage(imageFile, session.partnerId);
      if (newUrl) image_url = newUrl;
    }

    const normalizedSizes = sizes_raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data, error: dbError } = await supabaseAdmin
      .from("products")
      .update({
        name_en:       name_en,
        name_ar:       name_ar       || null,
        description:   description   || null,
        category:      category      || null,
        cost_price:    costNum,
        selling_price: sellingNum,
        sizes:         normalizedSizes,
        ...(formData.has("colors") ? {colors:String(formData.get("colors")??"").split(",").map(c=>c.trim()).filter(Boolean)} : {}),
        stock_quantity: Number(stock_qty),
        in_stock: Number(stock_qty)>0,
        image_url,
      })
      .eq("id", params.id)
      .eq("partner_id", dbPartnerId)
      .select()
      .single();

    if (dbError) {
      console.error("[PUT /api/admin/products/[id]] ❌ DB update error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    LOG("PUT", "✅ Product updated:", data.id);
    revalidatePath("/");
    revalidatePath(`/product/${params.id}`);
    revalidatePath(`/product/${params.id}`);
    return NextResponse.json({ success: true, product: data });

  } catch (err) {
    console.error("[PUT /api/admin/products/[id]] ❌ Unexpected error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// ── DELETE /api/admin/products/[id] — Delete a product ──────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  LOG("DELETE", `Product: ${params.id}`);

  try {
    const dbPartnerId = getPartnerDbId(session.partnerId);
    const { data: owned } = await supabaseAdmin.from("products").select("id,partner_id").eq("id", params.id).single();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (owned.partner_id !== dbPartnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await supabaseAdmin
      .from("products")
      .delete()
      .eq("id", params.id)
      .eq("partner_id", dbPartnerId);

    if (error) {
      console.error("[DELETE /api/admin/products/[id]] ❌ DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    LOG("DELETE", "✅ Product deleted");
    revalidatePath("/");
    revalidatePath(`/product/${params.id}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/admin/products/[id]] ❌ Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PATCH /api/admin/products/[id] — Toggle in_stock / is_available ─────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { field, value } = body as { field: "in_stock" | "is_available"; value: boolean };

    LOG("PATCH", `Field: ${field} = ${value}`);

    if (!["in_stock", "is_available"].includes(field) || typeof value !== "boolean") {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 });
    }

    const dbPartnerId = getPartnerDbId(session.partnerId);
    const { data: owned } = await supabaseAdmin.from("products").select("id,partner_id").eq("id", params.id).single();
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (owned.partner_id !== dbPartnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error: dbError } = await supabaseAdmin
      .from("products")
      .update({ [field]: value })
      .eq("id", params.id)
      .eq("partner_id", dbPartnerId)
      .select()
      .single();

    if (dbError) {
      console.error("[PATCH /api/admin/products/[id]] ❌ DB error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    LOG("PATCH", "✅ Updated:", { [field]: value });
    revalidatePath("/");
    revalidatePath(`/product/${params.id}`);
    return NextResponse.json({ success: true, product: data });

  } catch (err) {
    console.error("[PATCH /api/admin/products/[id]] ❌ Unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

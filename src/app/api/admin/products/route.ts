import { DEMO_MODE } from "@/lib/demo-mode";
import { saveDemoImage } from "@/lib/demo-upload";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decodeSessionValue, COOKIE_NAME } from "@/lib/session";
import { getPartnerDbId } from "@/lib/partners";

const LOG = (msg: string, data?: unknown) =>
  console.log(`[POST /api/admin/products] ${msg}`, data ?? "");

function getSessionFromRequest(request: NextRequest) {
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

    LOG("Converting file to buffer...", { name: file.name, size: file.size, type: file.type });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    LOG("Uploading to Supabase Storage bucket 'product-images'...", { fileName });

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[POST /api/admin/products] ❌ Storage upload error:", {
        message: uploadError.message,
        hint: "Does the 'product-images' bucket exist in Supabase? Check Storage → Buckets.",
      });
      return null; // Continue without image — don't block product creation
    }

    LOG("✅ Upload success:", uploadData.path);

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(uploadData.path);

    LOG("✅ Public URL:", publicUrl);
    return publicUrl;
  } catch (imgErr) {
    console.error("[POST /api/admin/products] ❌ Unexpected image error:", imgErr);
    return null;
  }
}

// ── POST /api/admin/products — Create a product ───────────────────────────────
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    LOG("❌ Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  LOG("✅ Session valid:", { partnerId: session.partnerId });

  try {
    // ── Parse FormData (handles text fields + file upload) ────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
      LOG("✅ FormData parsed successfully");
    } catch (fErr) {
      console.error("[POST /api/admin/products] ❌ Failed to parse FormData:", fErr);
      return NextResponse.json(
        { error: "Invalid request format — expected multipart/form-data" },
        { status: 400 }
      );
    }

    // ── Extract fields ────────────────────────────────────────────────────────
    const name_en       = (formData.get("name_en")       as string | null)?.trim() ?? "";
    const name_ar       = (formData.get("name_ar")       as string | null)?.trim() ?? "";
    const description   = (formData.get("description")   as string | null)?.trim() ?? "";
    const category      = (formData.get("category")      as string | null)?.trim() ?? "";
    const cost_price    = (formData.get("cost_price")    as string | null) ?? "";
    const selling_price = (formData.get("selling_price") as string | null) ?? "";
    const sizes_raw     = (formData.get("sizes")         as string | null) ?? "";
    const stock_qty     = (formData.get("stock_quantity") as string | null) ?? "0";
    const imageFile     = formData.get("image") as File | null;
    const extraImages    = formData.getAll("extra_images") as File[];

    LOG("📦 Fields received:", {
      name_en,
      name_ar,
      category,
      cost_price,
      selling_price,
      sizes_raw,
      stock_qty,
      has_image: !!imageFile && imageFile.size > 0,
      image_name: imageFile?.name,
      image_size: imageFile?.size,
      image_type: imageFile?.type,
    });

    // ── Validation ────────────────────────────────────────────────────────────
    if (!name_en) {
      LOG("❌ Validation failed: name_en missing");
      return NextResponse.json({ error: "الاسم بالإنجليزية مطلوب" }, { status: 400 });
    }

    const costNum    = parseFloat(cost_price);
    const sellingNum = parseFloat(selling_price);

    if (!Number.isFinite(costNum) || costNum < 0) {
      LOG("❌ Validation failed: cost_price invalid", cost_price);
      return NextResponse.json({ error: "سعر الشراء غير صالح" }, { status: 400 });
    }
    if (!Number.isFinite(sellingNum) || sellingNum <= 0 || !Number.isInteger(Number(stock_qty)) || Number(stock_qty) < 0) {
      LOG("❌ Validation failed: selling_price invalid", selling_price);
      return NextResponse.json({ error: "سعر البيع غير صالح" }, { status: 400 });
    }

    // ── Primary Image Upload ───────────────────────────────────────────────────
    let image_url: string | null = null;
    if (imageFile && imageFile.size > 0) {
      image_url = await uploadToStorage(imageFile, session.partnerId);
    } else {
      LOG("ℹ️ No image file attached — skipping upload");
    }

    // ── Extra Images Upload ───────────────────────────────────────────────────
    const image_urls: string[] = [];
    for (const extraFile of extraImages) {
      if (extraFile && extraFile.size > 0) {
        const url = await uploadToStorage(extraFile, session.partnerId);
        if (url) image_urls.push(url);
      }
    }
    LOG(`ℹ️ ${image_urls.length} extra image(s) uploaded`);


    // ── Normalize sizes ───────────────────────────────────────────────────────
    const normalizedSizes = sizes_raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const dbPartnerId = getPartnerDbId(session.partnerId);

    LOG("💾 Inserting into 'products' table...", {
      partner_id: dbPartnerId,
      name_en,
      cost_price: costNum,
      selling_price: sellingNum,
      sizes: normalizedSizes,
      image_url,
    });

    // ── Insert ────────────────────────────────────────────────────────────────
    const { data, error: dbError } = await supabaseAdmin
      .from("products")
      .insert([
        {
          partner_id:    dbPartnerId,
          name_en:       name_en,
          name_ar:       name_ar       || null,
          description:   description   || null,
          category:      category      || null,
          cost_price:    costNum,
          selling_price: sellingNum,
          sizes:         normalizedSizes,
          colors: (String(formData.get("colors")??"")).split(",").map(c=>c.trim()).filter(Boolean),
          stock_quantity: Number(stock_qty),
          image_url:     image_url,
          image_urls:    image_urls,
          is_available:  true,
          in_stock:      Number(stock_qty)>0,
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error("[POST /api/admin/products] ❌ Supabase DB insert error:", {
        message: dbError.message,
        code:    dbError.code,
        details: dbError.details,
        hint:    dbError.hint,
      });
      return NextResponse.json(
        { error: `خطأ في قاعدة البيانات: ${dbError.message}` },
        { status: 500 }
      );
    }

    LOG("✅ Product created successfully:", data.id);
    // Revalidate the storefront so new visitors also see the new product
    revalidatePath("/");

    return NextResponse.json({ success: true, product: data }, { status: 201 });

  } catch (err) {
    console.error("[POST /api/admin/products] ❌ Unexpected server error:", err);
    return NextResponse.json(
      { error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

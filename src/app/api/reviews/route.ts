import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

// POST /api/reviews — submit a review (pending approval)
export async function POST(req: NextRequest) {
  try {
    const { product_id, customer_name, rating, comment } = await req.json();

    // Basic sanitization
    if (!product_id || typeof product_id !== "string") {
      return NextResponse.json({ error: "Missing product_id" }, { status: 400 });
    }
    if (!customer_name || typeof customer_name !== "string" || customer_name.length > 100) {
      return NextResponse.json({ error: "Invalid customer name" }, { status: 400 });
    }
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
    }

    const cleanComment = comment
      ? String(comment).slice(0, 500).replace(/<[^>]*>/g, "") // strip HTML
      : null;
    const cleanName = String(customer_name).trim().replace(/<[^>]*>/g, "");

    const { error } = await supabase
      .from("reviews")
      .insert({
        product_id,
        customer_name: cleanName,
        rating:        Math.round(rating),
        comment:       cleanComment,
        is_approved:   false, // pending admin approval
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: "Review submitted for approval" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// GET /api/reviews?product_id=xxx — fetch approved reviews
export async function GET(req: NextRequest) {
  const product_id = req.nextUrl.searchParams.get("product_id");
  if (!product_id) return NextResponse.json({ reviews: [] });

  const { data, error } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, comment, created_at")
    .eq("product_id", product_id)
    .eq("is_approved", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ reviews: [] });
  return NextResponse.json({ reviews: data ?? [] });
}

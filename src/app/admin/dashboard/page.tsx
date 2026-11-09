import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { getPartnerCategoryKeys, getPartnerDbId } from "@/lib/partners";
import DashboardShell from "./DashboardShell";

export const dynamic = "force-dynamic"; // always fetch fresh data

export default async function DashboardPage() {
  // ── Auth Guard ──────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) redirect("/admin/login");
  const dbPartnerId = getPartnerDbId(session.partnerId);

  const isSuperAdmin = false;

  // ── Fetch Partner's Products ────────────────────────────────────────────
  let productsQuery = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (!isSuperAdmin) {
    productsQuery = productsQuery.eq("partner_id", dbPartnerId);
    productsQuery = productsQuery.in("category", [...getPartnerCategoryKeys(session.partnerId)]);
  }

  const { data: products } = await productsQuery;

  // ── Fetch Partner's Orders + Items ──────────────────────────────────────
  let ordersQuery = supabase
    .from("orders")
    .select(`
      id, partner_id, customer_name, customer_phone, customer_address,
      source, status, notes, total_amount, paid_amount, activity_log,
      created_at, updated_at,
      order_items (
        id, product_id, quantity, size, unit_price, cost_price
      )
    `)
    .order("created_at", { ascending: false });

  if (!isSuperAdmin) {
    ordersQuery = ordersQuery.eq("partner_id", dbPartnerId);
  }

  const { data: orders } = await ordersQuery;

  return (
    <DashboardShell
      session={session}
      products={products ?? []}
      orders={orders ?? []}
    />
  );
}

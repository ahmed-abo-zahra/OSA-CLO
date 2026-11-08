"use client";
import ProductImage from "@/components/ProductImage";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { getPartnerById } from "@/lib/partners";
import { useLanguage } from "@/context/LanguageContext";
import AddProductModal, { type ProductForModal } from "./AddProductModal";
import ManualOrderModal from "./ManualOrderModal";
import OrderDetailsModal from "./OrderDetailsModal";
import CRMTab from "./CRMTab";
import DiscountsTab from "./DiscountsTab";
import ReportsTab from "./ReportsTab";
import BulkImport from "./BulkImport";
import ThemeToggle from "@/components/ThemeToggle";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Product {
  id: string; partner_id: string; name_en: string; name_ar?: string | null;
  category?: string | null; cost_price: number; selling_price: number;
  sizes?: string[] | null; stock_quantity: number; image_url?: string | null;
  is_available?: boolean; in_stock?: boolean; created_at: string;
}

export interface OrderItem {
  id: string; order_id?: string; product_id: string;
  quantity: number; size?: string; unit_price: number; cost_price: number;
}

export interface Order {
  id: string; partner_id: string; customer_name: string;
  customer_phone?: string; customer_address?: string;
  source?: string; status: string; notes?: string;
  total_amount: number; paid_amount?: number;
  activity_log?: string; created_at: string; updated_at?: string;
  order_items?: OrderItem[];
}

interface Props {
  session: { partnerId: string; partnerName: string };
  products: Product[];
  orders: Order[];
}

type Tab = "overview" | "products" | "orders" | "history" | "financials" | "manage" | "crm" | "discounts" | "reports" | "import";
type StatusFilter = "all" | "pending" | "processing" | "shipped";

// ── Constants ─────────────────────────────────────────────────────────────────
const ACTIVE_STATUSES  = ["pending", "processing", "shipped"] as const;
const CLOSED_STATUS    = "closed";
const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-50 text-yellow-700 border border-yellow-200",
  processing: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900",
  shipped:    "bg-purple-50 text-purple-700 border border-purple-200",
  closed:     "bg-green-50 text-green-700 border border-green-200",
};
const STATUS_DOT: Record<string, string> = {
  pending:    "bg-yellow-400",
  processing: "bg-blue-400",
  shipped:    "bg-purple-400",
  closed:     "bg-green-400",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `EGP ${n.toLocaleString("en-EG", { minimumFractionDigits: 0 })}`;
const fmtD = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtShort = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function exportCSV(orders: Order[], lang: string) {
  const isAr = lang === "ar";
  const headers = isAr
    ? ["رقم الطلب", "العميل", "الهاتف", "العنوان", "المصدر", "الحالة", "الإجمالي", "المدفوع", "المتبقي", "التاريخ"]
    : ["Order ID", "Customer", "Phone", "Address", "Source", "Status", "Total", "Paid", "Remaining", "Date"];
  const rows = orders.map((o) => {
    const paid      = o.paid_amount ?? 0;
    const remaining = Math.max(0, o.total_amount - paid);
    return [
      o.id.slice(0, 8),
      `"${o.customer_name}"`,
      o.customer_phone ?? "",
      `"${o.customer_address ?? ""}"`,
      o.source ?? "",
      o.status,
      o.total_amount,
      paid,
      remaining,
      fmtD(o.created_at),
    ].join(",");
  });
  const csv   = [headers.join(","), ...rows].join("\n");
  const blob  = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement("a");
  a.href      = url;
  a.download  = `aso-orders-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildChartData(orders: Order[]) {
  const map: Record<string, { revenue: number; cost: number }> = {};
  const now  = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    map[d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })] = { revenue: 0, cost: 0 };
  }
  orders.forEach((o) => {
    const key = new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    if (map[key] !== undefined) {
      const items = o.order_items ?? [];
      items.forEach((item) => {
        map[key].revenue += item.unit_price * item.quantity;
        map[key].cost    += item.cost_price * item.quantity;
      });
    }
  });
  return Object.entries(map).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue),
    cost:    Math.round(v.cost),
    profit:  Math.round(v.revenue - v.cost),
  }));
}

// ── Bottom Nav Tab Config ─────────────────────────────────────────────────────
const NAV_ICONS: Record<Tab, React.ReactNode> = {
  overview:   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  products:   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  orders:     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  history:    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  financials: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  manage:     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  crm:        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  discounts:  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  reports:    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  import:     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function DashboardShell({ session, products: initProducts, orders: initOrders }: Props) {
  const router = useRouter();
  const { t, lang, setLang, isRTL } = useLanguage();
  const partner = getPartnerById(session.partnerId);

  const [products, setProducts] = useState<Product[]>(initProducts);
  const [orders, setOrders]     = useState<Order[]>(initOrders);
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loggingOut, setLoggingOut]     = useState(false);

  // Modal state
  const [showAddProduct,  setShowAddProduct]  = useState(false);
  const [editProduct,     setEditProduct]     = useState<Product | null>(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [togglingId,  setTogglingId]  = useState<string | null>(null);

  const refresh = useCallback(() => router.refresh(), [router]);

  // ── KPI calculations ───────────────────────────────────────────────────────
  const activeOrders  = useMemo(() => orders.filter((o) => ACTIVE_STATUSES.includes(o.status as typeof ACTIVE_STATUSES[number])), [orders]);
  const closedOrders  = useMemo(() => orders.filter((o) => o.status === CLOSED_STATUS), [orders]);
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const shippedOrders = useMemo(() => orders.filter((o) => o.status === "shipped" || o.status === "closed"), [orders]);

  const allItems     = useMemo(() => orders.flatMap((o) => o.order_items ?? []), [orders]);
  const totalRevenue = useMemo(() => allItems.reduce((s, i) => s + i.unit_price * i.quantity, 0), [allItems]);
  const totalCost    = useMemo(() => allItems.reduce((s, i) => s + i.cost_price * i.quantity, 0), [allItems]);
  const netProfit    = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0";
  const outstanding  = useMemo(() => orders.reduce((s, o) => s + Math.max(0, o.total_amount - (o.paid_amount ?? 0)), 0), [orders]);

  const customerOrderCount = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((o) => { counts[o.customer_name] = (counts[o.customer_name] ?? 0) + 1; });
    return counts;
  }, [orders]);

  const filteredActiveOrders = useMemo(() => {
    if (statusFilter === "all") return activeOrders;
    return activeOrders.filter((o) => o.status === statusFilter);
  }, [activeOrders, statusFilter]);

  const chartData = useMemo(() => buildChartData(orders), [orders]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  function handleOrderStatusChange(orderId: string, status: string) {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o));
  }

  function handlePaidAmountChange(orderId: string, amount: number) {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, paid_amount: amount } : o));
  }

  async function handleInlineStatusChange(orderId: string, newStatus: string) {
    await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    handleOrderStatusChange(orderId, newStatus);
  }

  async function handleDelete(productId: string) {
    if (!window.confirm(t("admin.dashboard.manage.deleteConfirm"))) return;
    setDeletingId(productId);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (res.ok) setProducts((prev) => prev.filter((p) => p.id !== productId));
    } finally { setDeletingId(null); }
  }

  async function handleToggleStock(product: Product) {
    setTogglingId(product.id);
    const newValue = !(product.in_stock ?? true);
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "in_stock", value: newValue }),
    });
    if (res.ok) setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, in_stock: newValue } : p));
    setTogglingId(null);
  }

  async function handleToggleAvailability(product: Product) {
    setTogglingId(product.id);
    const newValue = !(product.is_available ?? true);
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "is_available", value: newValue }),
    });
    if (res.ok) setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, is_available: newValue } : p));
    setTogglingId(null);
  }

  const STATUS_LABEL = (s: string) => t(`admin.dashboard.orders.status.${s}`) || s;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview",   label: t("admin.dashboard.tabs.overview")   },
    { key: "products",   label: t("admin.dashboard.tabs.products")   },
    { key: "orders",     label: t("admin.dashboard.tabs.orders"),     badge: activeOrders.length || undefined },
    { key: "history",    label: t("admin.dashboard.tabs.history")    },
    { key: "financials", label: t("admin.dashboard.tabs.financials") },
    { key: "manage",     label: t("admin.dashboard.tabs.manage")     },
    { key: "crm",        label: "CRM"        },
    { key: "discounts",  label: "Discounts"  },
    { key: "reports",    label: "Reports"    },
    { key: "import",     label: "Import"     },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-[#F5F5F4] dark:bg-brand-black font-sans">

      {/* ══ HEADER ══ */}
      <header className="bg-white dark:bg-brand-gray border-b border-gray-200 dark:border-brand-border/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar — visible on mobile */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
              style={{ backgroundColor: partner?.color ?? "#555" }}
            >
              {partner?.initials ?? session.partnerName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.15em] uppercase text-brand-black dark:text-offwhite leading-none">
                {t("admin.dashboard.brand")}
              </p>
              <p className="text-[9px] text-gray-400 tracking-wide hidden sm:block">{session.partnerName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="text-[10px] font-bold tracking-widest uppercase border border-gray-200 dark:border-brand-border/30 px-2.5 py-1.5 text-gray-400 hover:text-brand-black dark:text-offwhite hover:border-gray-400 transition-all">
              {lang === "en" ? "عربي" : "EN"}
            </button>
            {/* Quick Action — + Product (visible on mobile) */}
            <button
              onClick={() => setShowAddProduct(true)}
              className="sm:hidden w-8 h-8 bg-brand-black dark:bg-offwhite dark:text-brand-black flex items-center justify-center text-white"
              title={t("admin.dashboard.overview.addProduct")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button onClick={handleLogout} disabled={loggingOut}
              className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 hidden sm:block">
              {loggingOut ? t("admin.dashboard.loggingOut") : t("admin.dashboard.logout")}
            </button>
          </div>
        </div>
      </header>

      {/* ══ DESKTOP TABS (hidden on mobile) ══ */}
      <nav className="bg-white dark:bg-brand-gray border-b border-gray-200 dark:border-brand-border/20 overflow-x-auto hidden sm:block">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0 min-w-max">
            {TABS.map(({ key, label, badge }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`relative px-5 py-3.5 text-[11px] font-semibold tracking-[0.1em] uppercase border-b-2 whitespace-nowrap transition-all
                  ${activeTab === key ? "border-[#1A1A1A] text-brand-black dark:text-offwhite" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {label}
                {badge ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ══ CONTENT ══ */}
      {/* Mobile: add bottom padding for bottom nav bar */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-24 sm:pb-8">

        {/* ── OVERVIEW ────────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-brand-black dark:text-offwhite tracking-[-0.02em]">
                {t("admin.dashboard.overview.welcome")} {session.partnerName} 👋
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{t("admin.dashboard.overview.summary")}</p>
            </div>

            {/* 4 KPI Cards — 2 cols on mobile */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <KpiCard title={t("admin.dashboard.kpi.totalOrders")} value={String(orders.length)} sub={t("common.allTime")} onClick={() => setActiveTab("orders")} />
              <KpiCard title={t("admin.dashboard.kpi.pendingOrders")} value={String(pendingOrders.length)} sub={`${activeOrders.length} active`} color="yellow" onClick={() => { setActiveTab("orders"); setStatusFilter("pending"); }} />
              <KpiCard title={t("admin.dashboard.kpi.completedOrders")} value={String(shippedOrders.length)} sub={`${closedOrders.length} closed`} color="green" onClick={() => setActiveTab("history")} />
              <KpiCard title={t("admin.dashboard.kpi.profit")} value={fmt(netProfit)} sub={`${profitMargin}% ${t("admin.dashboard.kpi.margin")}`} color={netProfit >= 0 ? "green" : "red"} onClick={() => setActiveTab("financials")} />
            </div>

            {/* Outstanding balance */}
            {outstanding > 0 && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 px-4 py-3 rounded-sm">
                <span className="text-red-500 text-lg shrink-0">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-red-700">{t("admin.dashboard.kpi.outstanding")}: {fmt(outstanding)}</p>
                  <p className="text-[10px] text-red-500">{orders.filter((o) => (o.total_amount - (o.paid_amount ?? 0)) > 0).length} orders with balance due</p>
                </div>
                <button onClick={() => setActiveTab("orders")} className="shrink-0 text-[10px] font-bold text-red-600 underline">View →</button>
              </div>
            )}

            {/* Quick Actions — full-width tappable on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionCard title={t("admin.dashboard.overview.addProduct")} desc={t("admin.dashboard.overview.addProductDesc")} icon={<PlusIcon />} onClick={() => setShowAddProduct(true)} />
              <ActionCard title={t("admin.dashboard.overview.recordOrder")} desc={t("admin.dashboard.overview.recordOrderDesc")} icon={<OrderIcon />} onClick={() => setShowManualOrder(true)} />
            </div>

            {/* Recent Orders */}
            {activeOrders.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="section-title">{t("admin.dashboard.overview.recentOrders")}</h2>
                  <button onClick={() => setActiveTab("orders")} className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-brand-black dark:text-offwhite">View All →</button>
                </div>
                <OrderCards
                  orders={activeOrders.slice(0, 5)}
                  customerOrderCount={customerOrderCount}
                  onView={(id) => setSelectedOrderId(id)}
                  onStatusChange={handleInlineStatusChange}
                  t={t} lang={lang}
                  showActions={false}
                />
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCTS ─────────────────────────────────────────────────────────── */}
        {activeTab === "products" && (
          <ProductsView products={products} onAdd={() => setShowAddProduct(true)} t={t} />
        )}

        {/* ── ACTIVE ORDERS ────────────────────────────────────────────────────── */}
        {activeTab === "orders" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-brand-black dark:text-offwhite">{t("admin.dashboard.orders.title")}</h2>
                <p className="text-xs text-gray-400">{activeOrders.length} {t("admin.dashboard.orders.totalCount")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportCSV(activeOrders, lang)}
                  className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 dark:border-brand-border/30 text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400 hover:border-gray-400 transition-all">
                  <DownloadIcon /> {t("admin.dashboard.orders.exportBtn")}
                </button>
                <button onClick={() => setShowManualOrder(true)} className="btn-dark flex items-center gap-2 text-[11px]">
                  <PlusIcon /> {t("admin.dashboard.orders.addBtn")}
                </button>
              </div>
            </div>

            {/* Status filter pills — scrollable */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {(["all", "pending", "processing", "shipped"] as StatusFilter[]).map((f) => (
                <button key={f} onClick={() => setStatusFilter(f)}
                  className={`shrink-0 px-3 py-2 text-[10px] font-bold tracking-widest uppercase border transition-all
                    ${statusFilter === f ? "bg-brand-black dark:bg-offwhite text-white dark:text-brand-black border-brand-black dark:border-offwhite" : "border-gray-200 dark:border-brand-border/20 text-gray-400 hover:border-gray-400 dark:hover:border-brand-border/60"}`}>
                  {f === "all" ? t("admin.dashboard.orders.filterAll") : STATUS_LABEL(f)}
                </button>
              ))}
            </div>

            {filteredActiveOrders.length === 0
              ? <EmptyState title={t("admin.dashboard.orders.empty.title")} desc={t("admin.dashboard.orders.empty.desc")} action={() => setShowManualOrder(true)} actionLabel={t("admin.dashboard.orders.empty.action")} />
              : <OrderCards
                  orders={filteredActiveOrders}
                  customerOrderCount={customerOrderCount}
                  onView={(id) => setSelectedOrderId(id)}
                  onStatusChange={handleInlineStatusChange}
                  t={t} lang={lang}
                  showActions
                />
            }
          </div>
        )}

        {/* ── HISTORY ──────────────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-brand-black dark:text-offwhite">{t("admin.dashboard.orders.historyTitle")}</h2>
                <p className="text-xs text-gray-400">{closedOrders.length} {t("admin.dashboard.orders.totalCount")}</p>
              </div>
              <button onClick={() => exportCSV(closedOrders, lang)}
                className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 dark:border-brand-border/30 text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400 hover:border-gray-400 transition-all">
                <DownloadIcon /> {t("admin.dashboard.orders.exportBtn")}
              </button>
            </div>
            {closedOrders.length === 0
              ? <div className="bg-white dark:bg-brand-gray border border-dashed border-gray-200 dark:border-brand-border/20 py-16 text-center"><p className="text-sm text-gray-300 font-medium">{t("admin.dashboard.orders.empty.closedTitle")}</p></div>
              : <OrderCards orders={closedOrders} customerOrderCount={customerOrderCount} onView={(id) => setSelectedOrderId(id)} onStatusChange={handleInlineStatusChange} t={t} lang={lang} showActions={false} />
            }
          </div>
        )}

        {/* ── FINANCIALS ───────────────────────────────────────────────────────── */}
        {activeTab === "financials" && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-base font-bold text-brand-black dark:text-offwhite">{t("admin.dashboard.financials.title")}</h2>
              <p className="text-xs text-gray-400">{t("admin.dashboard.financials.subtitle")}</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <FinCard label={t("admin.dashboard.kpi.revenue")}           value={fmt(totalRevenue)} />
              <FinCard label={t("admin.dashboard.kpi.profit")}            value={fmt(netProfit)}    unit={`${profitMargin}%`} highlight />
              <FinCard label={t("admin.dashboard.financials.outstanding")} value={fmt(outstanding)} danger={outstanding > 0} />
              <FinCard label={t("admin.dashboard.kpi.unitsSold")}         value={String(allItems.reduce((s, i) => s + i.quantity, 0))} unit={t("common.units")} />
            </div>

            {/* Chart */}
            {chartData.some((d) => d.revenue > 0) && (
              <div className="bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 p-4 sm:p-6">
                <h3 className="section-title mb-4">{t("admin.dashboard.financials.chart")}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="profit-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#1A1A1A" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1A1A1A" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="cost-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ border: "1px solid #e5e7eb", borderRadius: 0, fontSize: 11 }} formatter={(v, name) => [`EGP ${Number(v ?? 0).toLocaleString("en-EG")}`, String(name)]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Area type="monotone" dataKey="profit" name={t("admin.dashboard.financials.chart_labels.profit")} stroke="#1A1A1A" strokeWidth={2} fill="url(#profit-grad)" />
                    <Area type="monotone" dataKey="cost"   name={t("admin.dashboard.financials.chart_labels.cost")}   stroke="#ef4444" strokeWidth={1.5} fill="url(#cost-grad)" strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Financial table — cards on mobile */}
            {allItems.length > 0 ? (
              <div>
                <h3 className="section-title mb-3">{t("admin.dashboard.financials.breakdown")}</h3>
                {/* Desktop table */}
                <div className="hidden sm:block bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["product","units","revenue","cost","profit","margin"].map((k) => (
                          <th key={k} className="th-style">{t(`admin.dashboard.financials.table.${k}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => {
                        const pItems = allItems.filter((i) => i.product_id === product.id);
                        if (!pItems.length) return null;
                        const units  = pItems.reduce((s, i) => s + i.quantity, 0);
                        const rev    = pItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
                        const cost   = pItems.reduce((s, i) => s + i.cost_price * i.quantity, 0);
                        const profit = rev - cost;
                        const pct    = rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0.0";
                        return (
                          <tr key={product.id} className="border-b border-gray-50 hover:bg-gray-50 dark:bg-brand-black">
                            <td className="px-4 py-3 text-xs font-semibold text-brand-black dark:text-offwhite">{product.name_en}</td>
                            <td className="px-4 py-3 text-xs font-mono">{units}</td>
                            <td className="px-4 py-3 text-xs font-mono">{fmt(rev)}</td>
                            <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{fmt(cost)}</td>
                            <td className="px-4 py-3 text-xs font-mono font-bold text-green-700">{fmt(profit)}</td>
                            <td className="px-4 py-3"><span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5">{pct}%</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-brand-black border-t-2 border-gray-200 dark:border-brand-border/20">
                        <td className="px-4 py-3 text-[10px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400">{t("admin.dashboard.financials.total")}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold">{allItems.reduce((s, i) => s + i.quantity, 0)}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold">{fmt(totalRevenue)}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-gray-500 dark:text-gray-400">{fmt(totalCost)}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-green-700">{fmt(netProfit)}</td>
                        <td className="px-4 py-3"><span className="text-[10px] font-bold bg-green-100 text-green-800 px-2 py-0.5">{profitMargin}%</span></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="sm:hidden flex flex-col gap-2">
                  {products.map((product) => {
                    const pItems = allItems.filter((i) => i.product_id === product.id);
                    if (!pItems.length) return null;
                    const units  = pItems.reduce((s, i) => s + i.quantity, 0);
                    const rev    = pItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
                    const cost   = pItems.reduce((s, i) => s + i.cost_price * i.quantity, 0);
                    const profit = rev - cost;
                    const pct    = rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={product.id} className="bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-brand-black dark:text-offwhite">{product.name_en}</p>
                          <span className="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-0.5">{pct}%</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div><p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.financials.table.units")}</p><p className="text-xs font-mono font-bold">{units}</p></div>
                          <div><p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.financials.table.revenue")}</p><p className="text-xs font-mono">{fmt(rev)}</p></div>
                          <div><p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.financials.table.profit")}</p><p className="text-xs font-mono font-bold text-green-700">{fmt(profit)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState title={t("admin.dashboard.financials.empty.title")} desc={t("admin.dashboard.financials.empty.desc")} action={() => setShowManualOrder(true)} actionLabel={t("admin.dashboard.financials.empty.action")} />
            )}
          </div>
        )}

        {/* ── MANAGE (CRUD) ─────────────────────────────────────────────────────── */}
        {activeTab === "manage" && (
          <ManageTab
            products={products}
            deletingId={deletingId}
            togglingId={togglingId}
            onAdd={() => setShowAddProduct(true)}
            onEdit={(p) => setEditProduct(p)}
            onDelete={handleDelete}
            onToggleStock={handleToggleStock}
            onToggleAvailability={handleToggleAvailability}
            t={t}
          />
        )}

        {/* ── CRM ─────────────────────────────────────────────────────────────── */}
        {activeTab === "crm" && (
          <CRMTab orders={orders as Parameters<typeof CRMTab>[0]["orders"]} />
        )}

        {/* ── DISCOUNTS ────────────────────────────────────────────────────────── */}
        {activeTab === "discounts" && <DiscountsTab />}

        {/* ── REPORTS ──────────────────────────────────────────────────────────── */}
        {activeTab === "reports" && (
          <ReportsTab
            orders={orders as Parameters<typeof ReportsTab>[0]["orders"]}
            products={products}
          />
        )}

        {/* ── BULK IMPORT ──────────────────────────────────────────────────────── */}
        {activeTab === "import" && (
          <BulkImport onSuccess={refresh} />
        )}
      </main>

      {/* ══ MOBILE BOTTOM NAVIGATION BAR (hidden on sm+) ══ */}
      {/* Scrollable horizontal nav for 10 tabs */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-brand-gray border-t border-gray-200 dark:border-brand-border/20">
        <div className="flex items-stretch h-16 overflow-x-auto scrollbar-hide">
          {TABS.map(({ key, badge }) => {
            const LABELS: Record<Tab, string> = {
              overview:  "Home",
              products:  "Shop",
              orders:    "Orders",
              history:   "Archive",
              financials:"Finance",
              manage:    "Manage",
              crm:       "CRM",
              discounts: "Deals",
              reports:   "Reports",
              import:    "Import",
            };
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative shrink-0 w-16 flex flex-col items-center justify-center gap-0.5 transition-colors min-h-[44px]
                  ${activeTab === key ? "text-brand-black dark:text-offwhite" : "text-gray-400"}`}
              >
                {activeTab === key && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-black dark:bg-offwhite rounded-full" />
                )}
                <span className="relative">
                  {NAV_ICONS[key]}
                  {badge ? (
                    <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[8px] font-semibold tracking-wide leading-none">
                  {LABELS[key]}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ══ MODALS ══ */}
      {(showAddProduct || editProduct) && (
        <AddProductModal
          partnerName={session.partnerName}
          product={editProduct as ProductForModal | undefined}
          onSuccess={() => { setShowAddProduct(false); setEditProduct(null); refresh(); }}
          onClose={() => { setShowAddProduct(false); setEditProduct(null); }}
        />
      )}
      {showManualOrder && (
        <ManualOrderModal
          products={products}
          onSuccess={() => { setShowManualOrder(false); refresh(); }}
          onClose={() => setShowManualOrder(false)}
        />
      )}
      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          partnerName={session.partnerName}
          onClose={() => setSelectedOrderId(null)}
          onStatusChange={handleOrderStatusChange}
          onPaidAmountChange={handlePaidAmountChange}
        />
      )}
    </div>
  );
}

// ── Order Cards (Responsive: Cards on mobile, Table on desktop) ───────────────
function OrderCards({
  orders, customerOrderCount, onView, onStatusChange, t, lang, showActions,
}: {
  orders: Order[];
  customerOrderCount: Record<string, number>;
  onView: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  t: (k: string) => string;
  lang: string;
  showActions: boolean;
}) {
  return (
    <>
      {/* ── Desktop Table ── */}
      <div className="hidden sm:block bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {["customer","phone","source","items","total","paid","remaining","status","date"].map((k) => (
                <th key={k} className="th-style">{t(`admin.dashboard.orders.table.${k}`)}</th>
              ))}
              {showActions && <th className="th-style">{t("admin.dashboard.orders.table.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const paid      = o.paid_amount ?? 0;
              const remaining = Math.max(0, o.total_amount - paid);
              const isRepeat  = (customerOrderCount[o.customer_name] ?? 0) > 1;
              const itemCount = o.order_items?.length ?? 0;
              return (
                <tr key={o.id} onClick={() => onView(o.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 dark:bg-brand-black ${remaining > 0 ? "bg-red-50/30" : ""}`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold text-brand-black dark:text-offwhite">{o.customer_name}</p>
                      {isRepeat && <span className="inline-block text-[9px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 px-1.5 py-0.5 mt-0.5">{t("common.repeatCustomer")}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {o.customer_phone
                      ? <a href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-green-600 font-mono hover:underline">{o.customer_phone}</a>
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-brand-black px-2 py-0.5">{o.source ?? "—"}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{itemCount}</td>
                  <td className="px-4 py-3 text-xs font-mono font-semibold text-brand-black dark:text-offwhite">EGP {o.total_amount.toLocaleString("en-EG")}</td>
                  <td className="px-4 py-3 text-xs font-mono text-green-700">EGP {paid.toLocaleString("en-EG")}</td>
                  <td className="px-4 py-3">
                    {remaining > 0
                      ? <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 border border-red-200">EGP {remaining.toLocaleString("en-EG")}</span>
                      : <span className="text-[10px] font-bold text-green-600">✓ {lang === "ar" ? "مدفوع" : "Paid"}</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select value={o.status} onChange={(e) => onStatusChange(o.id, e.target.value)}
                      className={`text-[10px] font-bold px-2 py-1 border cursor-pointer ${STATUS_COLORS[o.status] ?? ""}`}>
                      {["pending","processing","shipped","closed"].map((s) => (
                        <option key={s} value={s}>{t(`admin.dashboard.orders.status.${s}`)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtD(o.created_at)}</td>
                  {showActions && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onView(o.id)} className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-brand-black dark:text-offwhite border border-gray-200 dark:border-brand-border/30 px-2 py-1 hover:border-gray-400 transition-all">{t("common.viewDetails")}</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="sm:hidden flex flex-col gap-2">
        {orders.map((o) => {
          const paid      = o.paid_amount ?? 0;
          const remaining = Math.max(0, o.total_amount - paid);
          const isRepeat  = (customerOrderCount[o.customer_name] ?? 0) > 1;
          return (
            <div
              key={o.id}
              onClick={() => onView(o.id)}
              className={`bg-white dark:bg-brand-gray border rounded-sm p-4 cursor-pointer active:bg-gray-50 dark:bg-brand-black transition-colors
                ${remaining > 0 ? "border-red-200 bg-red-50/20" : "border-gray-200 dark:border-brand-border/20"}`}
            >
              {/* Row 1: Name + Status */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-sm font-bold text-brand-black dark:text-offwhite leading-tight">{o.customer_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isRepeat && <span className="text-[9px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 px-1.5 py-0.5">{t("common.repeatCustomer")}</span>}
                    <span className="text-[10px] text-gray-400 font-mono">{o.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>
                {/* Status badge with dot */}
                <div className={`flex items-center gap-1 px-2 py-1 border text-[10px] font-bold shrink-0 ${STATUS_COLORS[o.status] ?? ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[o.status]}`} />
                  {t(`admin.dashboard.orders.status.${o.status}`)}
                </div>
              </div>

              {/* Row 2: Financial summary */}
              <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-gray-100 my-2">
                <div>
                  <p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.orders.table.total")}</p>
                  <p className="text-xs font-mono font-bold text-brand-black dark:text-offwhite">EGP {o.total_amount.toLocaleString("en-EG")}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.orders.table.paid")}</p>
                  <p className="text-xs font-mono text-green-700">EGP {paid.toLocaleString("en-EG")}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400 uppercase">{t("admin.dashboard.orders.table.remaining")}</p>
                  {remaining > 0
                    ? <p className="text-xs font-mono font-bold text-red-600">EGP {remaining.toLocaleString("en-EG")}</p>
                    : <p className="text-xs font-bold text-green-600">✓ {lang === "ar" ? "مدفوع" : "Paid"}</p>}
                </div>
              </div>

              {/* Row 3: Meta + Status changer */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {o.customer_phone && (
                    <a href={`https://wa.me/${o.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-green-600 font-mono">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.991.52 3.863 1.432 5.482L2 22l4.664-1.408A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                      {o.customer_phone}
                    </a>
                  )}
                  <span className="text-[9px] text-gray-300">{fmtShort(o.created_at)}</span>
                </div>

                {/* Inline status changer */}
                <div onClick={(e) => e.stopPropagation()}>
                  <select value={o.status} onChange={(e) => onStatusChange(o.id, e.target.value)}
                    className={`text-[10px] font-bold px-2 py-1.5 border cursor-pointer ${STATUS_COLORS[o.status] ?? ""}`}>
                    {["pending","processing","shipped","closed"].map((s) => (
                      <option key={s} value={s}>{t(`admin.dashboard.orders.status.${s}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Products View ─────────────────────────────────────────────────────────────
function ProductsView({ products, onAdd, t }: { products: Product[]; onAdd: () => void; t: (k: string) => string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-black dark:text-offwhite">{t("admin.dashboard.tabs.products")}</h2>
          <p className="text-xs text-gray-400">{products.length} items</p>
        </div>
        <button onClick={onAdd} className="btn-dark flex items-center gap-2 text-[11px]"><PlusIcon /> {t("admin.dashboard.manage.addBtn")}</button>
      </div>
      {products.length === 0
        ? <EmptyState title={t("admin.dashboard.manage.empty.title")} desc={t("admin.dashboard.manage.empty.desc")} action={onAdd} actionLabel={t("admin.dashboard.manage.empty.action")} />
        : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {products.map((p) => (
              <div key={p.id} className="bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 overflow-hidden hover:shadow-sm transition-shadow">
                <div className="aspect-square bg-gray-100 dark:bg-brand-black overflow-hidden">
                  {p.image_url
                    ? <ProductImage src={p.image_url} alt={p.name_en} sizes="320px" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-black">{p.name_en.slice(0, 2).toUpperCase()}</div>}
                </div>
                <div className="p-3 sm:p-4">
                  <p className="text-xs sm:text-sm font-bold text-brand-black dark:text-offwhite leading-tight">{p.name_en}</p>
                  {p.name_ar && <p className="text-[10px] text-gray-400 mt-0.5" dir="rtl">{p.name_ar}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs font-bold font-mono text-brand-black dark:text-offwhite">EGP {p.selling_price.toLocaleString("en-EG")}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 border ${p.in_stock ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-600 bg-red-50"}`}>
                      {p.in_stock ? t("admin.dashboard.manage.inStock") : t("admin.dashboard.manage.soldOut")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Manage Tab ────────────────────────────────────────────────────────────────
function ManageTab({ products, deletingId, togglingId, onAdd, onEdit, onDelete, onToggleStock, onToggleAvailability, t }: {
  products: Product[]; deletingId: string | null; togglingId: string | null;
  onAdd: () => void; onEdit: (p: Product) => void; onDelete: (id: string) => void;
  onToggleStock: (p: Product) => void; onToggleAvailability: (p: Product) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-brand-black dark:text-offwhite">{t("admin.dashboard.manage.title")}</h2>
          <p className="text-xs text-gray-400">{products.length} products</p>
        </div>
        <button onClick={onAdd} className="btn-dark flex items-center gap-2 text-[11px]"><PlusIcon /> {t("admin.dashboard.manage.addBtn")}</button>
      </div>
      {products.length === 0
        ? <EmptyState title={t("admin.dashboard.manage.empty.title")} desc={t("admin.dashboard.manage.empty.desc")} action={onAdd} actionLabel={t("admin.dashboard.manage.empty.action")} />
        : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["product","cost","selling","profit","stock","availability","actions"].map((k) => (
                      <th key={k} className="th-style">{t(`admin.dashboard.manage.table.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const profit     = p.selling_price - p.cost_price;
                    const isDeleting = deletingId === p.id;
                    const isToggling = togglingId === p.id;
                    const inStock    = p.in_stock ?? true;
                    return (
                      <tr key={p.id} className={`border-b border-gray-50 transition-colors ${isDeleting ? "opacity-30" : "hover:bg-gray-50 dark:bg-brand-black"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.image_url
                              ? <div className="w-10 h-10 shrink-0"><ProductImage src={p.image_url} alt={p.name_en} sizes="320px" /></div>
                              : <div className="w-10 h-10 bg-gray-100 dark:bg-brand-black flex items-center justify-center text-[9px] text-gray-400 font-bold shrink-0">{p.name_en.slice(0, 2).toUpperCase()}</div>}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-brand-black dark:text-offwhite truncate">{p.name_en}</p>
                              {p.category && <p className="text-[9px] text-gray-300">{p.category}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">EGP {p.cost_price.toLocaleString("en-EG")}</td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-brand-black dark:text-offwhite">EGP {p.selling_price.toLocaleString("en-EG")}</td>
                        <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 ${profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>+EGP {profit.toLocaleString("en-EG")}</span></td>
                        <td className="px-4 py-3 text-xs font-mono">{p.stock_quantity}</td>
                        <td className="px-4 py-3">
                          <button disabled={isToggling} onClick={() => onToggleStock(p)}
                            className={`text-[10px] font-bold px-3 py-1 border transition-all disabled:opacity-40
                              ${inStock ? "border-green-200 text-green-700 bg-green-50 hover:bg-red-50 hover:text-red-600 hover:border-red-200" : "border-red-200 text-red-600 bg-red-50 hover:bg-green-50 hover:text-green-700 hover:border-green-200"}`}>
                            {inStock ? t("admin.dashboard.manage.inStock") : t("admin.dashboard.manage.soldOut")}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                const { generateWhatsAppStatus } = await import("@/lib/generateStatus");
                                generateWhatsAppStatus(p);
                              }}
                              title={t("admin.dashboard.orders.generateWhatsApp")}
                              className="w-7 h-7 flex items-center justify-center border border-gray-200 dark:border-brand-border/30 text-gray-400 hover:text-green-600 hover:border-green-300 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="9" rx="1"/><path d="M5 12v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                            </button>
                            <button onClick={() => onEdit(p)} title={t("admin.dashboard.manage.edit")} className="w-7 h-7 flex items-center justify-center border border-gray-200 dark:border-brand-border/30 text-gray-400 hover:text-brand-black dark:text-offwhite hover:border-gray-400 transition-colors"><EditIcon /></button>
                            <button onClick={() => onToggleAvailability(p)} disabled={isToggling} className={`w-7 h-7 flex items-center justify-center border transition-colors disabled:opacity-40 ${p.is_available ? "border-gray-200 dark:border-brand-border/20 text-gray-400 hover:text-orange-500 hover:border-orange-300" : "border-orange-200 text-orange-500"}`}>{p.is_available ? <EyeIcon /> : <EyeOffIcon />}</button>
                            <button onClick={() => onDelete(p.id)} disabled={isDeleting} className="w-7 h-7 flex items-center justify-center border border-gray-200 dark:border-brand-border/30 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40"><TrashIcon /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile manage cards */}
            <div className="sm:hidden flex flex-col gap-2">
              {products.map((p) => {
                const profit     = p.selling_price - p.cost_price;
                const isDeleting = deletingId === p.id;
                const isToggling = togglingId === p.id;
                const inStock    = p.in_stock ?? true;
                return (
                  <div key={p.id} className={`bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 p-4 transition-opacity ${isDeleting ? "opacity-30" : ""}`}>
                    {/* Product info */}
                    <div className="flex items-center gap-3 mb-3">
                      {p.image_url
                        ? <div className="w-12 h-12 shrink-0"><ProductImage src={p.image_url} alt={p.name_en} sizes="320px" /></div>
                        : <div className="w-12 h-12 bg-gray-100 dark:bg-brand-black flex items-center justify-center text-[10px] text-gray-400 font-bold shrink-0">{p.name_en.slice(0, 2).toUpperCase()}</div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-brand-black dark:text-offwhite truncate">{p.name_en}</p>
                        {p.category && <p className="text-[10px] text-gray-400">{p.category}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono font-bold text-brand-black dark:text-offwhite">EGP {p.selling_price.toLocaleString("en-EG")}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 ${profit >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>+{profit.toLocaleString("en-EG")}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action row — full width touch targets */}
                    <div className="grid grid-cols-4 gap-2 border-t border-gray-100 pt-3">
                      {/* Stock toggle — 2 cols */}
                      <button disabled={isToggling} onClick={() => onToggleStock(p)}
                        className={`py-2.5 text-[9px] font-bold border transition-all disabled:opacity-40 col-span-2
                          ${inStock ? "border-green-200 text-green-700 bg-green-50" : "border-red-200 text-red-600 bg-red-50"}`}>
                        {inStock ? t("admin.dashboard.manage.inStock") : t("admin.dashboard.manage.soldOut")}
                      </button>
                      {/* Edit */}
                      <button onClick={() => onEdit(p)}
                        className="py-2.5 flex items-center justify-center border border-gray-200 dark:border-brand-border/30 text-gray-500 dark:text-gray-400 hover:text-brand-black dark:text-offwhite hover:border-gray-400 transition-colors">
                        <EditIcon />
                      </button>
                      {/* Delete */}
                      <button onClick={() => onDelete(p.id)} disabled={isDeleting}
                        className="py-2.5 flex items-center justify-center border border-gray-200 dark:border-brand-border/30 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors disabled:opacity-40">
                        <TrashIcon />
                      </button>
                      {/* Generate WhatsApp Status — full width */}
                      <button
                        onClick={async () => {
                          const { generateWhatsAppStatus } = await import("@/lib/generateStatus");
                          generateWhatsAppStatus(p);
                        }}
                        className="col-span-4 py-2.5 flex items-center justify-center gap-2 border border-green-200 text-green-700 bg-green-50 text-[10px] font-bold hover:bg-green-100 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="9" rx="1"/><path d="M5 12v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        Generate WA Status
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      }
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, color, onClick }: {
  title: string; value: string; sub?: string; color?: "green" | "red" | "yellow"; onClick?: () => void;
}) {
  const accent = color === "green" ? "text-green-700 dark:text-green-400" : color === "red" ? "text-red-600 dark:text-red-400" : color === "yellow" ? "text-yellow-600 dark:text-yellow-400" : "text-brand-black dark:text-gray-200";
  return (
    <button onClick={onClick} className="bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 p-4 sm:p-5 text-left hover:border-gray-400 hover:shadow-sm transition-all active:scale-[0.98]">
      <p className="text-[9px] sm:text-[10px] font-bold tracking-[0.12em] uppercase text-gray-400 mb-1.5">{title}</p>
      <p className={`text-lg sm:text-xl font-bold tracking-[-0.02em] ${accent}`}>{value}</p>
      {sub && <p className="text-[9px] text-gray-400 mt-0.5">{sub}</p>}
    </button>
  );
}

function FinCard({ label, value, unit, highlight, danger }: {
  label: string; value: string; unit?: string; highlight?: boolean; danger?: boolean;
}) {
  return (
    <div className={`p-4 sm:p-5 border ${highlight ? "bg-brand-black dark:bg-gray-800 border-brand-black dark:border-gray-800" : danger ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50" : "bg-white dark:bg-brand-gray border-gray-200 dark:border-brand-border/20"}`}>
      <p className={`text-[9px] sm:text-[10px] font-bold tracking-[0.12em] uppercase mb-1.5 ${highlight ? "text-white/50 dark:text-gray-400" : "text-gray-400"}`}>{label}</p>
      <p className={`text-base sm:text-lg font-bold ${highlight ? "text-white dark:text-gray-100" : danger ? "text-red-600 dark:text-red-400" : "text-brand-black dark:text-gray-200"}`}>{value}</p>
      {unit && <p className={`text-[9px] mt-0.5 ${highlight ? "text-white/40 dark:text-gray-500" : "text-gray-400"}`}>{unit}</p>}
    </div>
  );
}

function ActionCard({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/20 p-4 sm:p-5 text-left flex items-start gap-4 hover:border-gray-400 hover:shadow-sm transition-all group active:scale-[0.99]">
      <div className="w-9 h-9 bg-gray-100 dark:bg-brand-black flex items-center justify-center shrink-0 group-hover:bg-brand-black dark:group-hover:bg-offwhite group-hover:text-white dark:group-hover:text-brand-black dark:text-offwhite transition-all">{icon}</div>
      <div>
        <p className="text-sm font-bold text-brand-black dark:text-offwhite">{title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function EmptyState({ title, desc, action, actionLabel }: { title: string; desc: string; action: () => void; actionLabel: string }) {
  return (
    <div className="bg-white dark:bg-brand-gray border border-dashed border-gray-200 dark:border-brand-border/20 py-16 flex flex-col items-center gap-3">
      <p className="text-sm font-semibold text-gray-400">{title}</p>
      <p className="text-xs text-gray-300">{desc}</p>
      <button onClick={action} className="mt-2 btn-dark text-[10px]">{actionLabel}</button>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlusIcon     = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const OrderIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
const DownloadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const EditIcon     = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const TrashIcon    = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>;
const EyeIcon      = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const EyeOffIcon   = () => <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

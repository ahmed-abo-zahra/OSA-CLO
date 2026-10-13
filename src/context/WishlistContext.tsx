"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { DEMO_MODE } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WishlistItem {
  productId: string;
  nameEn: string;
  nameAr?: string;
  price: number;          // price at time of adding (to detect drops)
  imageUrl?: string;
  category?: string;
  addedAt: number;        // timestamp
}

export interface WishlistNotification {
  id: string;
  productId: string;
  nameEn: string;
  type: "price_drop" | "low_stock";
  message_ar: string;
  message_en: string;
  seenAt?: number;
}

interface WishlistContextType {
  items: WishlistItem[];
  notifications: WishlistNotification[];
  unseenCount: number;
  addItem: (item: Omit<WishlistItem, "addedAt">) => void;
  removeItem: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  markAllSeen: () => void;
  dismissNotification: (id: string) => void;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

const STORAGE_KEY  = "aso-wishlist-v1";
const NOTIF_KEY    = "aso-wishlist-notifs-v1";
const CHECK_INTERVAL = 5 * 60 * 1000; // check every 5 minutes

// ── Provider ──────────────────────────────────────────────────────────────────
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items,         setItems]         = useState<WishlistItem[]>([]);
  const [notifications, setNotifications] = useState<WishlistNotification[]>([]);
  const [hydrated,      setHydrated]      = useState(false);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Hydrate from localStorage ────────────────────────────────────────────
  useEffect(() => {
    try {
      const rawItems  = localStorage.getItem(STORAGE_KEY);
      const rawNotifs = localStorage.getItem(NOTIF_KEY);
      if (rawItems)  setItems(JSON.parse(rawItems));
      if (rawNotifs) setNotifications(JSON.parse(rawNotifs));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifications));
  }, [notifications, hydrated]);

  // ── Background checker ───────────────────────────────────────────────────
  const checkWishlist = useCallback(async (currentItems: WishlistItem[]) => {
    if (DEMO_MODE || currentItems.length === 0) return;

    const ids = currentItems.map((i) => i.productId);
    const { data, error } = await supabase
      .from("products")
      .select("id, name_en, selling_price, stock_quantity, is_available, in_stock")
      .in("id", ids);

    if (error || !data) return;

    const newNotifs: WishlistNotification[] = [];

    for (const product of data) {
      const wishItem = currentItems.find((i) => i.productId === product.id);
      if (!wishItem) continue;

      // Price drop detection
      if (product.selling_price < wishItem.price) {
        const discountPct = Math.round(
          ((wishItem.price - product.selling_price) / wishItem.price) * 100
        );
        const notifId = `drop-${product.id}-${product.selling_price}`;
        const alreadyNotified = newNotifs.some((n) => n.id === notifId);

        if (!alreadyNotified) {
          newNotifs.push({
            id: notifId,
            productId: product.id,
            nameEn: product.name_en,
            type: "price_drop",
            message_ar: `🔥 انخفض سعر ${product.name_en} بنسبة ${discountPct}%! بقى EGP ${product.selling_price}`,
            message_en: `🔥 ${product.name_en} dropped ${discountPct}%! Now EGP ${product.selling_price}`,
          });

          // Update stored price
          setItems((prev) =>
            prev.map((i) =>
              i.productId === product.id ? { ...i, price: product.selling_price } : i
            )
          );
        }
      }

      // Low stock detection (≤ 3 units)
      const qty = product.stock_quantity ?? 0;
      if (qty > 0 && qty <= 3) {
        const notifId = `low-${product.id}-${qty}`;
        newNotifs.push({
          id: notifId,
          productId: product.id,
          nameEn: product.name_en,
          type: "low_stock",
          message_ar: `⚡ ${product.name_en} — فضل بس ${qty} قطعة! الحق قبل ما يخلص`,
          message_en: `⚡ ${product.name_en} — Only ${qty} left! Grab it before it's gone`,
        });
      }
    }

    if (newNotifs.length > 0) {
      setNotifications((prev) => {
        // Deduplicate by id
        const existingIds = new Set(prev.map((n) => n.id));
        const fresh = newNotifs.filter((n) => !existingIds.has(n.id));
        return [...fresh, ...prev].slice(0, 20); // keep latest 20
      });
    }
  }, []);

  // Start interval when hydrated
  useEffect(() => {
    if (!hydrated) return;
    checkWishlist(items);
    checkRef.current = setInterval(() => {
      setItems((current) => {
        checkWishlist(current);
        return current;
      });
    }, CHECK_INTERVAL);
    return () => {
      if (checkRef.current) clearInterval(checkRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const addItem = useCallback((item: Omit<WishlistItem, "addedAt">) => {
    setItems((prev) => {
      if (prev.some((i) => i.productId === item.productId)) return prev;
      return [...prev, { ...item, addedAt: Date.now() }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const isWishlisted = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const unseenCount = notifications.filter((n) => !n.seenAt).length;

  const markAllSeen = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.seenAt ? n : { ...n, seenAt: Date.now() }))
    );
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <WishlistContext.Provider
      value={{
        items,
        notifications,
        unseenCount,
        addItem,
        removeItem,
        isWishlisted,
        markAllSeen,
        dismissNotification,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within <WishlistProvider>");
  return ctx;
}

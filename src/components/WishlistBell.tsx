"use client";
import ProductImage from "@/components/ProductImage";

import { useState } from "react";
import { useWishlist } from "@/context/WishlistContext";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";

export default function WishlistBell() {
  const { notifications, unseenCount, markAllSeen, dismissNotification, items } =
    useWishlist();
  const { lang, isRTL } = useLanguage();
  const ar = lang === "ar";

  const [open, setOpen] = useState(false);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open) markAllSeen();
  }

  return (
    <div className="relative" dir={isRTL ? "rtl" : "ltr"}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label={ar ? "المفضلة والتنبيهات" : "Wishlist & Alerts"}
        className="relative flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:text-brand-black dark:hover:text-offwhite transition-colors"
      >
        {/* Heart icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={items.length > 0 ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          className={items.length > 0 ? "text-red-500" : ""}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>

        {/* Unseen badge */}
        {unseenCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          <div
            className={`fixed left-3 right-3 top-16 z-50 w-auto sm:absolute sm:top-8 sm:left-auto sm:right-0 sm:w-80 bg-white dark:bg-brand-gray border border-gray-200 dark:border-brand-border/30 shadow-xl max-h-[500px] overflow-y-auto`}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-brand-border/20 flex items-center justify-between">
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-brand-black dark:text-offwhite">
                {ar ? "المفضلة والتنبيهات" : "Wishlist & Alerts"}
              </p>
              {items.length > 0 && (
                <span className="text-[9px] text-gray-500 dark:text-gray-400">
                  {items.length} {ar ? "منتج" : "items"}
                </span>
              )}
            </div>

            {/* Notifications */}
            {notifications.length > 0 && (
              <div className="border-b border-gray-100 dark:border-brand-border/20">
                <p className="px-4 py-2 text-[9px] font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500">
                  {ar ? "تنبيهات" : "Alerts"}
                </p>
                {notifications.slice(0, 5).map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 flex items-start justify-between gap-2 border-b border-gray-50 dark:border-brand-border/10 ${
                      !notif.seenAt ? "bg-yellow-50 dark:bg-yellow-900/10" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 font-black rounded w-fit ${
                          notif.type === "price_drop"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        }`}
                      >
                        {notif.type === "price_drop"
                          ? (ar ? "تخفيض سعر" : "Price Drop")
                          : (ar ? "المخزون بيخلص" : "Low Stock")}
                      </span>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mt-1">
                        {ar ? notif.message_ar : notif.message_en}
                      </p>
                      <Link
                        href={`/product/${notif.productId}`}
                        onClick={() => setOpen(false)}
                        className="text-[10px] font-bold text-brand-black dark:text-offwhite underline underline-offset-2 mt-0.5"
                      >
                        {ar ? "اشتري دلوقتي" : "Shop Now →"}
                      </Link>
                    </div>
                    <button
                      onClick={() => dismissNotification(notif.id)}
                      className="text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 text-lg leading-none mt-0.5 shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Wishlist items */}
            {items.length > 0 ? (
              <div>
                <p className="px-4 py-2 text-[9px] font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500">
                  {ar ? "المحفوظة" : "Saved Items"}
                </p>
                {items.map((item) => (
                  <Link
                    key={item.productId}
                    href={`/product/${item.productId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-brand-black/30 transition-colors border-b border-gray-50 dark:border-brand-border/10 last:border-0"
                  >
                    {item.imageUrl && (
                      <div className="w-12 h-16 shrink-0"><ProductImage src={item.imageUrl} alt={item.nameEn} sizes="320px" /></div>
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className="text-xs font-bold text-brand-black dark:text-offwhite truncate">
                        {lang === "ar" && item.nameAr ? item.nameAr : item.nameEn}
                      </p>
                      <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                        EGP {item.price.toLocaleString("en-EG")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl mb-2">🤍</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {ar
                    ? "المفضلة فاضية — ابدأ أضف منتجات عشان تاخد تنبيهات لما ينزل خصم أو يقرب يخلص"
                    : "Your wishlist is empty — save items to get alerts on price drops & low stock"}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

"use client";
// src/components/CategoryFilter.tsx
// Feature 2: Grouped category navigation with dropdown subcategories

import { useState } from "react";
import { CATEGORY_GROUPS } from "@/lib/categories";
import { useLang } from "@/context/LanguageContext";

interface Props {
  activeCategory: string;
  onSelect: (key: string) => void;
  categories: string[];
}

export default function CategoryFilter({ activeCategory, onSelect, categories }: Props) {
  const { lang, isRTL } = useLang();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const availableCategories = new Set(categories);
  const visibleGroups = CATEGORY_GROUPS
    .map((group) => ({ ...group, subcategories: group.subcategories.filter((sub) => availableCategories.has(sub.key)) }))
    .filter((group) => group.subcategories.length > 0);

  const label = (en: string, ar: string) => (lang === "ar" ? ar : en);

  return (
    <nav
      dir={isRTL ? "rtl" : "ltr"}
      aria-label="Product categories"
      className="w-full"
    >
      {/* "All" pill */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => { onSelect("all"); setOpenGroup(null); }}
          className={`
            px-4 py-2 text-xs font-semibold tracking-widest uppercase
            border transition-all duration-200 rounded-sm
            active:scale-95
            ${activeCategory === "all"
              ? "bg-brand-black text-brand-accent dark:bg-offwhite dark:text-brand-black border-brand-black dark:border-offwhite"
              : "border-brand-border text-brand-muted hover:border-brand-black dark:hover:border-offwhite hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite"
            }
          `}
        >
          {label("All", "الكل")}
        </button>

        {visibleGroups.map((group) => (
          <div key={group.key} className="relative">
            {/* Group pill */}
            <button
              onClick={() =>
                setOpenGroup(openGroup === group.key ? null : group.key)
              }
              className={`
                flex items-center gap-1.5 px-4 py-2 text-xs font-semibold tracking-widest uppercase
                border transition-all duration-200 rounded-sm
                active:scale-95
                ${
                  activeCategory === group.key ||
                  group.subcategories.some((s) => s.key === activeCategory)
                    ? "bg-brand-black text-brand-accent dark:bg-offwhite dark:text-brand-black border-brand-black dark:border-offwhite"
                    : "border-brand-border text-brand-muted hover:border-brand-black dark:hover:border-offwhite hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite"
                }
              `}
              aria-expanded={openGroup === group.key}
            >
              <span>{group.icon}</span>
              <span>{label(group.label_en, group.label_ar)}</span>
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${
                  openGroup === group.key ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Subcategory dropdown */}
            {openGroup === group.key && (
              <div
                className={`
                  absolute top-full mt-1 z-20
                  ${isRTL ? "right-0" : "left-0"}
                  min-w-[160px] py-1
                  bg-white dark:bg-brand-gray
                  border border-brand-border dark:border-brand-border/30
                  shadow-lg rounded-sm
                  animate-fade-in
                `}
              >
                {/* "All [Group]" option */}
                <button
                  onClick={() => { onSelect(group.key); setOpenGroup(null); }}
                  className="
                    w-full px-4 py-2.5 text-xs text-start font-medium tracking-wider uppercase
                    text-brand-muted hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite
                    hover:bg-brand-border/30 dark:hover:bg-offwhite/5
                    transition-colors duration-150
                  "
                >
                  {label(`All ${group.label_en}`, `كل ${group.label_ar}`)}
                </button>
                <div className="border-t border-brand-border/30 my-1" />
                {group.subcategories.map((sub) => (
                  <button
                    key={sub.key}
                    onClick={() => { onSelect(sub.key); setOpenGroup(null); }}
                    className={`
                      w-full px-4 py-2.5 text-xs text-start font-medium tracking-wider
                      transition-colors duration-150
                      ${
                        activeCategory === sub.key
                          ? "text-brand-accent font-semibold bg-brand-black/5 dark:bg-offwhite/5"
                          : "text-brand-black dark:text-offwhite hover:bg-brand-border/30 dark:hover:bg-offwhite/5"
                      }
                    `}
                  >
                    {label(sub.label_en, sub.label_ar)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

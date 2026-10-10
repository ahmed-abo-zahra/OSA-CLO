"use client";
// src/components/FuzzySearch.tsx
// Feature 3: Advanced fuzzy search using Fuse.js

import { useState, useEffect, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import Image from "next/image";
import type { IFuseOptions, FuseResult } from "fuse.js";
import { useLang } from "@/context/LanguageContext";

export interface SearchableProduct {
  id: string;
  name_en: string;
  name_ar?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  category?: string | null;
  price?: number;
  selling_price?: number;
  image_url?: string | null;
}

interface Props {
  products: SearchableProduct[];
  onResultClick?: (product: SearchableProduct) => void;
  placeholder_en?: string;
  placeholder_ar?: string;
}

// Fuse.js configuration for fuzzy matching
const FUSE_OPTIONS: IFuseOptions<SearchableProduct> = {
  keys: [
    { name: "name_en",        weight: 0.4 },
    { name: "name_ar",        weight: 0.4 },
    { name: "description_en", weight: 0.1 },
    { name: "description_ar", weight: 0.1 },
    { name: "category",       weight: 0.2 },
  ],
  threshold: 0.4,      // 0 = exact, 1 = match anything
  distance: 100,
  minMatchCharLength: 2,
  includeScore: true,
  includeMatches: true,
};

export default function FuzzySearch({
  products,
  onResultClick,
  placeholder_en = "Search products...",
  placeholder_ar = "ابحث عن منتجات...",
}: Props) {
  const { lang, isRTL } = useLang();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FuseResult<SearchableProduct>[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build fuse index (memoized when products change)
  const fuse = useRef<Fuse<SearchableProduct>>(new Fuse(products, FUSE_OPTIONS));
  useEffect(() => {
    fuse.current = new Fuse(products, FUSE_OPTIONS);
  }, [products]);

  // Run search on query change
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    const found = fuse.current.search(trimmed).slice(0, 8);
    setResults(found);
    setIsOpen(found.length > 0);
    setHighlightIndex(-1);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback((product: SearchableProduct) => {
    setQuery(lang === "ar" ? product.name_ar || product.name_en : product.name_en);
    setIsOpen(false);
    onResultClick?.(product);
  }, [lang, onResultClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter" && highlightIndex >= 0) {
        e.preventDefault();
        const item = results[highlightIndex]?.item;
        if (item) handleSelect(item);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [isOpen, results, highlightIndex, handleSelect]
  );


  const placeholder = lang === "ar" ? placeholder_ar : placeholder_en;

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="relative w-full max-w-xl"
    >
      {/* Search input */}
      <div className="relative">
        {/* Search icon */}
        <div className={`absolute top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none ${isRTL ? "right-3" : "left-3"}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          dir={isRTL ? "rtl" : "ltr"}
          className={`
            w-full py-2.5 text-sm
            bg-white dark:bg-brand-gray
            border border-brand-border dark:border-brand-border/30
            text-brand-black dark:text-offwhite
            placeholder:text-brand-muted
            rounded-sm
            transition-all duration-200
            focus:outline-none focus:border-brand-black dark:focus:border-offwhite
            focus:shadow-[0_0_0_3px_rgba(200,255,0,0.15)]
            ${isRTL ? "pr-10 pl-4 text-right" : "pl-10 pr-4 text-left"}
          `}
        />

        {/* Clear button */}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setIsOpen(false); inputRef.current?.focus(); }}
            className={`absolute top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-black dark:text-offwhite dark:hover:text-offwhite transition-colors ${isRTL ? "left-3" : "right-3"}`}
            aria-label="Clear search"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="
            absolute top-full mt-1 w-full z-50
            bg-white dark:bg-brand-gray
            border border-brand-border dark:border-brand-border/30
            shadow-xl rounded-sm
            max-h-[360px] overflow-y-auto
            animate-fade-in
          "
          role="listbox"
        >
          {results.map((result, i) => {
            const p = result.item;
            const name = lang === "ar" && p.name_ar ? p.name_ar : p.name_en;

            return (
              <button
                key={p.id}
                role="option"
                aria-selected={highlightIndex === i}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => handleSelect(p)}
                className={`
                  w-full flex items-center gap-3 px-4 py-3
                  text-start text-sm
                  transition-colors duration-100
                  border-b border-brand-border/20 last:border-0
                  ${
                    highlightIndex === i
                      ? "bg-brand-accent/10 dark:bg-brand-accent/5"
                      : "hover:bg-brand-border/20 dark:hover:bg-offwhite/5"
                  }
                `}
              >
                {/* Product thumbnail */}
                {p.image_url ? (
                  <div className="w-10 h-10 rounded-sm overflow-hidden flex-shrink-0 bg-brand-border/30">
                    <Image
                      src={p.image_url}
                      alt={name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-sm bg-brand-border/30 flex-shrink-0" />
                )}

                {/* Name + category */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-brand-black dark:text-offwhite truncate">
                    {name}
                  </p>
                  {p.category && (
                    <p className="text-xs text-brand-muted mt-0.5 capitalize">{p.category}</p>
                  )}
                </div>

                {/* Price */}
                <p className="text-xs font-semibold text-brand-black dark:text-offwhite flex-shrink-0">
                  {(p.price || p.selling_price || 0).toLocaleString()} {lang === "ar" ? "ج.م" : "EGP"}
                </p>
              </button>
            );
          })}

          {/* Score indicator (small) */}
          <div className="px-4 py-2 border-t border-brand-border/20">
            <p className="text-[10px] text-brand-muted">
              {results.length} {lang === "ar" ? "نتيجة" : "result(s)"} for &quot;{query}&quot;
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

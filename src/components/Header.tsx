"use client";
// src/components/Navbar.tsx
// Features: 4 (micro-interactions), 6 (theme toggle), 8 (RTL + lang), 9 (mobile)

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import LangToggle from "./LangToggle";
import WishlistBell from "./WishlistBell";
import AnimatedNumber from "./AnimatedNumber";
import { useLang } from "@/context/LanguageContext";
import { useCart } from "@/context/CartContext";
import { usePathname } from "next/navigation";

export default function Header() {
  const { count: cartCount, setIsOpen } = useCart();
  const onCartClick = () => setIsOpen(true);
  const pathname = usePathname();

  const { t, isRTL } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setMobileOpen(false);};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[]);
  // Close mobile menu on resize
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (pathname?.startsWith("/admin")) return null;

  const navLinks = [
    { href: "/", label: t("nav_shop") },
    { href: "/#collections", label: t("nav_collections") },
    { href: "/track", label: t("nav_track") },
  ];

  return (
    <header
      dir={isRTL ? "rtl" : "ltr"}
      className={`
        fixed top-0 left-0 right-0 z-40
        transition-all duration-300
        ${scrolled
          ? "bg-offwhite/95 dark:bg-brand-black/95 backdrop-blur-md shadow-sm border-b border-brand-border/50 dark:border-brand-border/10"
          : "bg-transparent"
        }
      `}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex-shrink-0 active:scale-95 transition-transform duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          aria-label="ASO CLO Home"
        >
          <Image
            src="/aso-logo.png"
            alt="ASO CLO"
            width={80}
            height={32}
            className="h-auto w-[82px] sm:w-[118px] object-contain dark:invert"
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <ul className={`hidden md:flex items-center gap-8 ${isRTL ? "flex-row-reverse" : ""}`}>
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="
                  text-xs font-semibold tracking-widest uppercase
                  text-brand-black dark:text-offwhite
                  relative after:absolute after:-bottom-0.5 after:left-0 after:right-0
                  after:h-px after:bg-brand-accent
                  after:scale-x-0 hover:after:scale-x-100
                  after:transition-transform after:duration-300 after:origin-left
                  transition-colors duration-200
                  hover:text-brand-accent
                "
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side controls */}
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="hidden min-[400px]:block"><ThemeToggle /></div>
          <LangToggle />
          <WishlistBell />

          {/* Cart button */}
          <button
            onClick={onCartClick}
            aria-label={`${t("nav_cart")} (${cartCount})`}
            className="
              relative w-9 h-9 flex items-center justify-center rounded-sm
              text-brand-black dark:text-offwhite
              hover:bg-brand-black/5 dark:hover:bg-offwhite/10
              active:scale-95 transition-all duration-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent
            "
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-brand-accent text-brand-black text-[10px] font-bold flex items-center justify-center">
                {cartCount > 9 ? "9+" : <AnimatedNumber value={cartCount} duration={400} />}
              </span>
            )}
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={isRTL?"فتح القائمة":"Toggle menu"}
            aria-expanded={mobileOpen}
            className="
              md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1.5
              rounded-sm
              text-brand-black dark:text-offwhite
              hover:bg-brand-black/5 dark:hover:bg-offwhite/10
              active:scale-95 transition-all duration-200
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent
            "
          >
            <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`w-5 h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={`
          md:hidden overflow-hidden transition-all duration-300
          bg-offwhite dark:bg-brand-black
          border-b border-brand-border/50 dark:border-brand-border/10
          ${mobileOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"}
        `}
        aria-hidden={!mobileOpen}
        hidden={!mobileOpen}
      >
        <div className="min-[400px]:hidden px-4 pt-3"><ThemeToggle /></div>
        <ul className="px-4 py-4 flex flex-col gap-4" dir={isRTL ? "rtl" : "ltr"}>
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="
                  block text-sm font-semibold tracking-widest uppercase py-2
                  text-brand-black dark:text-offwhite
                  hover:text-brand-accent transition-colors duration-200
                  border-b border-brand-border/20 dark:border-brand-border/10
                "
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

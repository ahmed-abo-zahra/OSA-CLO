import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./transitions.css";
import DemoNotice from "@/components/DemoNotice";
import Header from "@/components/Header";
import { LanguageProvider } from "@/context/LanguageContext";
import { CartProvider } from "@/context/CartContext";
import { ToastProvider } from "@/context/ToastContext";
import CartDrawer from "@/components/storefront/CartDrawer";
import Analytics from "@/components/Analytics";
import PWAInstall from "@/components/PWAInstall";
import PageTransitionLoader from "@/components/PageTransitionLoader";

const cairo = localFont({ src: "./fonts/Cairo.ttf", variable: "--font-cairo", weight: "200 1000", display: "swap" });

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// ── Viewport (separate export — required in Next.js 14+) ─────────────────────
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1A1A1A",
};

// ── Metadata ─────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "ASO CLO — Premium Streetwear",
  description: "Discover the latest drops from ASO CLO. Minimalist streetwear crafted for the bold.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ASO CLO",
  },
};

import { ThemeProvider } from "@/providers/ThemeProvider";
import PromotionalPopup from "@/components/PromotionalPopup";
import { WishlistProvider } from "@/context/WishlistContext";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/aso-logo.png" />
      </head>
      <body
        className={`${cairo.variable} ${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-offwhite text-brand-black dark:bg-brand-black dark:text-offwhite transition-colors duration-300`}
        suppressHydrationWarning
      >
        <Analytics />

        <ThemeProvider>
          <LanguageProvider>
            <CartProvider>
              <WishlistProvider>
              <ToastProvider>
                {/* Feature 4: subtle branded background texture */}
                <div className="fixed inset-0 -z-10 pointer-events-none">
                  {/* Light mode: warm off-white with subtle grain */}
                  <div className="absolute inset-0 bg-offwhite dark:bg-brand-black" />
                  {/* Grain texture overlay */}
                  <div
                    className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "repeat",
                      backgroundSize: "128px",
                    }}
                  />
                  {/* Top-left accent glow */}
                  <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-accent/5 dark:bg-brand-accent/10 blur-3xl" />
                  {/* Bottom-right accent glow */}
                  <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-accent/5 dark:bg-brand-accent/10 blur-3xl" />
                </div>

                <PageTransitionLoader />
                <PromotionalPopup />
                <Header />
                <DemoNotice />
                <CartDrawer />
                <main className="min-h-screen page-content relative z-10">{children}</main>
                <PWAInstall />
              </ToastProvider>
              </WishlistProvider>
            </CartProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

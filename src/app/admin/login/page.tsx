"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useLanguage } from "@/context/LanguageContext";

const PARTNERS = ["Partner A", "Partner B", "Partner C"];

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang, isRTL } = useLanguage();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("admin.login.error.invalid"));
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch {
      setError(t("admin.login.error.network"));
      setLoading(false);
    }
  }

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4"
    >
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="text-[10px] font-bold tracking-widest uppercase border border-white/15
                       px-2.5 py-1 text-white/30 hover:text-white/70 hover:border-white/30
                       transition-all duration-200"
          >
            {lang === "en" ? "عربي" : "EN"}
          </button>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-white/8 p-10">
          {/* Logo */}
          <div className="flex justify-center mb-10">
            <div className="relative w-36 h-12">
              <Image
                src="/aso-logo.png"
                alt="ASO CLO"
                fill
                style={{ objectFit: "contain", filter: "invert(1)" }}
                priority
              />
            </div>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-white text-xl font-bold tracking-[-0.02em] mb-1">
              {t("admin.login.title")}
            </h1>
            <p className="text-white/35 text-sm">{t("admin.login.subtitle")}</p>
          </div>

          {/* Partner Quick Select */}
          <div className="flex gap-2 mb-6">
            {PARTNERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setName(p)}
                className={`flex-1 py-2 text-[11px] font-semibold tracking-widest uppercase
                  border transition-all duration-200
                  ${
                    name === p
                      ? "border-white text-white bg-white/8"
                      : "border-white/15 text-white/35 hover:border-white/30 hover:text-white/60"
                  }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Name field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-[0.1em] uppercase text-white/40">
                {t("admin.login.partnerLabel")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("admin.login.partnerPlaceholder")}
                required
                className="bg-white/5 border border-white/10 text-white placeholder-white/20
                           px-4 py-3 text-sm outline-none
                           focus:border-white/30 focus:bg-white/8
                           transition-all duration-200"
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-[0.1em] uppercase text-white/40">
                {t("admin.login.passwordLabel")}
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("admin.login.passwordPlaceholder")}
                  required
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-white/20
                             px-4 py-3 pr-10 text-sm outline-none
                             focus:border-white/30 focus:bg-white/8
                             transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPass
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 px-4 py-3">
                <p className="text-red-400 text-xs font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-white text-[#0A0A0A] py-3.5 text-[11px] font-bold
                         tracking-[0.2em] uppercase
                         hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-200"
            >
              {loading ? t("admin.login.loading") : t("admin.login.submitBtn")}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-white/15 text-[10px] tracking-widest uppercase mt-6">
          {t("admin.login.footer")}
        </p>
      </div>
    </div>
  );
}

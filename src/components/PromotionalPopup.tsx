"use client";
// src/components/PromotionalPopup.tsx
// Feature 7: Popup loaded from store_settings in Supabase

import { useState, useEffect } from "react";
import { useLang } from "@/context/LanguageContext";
import { DEMO_MODE } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";

interface PopupSettings {
  enabled: boolean;
  title_en: string;
  title_ar: string;
  message_en: string;
  message_ar: string;
  button_text_en: string;
  button_text_ar: string;
  button_link: string;
  bg_color: string;
  text_color: string;
}

export default function PromotionalPopup() {
  const { lang, isRTL } = useLang();
  const [settings, setSettings] = useState<PopupSettings | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if(DEMO_MODE)return;
    // Check if user already dismissed this session
    const dismissed = sessionStorage.getItem("popup_dismissed");
    if (dismissed) return;

    // Fetch popup settings from Supabase
    supabase
      .from("store_settings")
      .select("value")
      .eq("key", "promotional_popup")
      .single()
      .then(({ data }) => {
        if (data?.value) {
          const s = data.value as PopupSettings;
          if (s.enabled) {
            setSettings(s);
            // Small delay for page load
            setTimeout(() => setVisible(true), 1200);
          }
        }
      });
  }, []);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem("popup_dismissed", "1");
  };

  if (!visible || !settings) return null;

  const title   = lang === "ar" ? settings.title_ar   : settings.title_en;
  const message = lang === "ar" ? settings.message_ar : settings.message_en;
  const btnText = lang === "ar" ? settings.button_text_ar : settings.button_text_en;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={dismiss}
        aria-hidden
      />

      {/* Popup card */}
      <div
        dir={isRTL ? "rtl" : "ltr"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-title"
        className="
          fixed z-50
          top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
          w-[90vw] max-w-md
          rounded-sm shadow-2xl
          animate-popup-in
          overflow-hidden
        "
        style={{ backgroundColor: settings.bg_color, color: settings.text_color }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          className={`
            absolute top-3 z-10 p-1.5 rounded-sm
            hover:bg-black/10 active:scale-95
            transition-all duration-150
            ${isRTL ? "left-3" : "right-3"}
          `}
          aria-label="Close popup"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="p-8 flex flex-col items-center text-center gap-4">
          {/* Accent line */}
          <div className="w-12 h-0.5 bg-current opacity-30" />

          <h2
            id="popup-title"
            className="text-2xl font-bold tracking-tight"
          >
            {title}
          </h2>

          <p className="text-sm leading-relaxed opacity-80 max-w-xs">
            {message}
          </p>

          {/* CTA button */}
          <a
            href={settings.button_link}
            onClick={dismiss}
            className="
              mt-2 px-8 py-3 text-sm font-bold tracking-widest uppercase
              bg-current text-inherit
              border-2 border-current
              rounded-sm
              hover:opacity-80 active:scale-95
              transition-all duration-200
              ripple-container
            "
            style={{
              backgroundColor: settings.text_color,
              color: settings.bg_color,
            }}
          >
            {btnText}
          </a>

          {/* Dismiss link */}
          <button
            onClick={dismiss}
            className="text-xs opacity-50 hover:opacity-80 underline underline-offset-2 transition-opacity"
          >
            {lang === "ar" ? "لا شكراً، ربما لاحقاً" : "No thanks, maybe later"}
          </button>
        </div>
      </div>
    </>
  );
}

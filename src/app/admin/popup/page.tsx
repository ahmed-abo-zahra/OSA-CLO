"use client";
// src/app/admin/popup/page.tsx
// Feature 7: Admin page to manage the promotional popup

import { useState, useEffect } from "react";


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

const DEFAULT: PopupSettings = {
  enabled: false,
  title_en: "🔥 Special Offer!",
  title_ar: "🔥 عرض خاص!",
  message_en: "Get 20% off your first order. Use code: WELCOME20",
  message_ar: "احصل على خصم 20% على أول طلب. استخدم الكود: WELCOME20",
  button_text_en: "Shop Now",
  button_text_ar: "تسوق الآن",
  button_link: "/",
  bg_color: "#C8FF00",
  text_color: "#0A0A0A",
};

export default function AdminPopupPage() {
  const [settings, setSettings] = useState<PopupSettings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings').then(r=>r.json()).then(data=>{if(data.value)setSettings(data.value);}).finally(()=>setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const response = await fetch('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
    const error = !response.ok;
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const field = (
    key: keyof PopupSettings,
    label: string,
    type: "text" | "color" | "textarea" = "text"
  ) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold tracking-widest uppercase text-brand-muted">
        {label}
      </label>
      {type === "textarea" ? (
        <textarea
          value={settings[key] as string}
          onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
          rows={3}
          className="
            px-3 py-2.5 text-sm rounded-sm
            bg-white dark:bg-brand-black
            border border-brand-border dark:border-brand-border/30
            text-brand-black dark:text-offwhite
            focus:outline-none focus:border-brand-black dark:focus:border-offwhite
            resize-none
          "
        />
      ) : type === "color" ? (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={settings[key] as string}
            onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            className="w-10 h-10 rounded-sm border border-brand-border cursor-pointer"
          />
          <input
            type="text"
            value={settings[key] as string}
            onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
            className="
              flex-1 px-3 py-2.5 text-sm rounded-sm font-mono
              bg-white dark:bg-brand-black
              border border-brand-border dark:border-brand-border/30
              text-brand-black dark:text-offwhite
              focus:outline-none focus:border-brand-black
            "
          />
        </div>
      ) : (
        <input
          type="text"
          value={settings[key] as string}
          onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
          className="
            px-3 py-2.5 text-sm rounded-sm
            bg-white dark:bg-brand-black
            border border-brand-border dark:border-brand-border/30
            text-brand-black dark:text-offwhite
            focus:outline-none focus:border-brand-black dark:focus:border-offwhite
          "
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-brand-black dark:text-offwhite tracking-tight">
            Promotional Popup
          </h1>
          <p className="text-sm text-brand-muted mt-1">
            Manage the storefront promotional popup shown to visitors.
          </p>
        </div>

        {/* Enable / Disable toggle */}
        <button
          onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
          className={`
            flex items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-widest uppercase
            rounded-sm border transition-all duration-200 active:scale-95
            ${settings.enabled
              ? "bg-green-500 text-white border-green-500"
              : "bg-brand-border/30 text-brand-muted border-brand-border"
            }
          `}
        >
          <span className={`w-2 h-2 rounded-full ${settings.enabled ? "bg-white" : "bg-brand-muted"}`} />
          {settings.enabled ? "Popup ENABLED" : "Popup DISABLED"}
        </button>
      </div>

      {/* Form */}
      <div className="space-y-5 p-6 bg-white dark:bg-brand-gray border border-brand-border dark:border-brand-border/20 rounded-sm">
        <h2 className="text-sm font-bold tracking-widest uppercase text-brand-black dark:text-offwhite">
          English Content
        </h2>
        {field("title_en", "Title (EN)", "text")}
        {field("message_en", "Message (EN)", "textarea")}
        {field("button_text_en", "Button Text (EN)", "text")}
      </div>

      <div className="space-y-5 p-6 bg-white dark:bg-brand-gray border border-brand-border dark:border-brand-border/20 rounded-sm" dir="rtl">
        <h2 className="text-sm font-bold tracking-widest uppercase text-brand-black dark:text-offwhite">
          المحتوى بالعربي
        </h2>
        {field("title_ar", "العنوان (AR)", "text")}
        {field("message_ar", "الرسالة (AR)", "textarea")}
        {field("button_text_ar", "نص الزر (AR)", "text")}
      </div>

      <div className="space-y-5 p-6 bg-white dark:bg-brand-gray border border-brand-border dark:border-brand-border/20 rounded-sm">
        <h2 className="text-sm font-bold tracking-widest uppercase text-brand-black dark:text-offwhite">
          Style & Link
        </h2>
        {field("button_link", "Button Link (URL)", "text")}
        {field("bg_color", "Background Color", "color")}
        {field("text_color", "Text Color", "color")}
      </div>

      {/* Live Preview */}
      <button
        onClick={() => setPreviewOpen(true)}
        className="
          w-full py-3 text-sm font-bold tracking-widest uppercase
          border border-brand-border dark:border-brand-border/30
          text-brand-black dark:text-offwhite
          hover:border-brand-black dark:hover:border-offwhite
          active:scale-95 transition-all duration-200 rounded-sm
        "
      >
        Preview Popup
      </button>

      {/* Save button */}
      <button
        onClick={save}
        disabled={saving}
        className="
          w-full py-3.5 text-sm font-bold tracking-widest uppercase
          bg-brand-black dark:bg-offwhite
          text-offwhite dark:text-brand-black
          hover:bg-brand-accent hover:text-brand-black
          active:scale-95 transition-all duration-200 rounded-sm
          disabled:opacity-50 disabled:cursor-not-allowed
          ripple-container
        "
      >
        {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
      </button>

      {/* Preview modal */}
      {previewOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setPreviewOpen(false)}
          />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md rounded-sm shadow-2xl overflow-hidden animate-popup-in"
            style={{ backgroundColor: settings.bg_color, color: settings.text_color }}
          >
            <button
              onClick={() => setPreviewOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-sm hover:bg-black/10 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-12 h-0.5 bg-current opacity-30" />
              <h2 className="text-2xl font-bold">{settings.title_en}</h2>
              <p className="text-sm opacity-80 max-w-xs">{settings.message_en}</p>
              <div
                className="mt-2 px-8 py-3 text-sm font-bold tracking-widest uppercase rounded-sm"
                style={{ backgroundColor: settings.text_color, color: settings.bg_color }}
              >
                {settings.button_text_en}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

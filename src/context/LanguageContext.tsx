"use client";
// src/context/LanguageContext.tsx
// Feature 8: i18n + RTL/LTR switching

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { translations, Lang, TranslationKey } from "@/i18n/translations";
import { translate } from "../i18n";

interface LanguageContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey) => string;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  // On mount: read from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lang") as Lang | null;
    if (saved === "ar" || saved === "en") {
      setLang(saved);
    }
  }, []);

  // Whenever lang changes: update <html> dir + lang + localStorage
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    localStorage.setItem("lang", lang);
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === "en" ? "ar" : "en"));
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const primary = (translations[lang] as Record<string,string>)[key];
      return primary ?? translate(lang,key);
    },
    [lang]
  );

  return (
    <LanguageContext.Provider
      value={{
        lang,
        dir: lang === "ar" ? "rtl" : "ltr",
        t,
        toggleLang,
        setLang, // backward compatibility
        isRTL: lang === "ar",
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be inside LanguageProvider");
  return ctx;
}

export const useLanguage = useLang;

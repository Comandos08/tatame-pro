import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";
import { ptBR } from "@/locales/pt-BR";
import { en } from "@/locales/en";
import { es } from "@/locales/es";

export type Locale = "pt-BR" | "en" | "es";

const translations: Record<Locale, Record<string, string>> = {
  "pt-BR": ptBR,
  en,
  es,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const GLOBAL_STORAGE_KEY = "tatame-locale";

function getTenantSlugFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const match = path.match(/^\/([^\/]+)/);
  if (match && match[1] && !["admin", "login", "forgot-password", "reset-password"].includes(match[1])) {
    return match[1];
  }
  return null;
}

function getStorageKey(tenantSlug: string | null): string {
  return tenantSlug ? `tatame-locale-${tenantSlug}` : GLOBAL_STORAGE_KEY;
}

function getDefaultLocale(tenantSlug: string | null): Locale {
  if (typeof window !== "undefined") {
    // First check tenant-specific storage
    if (tenantSlug) {
      const tenantStored = localStorage.getItem(getStorageKey(tenantSlug));
      if (tenantStored && ["pt-BR", "en", "es"].includes(tenantStored)) {
        return tenantStored as Locale;
      }
    }

    // Then check global storage
    const globalStored = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (globalStored && ["pt-BR", "en", "es"].includes(globalStored)) {
      return globalStored as Locale;
    }
  }

  // Check browser language
  if (typeof navigator !== "undefined") {
    const browserLang = navigator.language;
    if (browserLang.startsWith("pt")) return "pt-BR";
    if (browserLang.startsWith("es")) return "es";
    if (browserLang.startsWith("en")) return "en";
  }

  return "pt-BR";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const tenantSlug = useMemo(() => getTenantSlugFromPath(), []);
  const [locale, setLocaleState] = useState<Locale>(() => getDefaultLocale(tenantSlug));

  const setLocale = useCallback((newLocale: Locale) => {
    // Save to tenant-specific key if on a tenant page
    const currentTenantSlug = getTenantSlugFromPath();
    if (currentTenantSlug) {
      localStorage.setItem(getStorageKey(currentTenantSlug), newLocale);
    }
    // Always also save to global key
    localStorage.setItem(GLOBAL_STORAGE_KEY, newLocale);
    setLocaleState(newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      let value = translations[locale]?.[key] ?? translations["pt-BR"]?.[key];

      if (!value) {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] Missing key "${key}" for locale "${locale}"`);
        }
        return key;
      }

      // Interpolação simples: substitui {placeholder} por params.placeholder
      if (params) {
        Object.entries(params).forEach(([paramKey, paramValue]) => {
          value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
        });
      }

      return value;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    // Return a safe fallback for server-side or during initial render
    console.warn("useI18n called outside I18nProvider, returning fallback");
    return {
      locale: "pt-BR" as Locale,
      setLocale: () => {},
      t: (key: string, _params?: Record<string, string>) => key,
    };
  }
  return context;
}

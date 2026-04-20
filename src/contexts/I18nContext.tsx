import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { logger } from '@/lib/logger';
import { ptBR } from "@/locales/pt-BR";
import { type AppLocale } from "@/lib/i18n/formatters";

/** Alias para compatibilidade — fonte canônica é AppLocale em formatters.ts */
export type Locale = AppLocale;

/**
 * Locale loading strategy:
 *   - pt-BR is bundled eagerly (default + fallback). Every `t()` call resolves
 *     against it as a safety net, so missing keys in another locale never
 *     produce raw key strings to the user.
 *   - en and es are dynamically imported the first time they're requested and
 *     cached in-module afterwards. This saves ~320 KB from the initial JS
 *     payload for Portuguese users (the majority of our traffic).
 */
const lazyLocaleLoaders: Record<Exclude<Locale, "pt-BR">, () => Promise<Record<string, string>>> = {
  en: () => import("@/locales/en").then((m) => m.en),
  es: () => import("@/locales/es").then((m) => m.es),
};

const localeCache: Partial<Record<Locale, Record<string, string>>> = {
  "pt-BR": ptBR,
};

async function loadLocaleBundle(locale: Locale): Promise<Record<string, string>> {
  const cached = localeCache[locale];
  if (cached) return cached;

  if (locale === "pt-BR") return ptBR;

  const loader = lazyLocaleLoaders[locale];
  if (!loader) return ptBR;

  try {
    const translations = await loader();
    localeCache[locale] = translations;
    return translations;
  } catch (err) {
    logger.error(`[i18n] Failed to load locale "${locale}", falling back to pt-BR`, err);
    return ptBR;
  }
}

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
  const match = path.match(/^\/([^/]+)/);
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
  // Compute tenantSlug at mount time — setLocale recalculates dynamically
  const [locale, setLocaleState] = useState<Locale>(() => getDefaultLocale(getTenantSlugFromPath()));
  const [activeTranslations, setActiveTranslations] = useState<Record<string, string>>(() => {
    // Start with pt-BR so the first render always has a translation table; the
    // effect below upgrades to the user's preferred locale once its chunk loads.
    return ptBR;
  });

  // Track the latest locale load so a slow en/es chunk doesn't overwrite a
  // newer switch back to pt-BR.
  const latestLoadId = useRef(0);

  useEffect(() => {
    const loadId = ++latestLoadId.current;
    loadLocaleBundle(locale).then((translations) => {
      if (latestLoadId.current === loadId) {
        setActiveTranslations(translations);
      }
    });
  }, [locale]);

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
      let value = activeTranslations[key] ?? ptBR[key];

      if (!value) {
        logger.warn(`[i18n] Missing key "${key}" for locale "${locale}"`);
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
    [locale, activeTranslations],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    // Return a safe fallback for server-side or during initial render
    logger.warn("useI18n called outside I18nProvider, returning fallback");
    return {
      locale: "pt-BR" as Locale,
      setLocale: () => {},
      t: (key: string, _params?: Record<string, string>) => key,
    };
  }
  return context;
}

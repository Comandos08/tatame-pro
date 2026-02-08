/**
 * 🌐 I18n Formatting Utilities
 * PI-P7.1: Centralização de formatação de datas e moedas
 * 
 * SAFE GOLD: Todos os formatadores usam locale do contexto i18n.
 * PROIBIDO: Hardcode de 'pt-BR', 'R$' ou qualquer locale fixo.
 */

export type LocaleCode = 'pt-BR' | 'en' | 'es';

// Mapear locale do app para Intl locale
const INTL_LOCALE_MAP: Record<LocaleCode, string> = {
  'pt-BR': 'pt-BR',
  'en': 'en-US',
  'es': 'es-ES',
};

/**
 * Obtém o locale Intl a partir do locale do app
 */
export function getIntlLocale(appLocale: LocaleCode | string): string {
  return INTL_LOCALE_MAP[appLocale as LocaleCode] || 'pt-BR';
}

/**
 * Formata data usando locale dinâmico
 * @param date - Date, string ISO, ou timestamp
 * @param locale - Locale do app (pt-BR, en, es)
 * @param options - Opções de formatação (dateStyle: 'short' | 'medium' | 'long')
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  locale: LocaleCode | string,
  options: { dateStyle?: 'short' | 'medium' | 'long' } = { dateStyle: 'medium' }
): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: options.dateStyle,
    }).format(dateObj);
  } catch {
    return '-';
  }
}

/**
 * Formata data e hora usando locale dinâmico
 */
export function formatDateTime(
  date: Date | string | number | null | undefined,
  locale: LocaleCode | string,
  options: { 
    dateStyle?: 'short' | 'medium' | 'long';
    timeStyle?: 'short' | 'medium' | 'long';
  } = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (!date) return '-';
  
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    if (isNaN(dateObj.getTime())) return '-';
    
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: options.dateStyle,
      timeStyle: options.timeStyle,
    }).format(dateObj);
  } catch {
    return '-';
  }
}

/**
 * Formata valor monetário usando locale dinâmico
 * @param amountMinor - Valor em centavos/unidades menores
 * @param locale - Locale do app
 * @param currency - Código da moeda (default: BRL)
 */
export function formatCurrency(
  amountMinor: number | null | undefined,
  locale: LocaleCode | string,
  currency: string = 'BRL'
): string {
  if (amountMinor === null || amountMinor === undefined) return '-';
  
  try {
    const amount = amountMinor / 100;
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return '-';
  }
}

/**
 * Formata número usando locale dinâmico
 */
export function formatNumber(
  value: number | null | undefined,
  locale: LocaleCode | string,
  options?: Intl.NumberFormatOptions
): string {
  if (value === null || value === undefined) return '-';
  
  try {
    return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Formata tempo relativo (ex: "há 5 min", "2 days ago")
 */
export function formatRelativeTime(
  dateStr: string | Date,
  locale: LocaleCode | string
): string {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const intlLocale = getIntlLocale(locale);

  // Use Intl.RelativeTimeFormat when available
  try {
    const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });
    
    if (diffMins < 60) {
      return rtf.format(-diffMins, 'minute');
    }
    if (diffHours < 24) {
      return rtf.format(-diffHours, 'hour');
    }
    if (diffDays < 7) {
      return rtf.format(-diffDays, 'day');
    }
  } catch {
    // Fallback to formatDate
  }

  return formatDate(date, locale);
}

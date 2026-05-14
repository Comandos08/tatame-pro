import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getIntlLocale,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  formatRelativeTime,
} from './formatters';

// ============================================================================
// getIntlLocale — locale resolution
// ============================================================================

describe('getIntlLocale', () => {
  it('maps pt-BR to pt-BR', () => {
    expect(getIntlLocale('pt-BR')).toBe('pt-BR');
  });

  it('maps en to en-US', () => {
    expect(getIntlLocale('en')).toBe('en-US');
  });

  it('maps es to es-ES', () => {
    expect(getIntlLocale('es')).toBe('es-ES');
  });

  it('falls back to pt-BR for unknown locale', () => {
    expect(getIntlLocale('zh-CN')).toBe('pt-BR');
    expect(getIntlLocale('')).toBe('pt-BR');
  });
});

// ============================================================================
// formatDate — defensive null/invalid handling
// ============================================================================

describe('formatDate', () => {
  it('returns "-" for null', () => {
    expect(formatDate(null, 'pt-BR')).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined, 'pt-BR')).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(formatDate('', 'pt-BR')).toBe('-');
  });

  it('returns "-" for unparseable string', () => {
    expect(formatDate('not-a-date', 'pt-BR')).toBe('-');
  });

  it('returns "-" for Invalid Date object', () => {
    expect(formatDate(new Date('not-a-date'), 'pt-BR')).toBe('-');
  });

  it('formats a valid ISO string', () => {
    // Use Z-suffix for unambiguous UTC parsing across runtimes
    const result = formatDate('2026-01-15T12:00:00.000Z', 'pt-BR');
    expect(result).not.toBe('-');
    expect(result.length).toBeGreaterThan(0);
    // Year should appear in the output for medium style
    expect(result).toContain('2026');
  });

  it('formats a Date instance', () => {
    const date = new Date('2026-06-10T12:00:00.000Z');
    expect(formatDate(date, 'pt-BR')).toContain('2026');
  });

  it('formats a numeric timestamp', () => {
    // 2026-01-01 UTC
    const ts = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(formatDate(ts, 'pt-BR')).toContain('2026');
  });

  it('respects locale (different output for pt-BR vs en)', () => {
    const ptBR = formatDate('2026-03-15T12:00:00.000Z', 'pt-BR');
    const en = formatDate('2026-03-15T12:00:00.000Z', 'en');
    expect(ptBR).not.toBe(en);
  });

  it('supports short dateStyle option', () => {
    const long = formatDate('2026-03-15T12:00:00.000Z', 'pt-BR', { dateStyle: 'long' });
    const short = formatDate('2026-03-15T12:00:00.000Z', 'pt-BR', { dateStyle: 'short' });
    // long form should be at least as wide as short form
    expect(long.length).toBeGreaterThanOrEqual(short.length);
  });
});

// ============================================================================
// formatDateTime — defensive + time formatting
// ============================================================================

describe('formatDateTime', () => {
  it('returns "-" for null / undefined / empty / invalid', () => {
    expect(formatDateTime(null, 'pt-BR')).toBe('-');
    expect(formatDateTime(undefined, 'pt-BR')).toBe('-');
    expect(formatDateTime('', 'pt-BR')).toBe('-');
    expect(formatDateTime('bogus', 'pt-BR')).toBe('-');
  });

  it('includes a time component in the output', () => {
    const result = formatDateTime('2026-03-15T14:30:00.000Z', 'pt-BR');
    expect(result).not.toBe('-');
    // Must include a colon — a time stamp always has one
    expect(result).toContain(':');
  });

  it('produces different output than formatDate for the same input', () => {
    const input = '2026-03-15T14:30:00.000Z';
    expect(formatDateTime(input, 'pt-BR')).not.toBe(formatDate(input, 'pt-BR'));
  });
});

// ============================================================================
// formatCurrency — defensive + locale
// ============================================================================

describe('formatCurrency', () => {
  it('returns "-" for null', () => {
    expect(formatCurrency(null, 'pt-BR')).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatCurrency(undefined, 'pt-BR')).toBe('-');
  });

  it('returns "-" for invalid currency code', () => {
    // Intl.NumberFormat throws RangeError on invalid currency codes.
    // The catch swallows it and returns '-'.
    expect(formatCurrency(15000, 'pt-BR', 'NOT_A_CURRENCY')).toBe('-');
  });

  it('formats zero correctly (does not collapse to "-")', () => {
    const out = formatCurrency(0, 'pt-BR');
    expect(out).not.toBe('-');
    // pt-BR formats 0 as "R$ 0,00" but the actual non-breaking space is
    // version-dependent. Assert the digits land somewhere.
    expect(out).toMatch(/0[,.]00/);
  });

  it('treats input as minor units (centavos)', () => {
    // 15000 cents = 150.00 BRL
    const out = formatCurrency(15000, 'pt-BR');
    expect(out).toMatch(/150[,.]00/);
  });

  it('handles negative amounts', () => {
    const out = formatCurrency(-15000, 'pt-BR');
    expect(out).toMatch(/150/);
    expect(out).toMatch(/-|\(/); // minus sign or accounting parens
  });

  it('honors USD currency override', () => {
    const out = formatCurrency(12345, 'en', 'USD');
    expect(out).toContain('$');
    expect(out).toMatch(/123\.45|123,45/);
  });

  it('defaults to BRL when currency omitted', () => {
    const out = formatCurrency(10000, 'pt-BR');
    expect(out).toMatch(/R\$|BRL/);
  });
});

// ============================================================================
// formatNumber — defensive + options pass-through
// ============================================================================

describe('formatNumber', () => {
  it('returns "-" for null / undefined', () => {
    expect(formatNumber(null, 'pt-BR')).toBe('-');
    expect(formatNumber(undefined, 'pt-BR')).toBe('-');
  });

  it('formats zero as "0", not "-"', () => {
    expect(formatNumber(0, 'pt-BR')).toBe('0');
  });

  it('formats large numbers with thousand separators per locale', () => {
    const ptBR = formatNumber(1234567, 'pt-BR');
    const en = formatNumber(1234567, 'en');
    // pt-BR uses dot, en-US uses comma. Either way the separator differs.
    expect(ptBR).not.toBe(en);
    expect(ptBR).toMatch(/1[.\s]234[.\s]567/);
  });

  it('passes through Intl options (percent)', () => {
    const out = formatNumber(0.42, 'pt-BR', { style: 'percent' });
    expect(out).toContain('%');
    expect(out).toMatch(/42/);
  });

  it('passes through Intl options (minimumFractionDigits)', () => {
    const out = formatNumber(3, 'en', { minimumFractionDigits: 2 });
    expect(out).toBe('3.00');
  });
});

// ============================================================================
// formatRelativeTime — defensive null handling + bucketing
// ============================================================================

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Pin "now" to a stable instant so the diffs are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "-" for null', () => {
    expect(formatRelativeTime(null, 'pt-BR')).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatRelativeTime(undefined, 'pt-BR')).toBe('-');
  });

  it('returns "-" for unparseable string', () => {
    expect(formatRelativeTime('not-a-date', 'pt-BR')).toBe('-');
  });

  it('returns "-" for Invalid Date object', () => {
    expect(formatRelativeTime(new Date('garbage'), 'pt-BR')).toBe('-');
  });

  it('reports minutes when diff < 60 minutes', () => {
    // 5 minutes ago
    const out = formatRelativeTime('2026-05-14T11:55:00.000Z', 'en');
    // English Intl.RelativeTimeFormat with numeric:auto for -5 minutes:
    // "5 minutes ago"
    expect(out).toMatch(/minute/);
  });

  it('reports hours when 1 <= diff < 24 hours', () => {
    const out = formatRelativeTime('2026-05-14T07:00:00.000Z', 'en'); // 5h ago
    expect(out).toMatch(/hour/);
  });

  it('reports days when 1 <= diff < 7 days', () => {
    const out = formatRelativeTime('2026-05-12T12:00:00.000Z', 'en'); // 2d ago
    expect(out).toMatch(/day|yesterday/i);
  });

  it('falls back to absolute date when diff >= 7 days', () => {
    const out = formatRelativeTime('2026-04-01T12:00:00.000Z', 'pt-BR');
    // Should look like a formatDate output (contains a year), not "há X dias"
    expect(out).toContain('2026');
  });

  it('accepts a Date instance as well as a string', () => {
    const someDate = new Date('2026-05-14T11:55:00.000Z'); // 5 min ago
    const fromDate = formatRelativeTime(someDate, 'en');
    const fromIso = formatRelativeTime(someDate.toISOString(), 'en');
    expect(fromDate).toBe(fromIso);
  });
});

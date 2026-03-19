/**
 * safeStripeRedirect — Security Unit Tests
 *
 * Validates the open-redirect prevention logic:
 * - Allows only *.stripe.com HTTPS URLs
 * - Blocks all other domains (open redirect prevention)
 * - Blocks HTTP protocol (downgrade attack prevention)
 * - Handles malformed / empty URLs gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the logger before importing the module under test
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { safeStripeRedirect } from '@/lib/stripeRedirect';
import { logger } from '@/lib/logger';

describe('safeStripeRedirect', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Mock window.location.href setter
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  // ── Allow cases ─────────────────────────────────────────────────────────────

  it('allows checkout.stripe.com HTTPS', () => {
    const url = 'https://checkout.stripe.com/pay/cs_test_abc123';
    const result = safeStripeRedirect(url);
    expect(result).toBe(true);
    expect(window.location.href).toBe(url);
  });

  it('allows billing.stripe.com HTTPS', () => {
    const url = 'https://billing.stripe.com/p/session/live_123';
    const result = safeStripeRedirect(url);
    expect(result).toBe(true);
    expect(window.location.href).toBe(url);
  });

  it('allows any subdomain of stripe.com HTTPS', () => {
    const url = 'https://api.stripe.com/v1/something';
    const result = safeStripeRedirect(url);
    expect(result).toBe(true);
  });

  // ── Block cases — wrong domain ────────────────────────────────────────────

  it('blocks redirect to non-Stripe domain', () => {
    const result = safeStripeRedirect('https://evil.com/steal');
    expect(result).toBe(false);
    expect(window.location.href).toBe('');
    expect(logger.error).toHaveBeenCalledWith(
      '[SECURITY] Blocked non-Stripe redirect:',
      'evil.com'
    );
  });

  it('blocks redirect to domain that ends with stripe.com but is not stripe.com', () => {
    // e.g. evilstripe.com — does NOT end with .stripe.com
    const result = safeStripeRedirect('https://evilstripe.com/pay');
    expect(result).toBe(false);
  });

  it('blocks redirect to domain that contains stripe.com in path, not hostname', () => {
    const result = safeStripeRedirect('https://evil.com/stripe.com/pay');
    expect(result).toBe(false);
  });

  it('blocks redirect to localhost', () => {
    const result = safeStripeRedirect('https://localhost/pay');
    expect(result).toBe(false);
  });

  it('blocks redirect to 0.0.0.0', () => {
    const result = safeStripeRedirect('https://0.0.0.0/pay');
    expect(result).toBe(false);
  });

  // ── Block cases — wrong protocol ──────────────────────────────────────────

  it('blocks HTTP stripe.com redirect (protocol downgrade)', () => {
    const result = safeStripeRedirect('http://checkout.stripe.com/pay/cs_test');
    expect(result).toBe(false);
    expect(window.location.href).toBe('');
    expect(logger.error).toHaveBeenCalledWith('[SECURITY] Blocked non-HTTPS Stripe redirect');
  });

  it('blocks ftp stripe.com redirect', () => {
    const result = safeStripeRedirect('ftp://checkout.stripe.com/pay');
    expect(result).toBe(false);
  });

  // ── Block cases — null / empty / malformed ────────────────────────────────

  it('returns false for null', () => {
    expect(safeStripeRedirect(null)).toBe(false);
    expect(window.location.href).toBe('');
  });

  it('returns false for undefined', () => {
    expect(safeStripeRedirect(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(safeStripeRedirect('')).toBe(false);
  });

  it('returns false and logs error for malformed URL', () => {
    const result = safeStripeRedirect('not-a-url');
    expect(result).toBe(false);
    expect(logger.error).toHaveBeenCalledWith('[SECURITY] Invalid redirect URL');
  });

  it('returns false for javascript: protocol (XSS vector)', () => {
    // javascript: is not a valid URL for new URL(), throws — caught by catch
    const result = safeStripeRedirect('javascript:alert(1)');
    // Either blocked as malformed or as non-stripe — must never redirect
    expect(result).toBe(false);
    expect(window.location.href).toBe('');
  });

  it('returns false for data: URL (XSS vector)', () => {
    const result = safeStripeRedirect('data:text/html,<script>alert(1)</script>');
    expect(result).toBe(false);
    expect(window.location.href).toBe('');
  });

  // ── No side effects on block ───────────────────────────────────────────────

  it('never sets window.location.href when blocked', () => {
    const urls = [
      'https://evil.com',
      'http://checkout.stripe.com',
      null,
      undefined,
      '',
      'not-a-url',
    ] as const;

    for (const url of urls) {
      window.location.href = '';
      safeStripeRedirect(url);
      expect(window.location.href).toBe('');
    }
  });
});

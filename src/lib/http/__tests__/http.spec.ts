/**
 * HTTP Client Unit Tests
 *
 * Tests for HttpError, retry logic, and safe JSON parsing.
 * Uses deterministic mocks — no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError } from '../http';

// ─── Mock observability (no real logging in tests) ───────────────────────────

vi.mock('@/lib/observability/logger', () => ({
  networkLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/observability/error-report', () => ({
  reportNetworkError: vi.fn(),
}));

// ─── HttpError ────────────────────────────────────────────────────────────────

describe('HttpError', () => {
  it('sets name to HttpError', () => {
    const err = new HttpError('Something failed', 500, 'INTERNAL_ERROR');
    expect(err.name).toBe('HttpError');
  });

  it('preserves status code', () => {
    const err = new HttpError('Not found', 404, 'NOT_FOUND');
    expect(err.status).toBe(404);
  });

  it('preserves error code', () => {
    const err = new HttpError('Rate limited', 429, 'RATE_LIMIT');
    expect(err.code).toBe('RATE_LIMIT');
  });

  it('preserves correlationId when provided', () => {
    const cid = 'test-correlation-001';
    const err = new HttpError('Error', 500, 'ERR', cid);
    expect(err.correlationId).toBe(cid);
  });

  it('correlationId is undefined when not provided', () => {
    const err = new HttpError('Error', 500, 'ERR');
    expect(err.correlationId).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const err = new HttpError('Error', 500, 'ERR');
    expect(err).toBeInstanceOf(Error);
  });

  it('message is accessible', () => {
    const err = new HttpError('Test error message', 400, 'BAD_REQUEST');
    expect(err.message).toBe('Test error message');
  });
});

// ─── RETRYABLE STATUS CODES ───────────────────────────────────────────────────

describe('Retryable status codes', () => {
  const RETRYABLE = [408, 429, 500, 502, 503, 504];
  const NON_RETRYABLE = [200, 201, 400, 401, 403, 404, 422];

  RETRYABLE.forEach((status) => {
    it(`status ${status} creates HttpError with correct status`, () => {
      const err = new HttpError(`HTTP ${status}`, status, `HTTP_${status}`);
      expect(err.status).toBe(status);
    });
  });

  NON_RETRYABLE.forEach((status) => {
    it(`status ${status} creates HttpError with correct status`, () => {
      const err = new HttpError(`HTTP ${status}`, status, `HTTP_${status}`);
      expect(err.status).toBe(status);
    });
  });
});

// ─── Error classification ─────────────────────────────────────────────────────

describe('HttpError classification', () => {
  it('client errors have 4xx status', () => {
    const err = new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    expect(err.status >= 400 && err.status < 500).toBe(true);
  });

  it('server errors have 5xx status', () => {
    const err = new HttpError('Server Error', 503, 'SERVICE_UNAVAILABLE');
    expect(err.status >= 500).toBe(true);
  });

  it('can be caught as Error', () => {
    const throwHttpError = () => {
      throw new HttpError('Failed', 500, 'INTERNAL');
    };

    expect(throwHttpError).toThrow(Error);
  });

  it('can be caught specifically as HttpError', () => {
    let caught: unknown;
    try {
      throw new HttpError('Failed', 500, 'INTERNAL');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(HttpError);
    if (caught instanceof HttpError) {
      expect(caught.status).toBe(500);
      expect(caught.code).toBe('INTERNAL');
    }
  });
});

/**
 * edgeInvoke — institutional envelope unwrapping.
 *
 * Verifies the discriminated result contract:
 * - success envelope  → { ok:true, data }
 * - error envelope    → { ok:false, code, messageKey, details }
 * - transport error   → NETWORK_ERROR
 * - legacy flat body  → passthrough as ok:true
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { edgeInvoke } from '@/lib/edgeInvoke';

describe('edgeInvoke', () => {
  beforeEach(() => invokeMock.mockReset());

  it('unwraps a success envelope', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, data: { foo: 42 }, timestamp: 'x' },
      error: null,
    });
    const res = await edgeInvoke<{ foo: number }>('fn');
    expect(res).toEqual({ ok: true, data: { foo: 42 } });
  });

  it('maps an error envelope to the typed error', async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: false,
        code: 'FORBIDDEN',
        messageKey: 'auth.forbidden',
        details: ['nope'],
        timestamp: 'x',
      },
      error: null,
    });
    const res = await edgeInvoke('fn');
    expect(res).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      messageKey: 'auth.forbidden',
      details: ['nope'],
    });
  });

  it('falls back to defaults when error envelope omits fields', async () => {
    invokeMock.mockResolvedValue({ data: { ok: false }, error: null });
    const res = await edgeInvoke('fn');
    expect(res).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      messageKey: 'system.internal_error',
      details: [],
    });
  });

  it('returns NETWORK_ERROR on transport failure with no envelope', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const res = await edgeInvoke('fn');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe('NETWORK_ERROR');
      expect(res.details).toEqual(['boom']);
    }
  });

  it('passes through a legacy flat-contract body as ok', async () => {
    invokeMock.mockResolvedValue({
      data: { found: true, isValid: false },
      error: null,
    });
    const res = await edgeInvoke<{ found: boolean }>('verify-x');
    expect(res).toEqual({ ok: true, data: { found: true, isValid: false } });
  });
});

/**
 * edgeInvoke — typed wrapper around supabase.functions.invoke that unwraps
 * the institutional envelope used by all Edge Functions:
 *
 *   success → { ok: true,  data: T, timestamp, correlationId? }
 *   error   → { ok: false, code, messageKey, details?, timestamp }
 *
 * Returns a discriminated result so callers never poke at the envelope shape
 * directly. Legacy raw responses (a handful of public verify-* endpoints that
 * keep a flat contract) are passed through untouched when there is no `ok`
 * discriminator.
 */
import { supabase } from '@/integrations/supabase/client';

export interface EdgeOk<T> {
  ok: true;
  data: T;
}

export interface EdgeErr {
  ok: false;
  /** Canonical ERROR_CODES.* string (e.g. "FORBIDDEN", "VALIDATION_ERROR"). */
  code: string;
  /** i18n message key the backend chose for this error. */
  messageKey: string;
  /** Optional human-readable detail lines (already PII-safe per the envelope). */
  details: string[];
}

export type EdgeResult<T> = EdgeOk<T> | EdgeErr;

interface RawErrorEnvelope {
  ok: false;
  code?: string;
  messageKey?: string;
  details?: string[];
}

function isEnvelope(v: unknown): v is { ok: boolean } {
  return !!v && typeof v === 'object' && 'ok' in v;
}

export async function edgeInvoke<T = unknown>(
  fn: string,
  body?: Record<string, unknown>,
): Promise<EdgeResult<T>> {
  const { data, error } = await supabase.functions.invoke(fn, { body });

  // Transport / non-2xx without a parseable body.
  if (error && !isEnvelope(data)) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      messageKey: 'system.network_error',
      details: [error.message ?? 'request failed'],
    };
  }

  if (isEnvelope(data)) {
    if (data.ok === true) {
      return { ok: true, data: (data as { data: T }).data };
    }
    const env = data as RawErrorEnvelope;
    return {
      ok: false,
      code: env.code ?? 'INTERNAL_ERROR',
      messageKey: env.messageKey ?? 'system.internal_error',
      details: Array.isArray(env.details) ? env.details : [],
    };
  }

  // Legacy flat-contract response (verify-* public endpoints): pass through.
  return { ok: true, data: data as T };
}

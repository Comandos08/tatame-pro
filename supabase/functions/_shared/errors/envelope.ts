/**
 * PI-A07 — Institutional Error & Success Envelope (SAFE GOLD)
 *
 * Single source of truth for all Edge Function responses.
 * Every response MUST use this envelope — no ad-hoc payloads allowed.
 *
 * SAFE GOLD RULES:
 * - No mutations
 * - Deterministic output
 * - Never expose stack traces
 * - Always include timestamp + retryable (errors)
 * - Always include correlationId when available
 */

// ============================================================================
// ERROR CODES — Canonical classification (no loose codes allowed)
// ============================================================================

export const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  MALFORMED_JSON: "MALFORMED_JSON",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BILLING_BLOCKED: "BILLING_BLOCKED",
  TENANT_BLOCKED: "TENANT_BLOCKED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RPC_ERROR: "RPC_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ============================================================================
// ERROR ENVELOPE TYPE
// ============================================================================

export interface InstitutionalErrorEnvelope {
  ok: false;
  code: string;
  messageKey: string;
  retryable: boolean;
  timestamp: string;
  correlationId?: string;
  details?: string[];
}

// ============================================================================
// SUCCESS ENVELOPE TYPE
// ============================================================================

export interface InstitutionalSuccessEnvelope<T = unknown> {
  ok: true;
  data: T;
  correlationId?: string;
  timestamp: string;
}

// ============================================================================
// ERROR BUILDER — Pure, deterministic
// ============================================================================

export function buildErrorEnvelope(
  code: string,
  messageKey: string,
  retryable = false,
  details?: string[],
  correlationId?: string,
): InstitutionalErrorEnvelope {
  return {
    ok: false,
    code,
    messageKey,
    retryable,
    timestamp: new Date().toISOString(),
    ...(correlationId ? { correlationId } : {}),
    ...(details && details.length ? { details } : {}),
  };
}

// ============================================================================
// SUCCESS BUILDER — Pure, deterministic
// ============================================================================

export function buildSuccessEnvelope<T>(
  data: T,
  correlationId?: string,
): InstitutionalSuccessEnvelope<T> {
  return {
    ok: true,
    data,
    ...(correlationId ? { correlationId } : {}),
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

export function errorResponse(
  status: number,
  envelope: InstitutionalErrorEnvelope,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function okResponse<T>(
  data: T,
  corsHeaders: Record<string, string>,
  correlationId?: string,
): Response {
  return new Response(JSON.stringify(buildSuccessEnvelope(data, correlationId)), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// ============================================================================
// CONVENIENCE HELPERS — Canonical responses for common error paths
// ============================================================================

import { corsHeaders as _sharedCors } from "../cors.ts";

const DEFAULT_CORS: Record<string, string> = _sharedCors;

export function unauthorizedResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  messageKey = "auth.invalid_token",
  details?: string[],
  correlationId?: string,
): Response {
  return errorResponse(
    401,
    buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, messageKey, false, details, correlationId),
    corsHeaders,
  );
}

export function forbiddenResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  messageKey = "auth.forbidden",
  details?: string[],
  correlationId?: string,
): Response {
  return errorResponse(
    403,
    buildErrorEnvelope(ERROR_CODES.FORBIDDEN, messageKey, false, details, correlationId),
    corsHeaders,
  );
}

export function rpcErrorResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  rpcName: string,
  message?: string,
  correlationId?: string,
): Response {
  return errorResponse(
    500,
    buildErrorEnvelope(
      ERROR_CODES.RPC_ERROR,
      "system.rpc_failed",
      false,
      [`${rpcName}: ${message || "unknown error"}`],
      correlationId,
    ),
    corsHeaders,
  );
}

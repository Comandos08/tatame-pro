/**
 * PI-A07 — Institutional Error Envelope (SAFE GOLD)
 *
 * Single source of truth for all Edge Function error responses.
 * Every error MUST use this envelope — no ad-hoc { error: "..." } allowed.
 *
 * SAFE GOLD RULES:
 * - No mutations
 * - Deterministic output
 * - Never expose stack traces
 * - Always include timestamp + retryable
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
// ENVELOPE TYPE
// ============================================================================

export interface InstitutionalErrorEnvelope {
  ok: false;
  code: string;
  messageKey: string;
  retryable: boolean;
  timestamp: string;
  details?: string[];
}

// ============================================================================
// BUILDER — Pure, deterministic
// ============================================================================

export function buildErrorEnvelope(
  code: string,
  messageKey: string,
  retryable = false,
  details?: string[],
): InstitutionalErrorEnvelope {
  return {
    ok: false,
    code,
    messageKey,
    retryable,
    timestamp: new Date().toISOString(),
    ...(details && details.length ? { details } : {}),
  };
}

// ============================================================================
// RESPONSE HELPER
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

// ============================================================================
// CONVENIENCE HELPERS — Canonical responses for common error paths
// ============================================================================

const DEFAULT_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

export function unauthorizedResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  messageKey = "auth.invalid_token",
  details?: string[],
): Response {
  return errorResponse(
    401,
    buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, messageKey, false, details),
    corsHeaders,
  );
}

export function forbiddenResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  messageKey = "auth.forbidden",
  details?: string[],
): Response {
  return errorResponse(
    403,
    buildErrorEnvelope(ERROR_CODES.FORBIDDEN, messageKey, false, details),
    corsHeaders,
  );
}

export function rpcErrorResponse(
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  rpcName: string,
  message?: string,
): Response {
  return errorResponse(
    500,
    buildErrorEnvelope(
      ERROR_CODES.RPC_ERROR,
      "system.rpc_failed",
      false,
      [`${rpcName}: ${message || "unknown error"}`],
    ),
    corsHeaders,
  );
}

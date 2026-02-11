/**
 * PI-A08.H2 — Anti-Enumeration: Public Query Limits (SAFE GOLD)
 *
 * Institutional enforcement of pagination limits for all public/anon endpoints.
 * Uses Error Envelope (A07) for all error responses.
 *
 * Rules:
 * - No request without limit → default = PUBLIC_QUERY_MAX_LIMIT
 * - limit > PUBLIC_QUERY_MAX_LIMIT → 400 VALIDATION_ERROR
 * - limit <= 0 → 400 VALIDATION_ERROR
 * - offset < 0 → normalized to 0
 * - page/perPage supported as alternative to offset/limit
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

import { PUBLIC_QUERY_MAX_LIMIT } from './piiContract.ts';
import {
  buildErrorEnvelope,
  errorResponse,
  ERROR_CODES,
} from '../errors/envelope.ts';
import { createBackendLogger } from '../backend-logger.ts';

// ============================================================================
// CORS — Default for public endpoints
// ============================================================================

const DEFAULT_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

// ============================================================================
// TYPES
// ============================================================================

export type PaginationOk = {
  ok: true;
  limit: number;
  offset: number;
};

export type PaginationError = {
  ok: false;
  response: Response;
};

export type PaginationResult = PaginationOk | PaginationError;

// ============================================================================
// validatePublicLimit — Pure, deterministic
// ============================================================================

export function validatePublicLimit(
  limit: number,
  maxLimit: number = PUBLIC_QUERY_MAX_LIMIT,
): { valid: true } | { valid: false; messageKey: string } {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { valid: false, messageKey: "public.limit_invalid" };
  }
  if (limit > maxLimit) {
    return { valid: false, messageKey: "public.limit_exceeded" };
  }
  return { valid: true };
}

// ============================================================================
// parsePublicPagination — Reads URL params, enforces contract
// ============================================================================

export function parsePublicPagination(
  req: Request,
  corsHeaders: Record<string, string> = DEFAULT_CORS,
  maxLimit: number = PUBLIC_QUERY_MAX_LIMIT,
): PaginationResult {
  const log = createBackendLogger("publicQueryLimits", crypto.randomUUID());
  const url = new URL(req.url);
  const params = url.searchParams;

  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  const rawPage = params.get("page");
  const rawPerPage = params.get("perPage");

  let limit: number;
  let offset: number;

  // page/perPage mode
  if (rawPage !== null && rawPerPage !== null) {
    const page = parseInt(rawPage, 10);
    const perPage = parseInt(rawPerPage, 10);

    if (!Number.isFinite(page) || page < 1) {
      log.warn("Invalid page parameter", { rawPage });
      return {
        ok: false,
        response: errorResponse(
          400,
          buildErrorEnvelope(
            ERROR_CODES.VALIDATION_ERROR,
            "public.pagination_invalid",
            false,
            [`page must be >= 1, got: ${rawPage}`],
          ),
          corsHeaders,
        ),
      };
    }

    const perPageValidation = validatePublicLimit(perPage, maxLimit);
    if (!perPageValidation.valid) {
      log.warn("perPage rejected", { rawPerPage });
      return {
        ok: false,
        response: errorResponse(
          400,
          buildErrorEnvelope(
            ERROR_CODES.VALIDATION_ERROR,
            perPageValidation.messageKey,
            false,
            [`perPage must be 1..${maxLimit}, got: ${rawPerPage}`],
          ),
          corsHeaders,
        ),
      };
    }

    limit = perPage;
    offset = (page - 1) * perPage;
  } else {
    // offset/limit mode
    limit = rawLimit !== null ? parseInt(rawLimit, 10) : maxLimit;
    offset = rawOffset !== null ? parseInt(rawOffset, 10) : 0;

    const limitValidation = validatePublicLimit(limit, maxLimit);
    if (!limitValidation.valid) {
      log.warn("limit rejected", { rawLimit });
      return {
        ok: false,
        response: errorResponse(
          400,
          buildErrorEnvelope(
            ERROR_CODES.VALIDATION_ERROR,
            limitValidation.messageKey,
            false,
            [`limit must be 1..${maxLimit}, got: ${rawLimit}`],
          ),
          corsHeaders,
        ),
      };
    }
  }

  // Normalize negative offset to 0 (documented choice: normalize, not reject)
  if (!Number.isFinite(offset) || offset < 0) {
    offset = 0;
  }

  return { ok: true, limit, offset };
}
/**
 * Shared CRON_SECRET validation for scheduled Edge Functions.
 *
 * The pattern (read CRON_SECRET from env, compare against x-cron-secret
 * header, return 500 when unset or 403 when wrong) was duplicated verbatim
 * across every cron-only function — same 20-ish lines, same error strings.
 * That copy/paste was both the source of most G2 envelope drift in the
 * batch (each one independently built its own ad-hoc {error: "..."}) and
 * a future-correctness hazard: when the rule changes once, it has to
 * change everywhere.
 *
 * Usage:
 *
 *   const reject = requireCronSecret(req, dynamicCors, log, correlationId);
 *   if (reject) return reject;
 *
 * If validation succeeds, returns null and the caller continues. If it
 * fails, returns the institutional error response the caller must return
 * unchanged.
 */

import type { BackendLogger } from "./backend-logger.ts";
import {
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
} from "./errors/envelope.ts";

export function requireCronSecret(
  req: Request,
  corsHeaders: Record<string, string>,
  log: BackendLogger,
  correlationId: string,
): Response | null {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return errorResponse(
      500,
      buildErrorEnvelope(
        ERROR_CODES.INTERNAL_ERROR,
        "system.cron_secret_missing",
        false,
        undefined,
        correlationId,
      ),
      corsHeaders,
    );
  }

  if (requestSecret !== cronSecret) {
    log.warn("Invalid or missing x-cron-secret");
    return errorResponse(
      403,
      buildErrorEnvelope(
        ERROR_CODES.FORBIDDEN,
        "auth.cron_secret_invalid",
        false,
        undefined,
        correlationId,
      ),
      corsHeaders,
    );
  }

  return null;
}

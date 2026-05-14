// ============================================================================
// PI U16 — emit-institutional-event (Edge Function)
// ============================================================================
// Receives institutional events from authenticated clients and persists
// them using service_role (bypassing RLS). Fail-silent by design.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { SecureRateLimiter, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);
  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("emit-institutional-event", correlationId);

  try {
    log.info("emit-institutional-event invoked");
    // 1. Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // Rate limiting: 200 events per hour per user (frontend telemetry, generous but bounded)
    // fail-open: telemetry must never block the app
    const rateLimiter = new SecureRateLimiter({
      operation: "emit-institutional-event",
      limit: 200,
      windowSeconds: 3600,
      failClosed: false,
    });
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    // 2. Parse event payload
    const body = await req.json();
    const { domain, type, tenantId, metadata } = body;

    if (!domain || !type) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["domain and type are required"], correlationId),
        dynamicCors,
      );
    }

    // 3. Insert using service_role (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    await adminClient.from("institutional_events").insert({
      domain,
      type,
      tenant_id: tenantId || null,
      actor_user_id: user.id,
      metadata: metadata || {},
    });

    // Always return success (fail-silent for caller)
    return okResponse({ accepted: true }, dynamicCors, correlationId);
  } catch (_err) {
    // Fail-silent: never break caller flow. We still wrap in the envelope so
    // consumers get a deterministic shape; the upstream caller only checks
    // HTTP 200.
    return okResponse({ accepted: true }, dynamicCors, correlationId);
  }
});

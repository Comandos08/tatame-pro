/**
 * request-erasure — LGPD Art. 18 (Right to Erasure) — P2.8
 *
 * Creates an erasure request for an athlete.
 * Does NOT execute immediate deletion — sports records have legal retention obligations.
 * Creates a record in audit_logs as a pending erasure queue item
 * and notifies tenant admins via send-athlete-email.
 *
 * Requires: authenticated user (athlete requesting their own data, or tenant admin)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("request-erasure", correlationId);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify the calling user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // Rate limit before parsing the body so we cap the cost of abuse —
    // 3 erasure requests per day per user. The pending-request dedupe below
    // protects against legitimate duplicates; this protects against bots and
    // mass enumeration of athlete_id values.
    const rateLimiter = RATE_LIMIT_PRESETS.requestErasure();
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for request-erasure", { userId: user.id });
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    const { athlete_id, tenant_id, reason } = await req.json();

    if (!athlete_id || !tenant_id) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["athlete_id and tenant_id are required"], correlationId),
        dynamicCors,
      );
    }

    // Verify the requesting user is the athlete themselves OR a tenant admin
    const { data: athlete } = await supabase
      .from("athletes")
      .select("id, full_name, email, profile_id")
      .eq("id", athlete_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!athlete) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["athlete"], correlationId),
        dynamicCors,
      );
    }

    const isOwnRequest = athlete.profile_id === user.id;

    if (!isOwnRequest) {
      // Check if user is a tenant admin
      const { data: roleMember } = await supabase
        .from("tenant_members")
        .select("role")
        .eq("profile_id", user.id)
        .eq("tenant_id", tenant_id)
        .in("role", ["ADMIN_TENANT", "SUPERADMIN_GLOBAL"])
        .maybeSingle();

      if (!roleMember) {
        return errorResponse(
          403,
          buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["may only request erasure for your own data"], correlationId),
          dynamicCors,
        );
      }
    }

    // Check for existing pending request
    const { data: existing } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("entity_type", "ERASURE_REQUEST")
      .eq("entity_id", athlete_id)
      .eq("event_type", "LGPD_ERASURE_REQUESTED")
      .maybeSingle();

    if (existing) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.duplicate", false, [`erasure request already pending (request_id=${existing.id})`], correlationId),
        dynamicCors,
      );
    }

    // Create erasure request as an audit log entry (acts as pending queue)
    const { data: auditEntry, error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        tenant_id,
        actor_id: user.id,
        entity_type: "ERASURE_REQUEST",
        entity_id: athlete_id,
        event_type: "LGPD_ERASURE_REQUESTED",
        severity: "HIGH",
        metadata: {
          athlete_name: athlete.full_name,
          athlete_email: athlete.email,
          reason: reason || "Solicitação de exclusão via portal do atleta (LGPD Art. 18)",
          requested_by: user.id,
          requested_at: new Date().toISOString(),
          status: "PENDING_ADMIN_REVIEW",
          legal_note: "Registros esportivos podem ter retenção legal obrigatória. Análise manual necessária.",
        },
        correlation_id: correlationId,
      })
      .select("id")
      .single();

    if (auditError) {
      throw new Error(`Failed to create erasure request: ${auditError.message}`);
    }

    log.info("LGPD erasure request created", { athlete_id, tenant_id, request_id: auditEntry.id });

    return okResponse(
      {
        request_id: auditEntry.id,
        status: "PENDING_ADMIN_REVIEW",
        message: "Sua solicitação foi registrada e será analisada pela equipe administrativa. Registros esportivos oficiais podem ter retenção legal obrigatória.",
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error creating erasure request", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, [errorMessage], correlationId),
      dynamicCors,
    );
  }
});

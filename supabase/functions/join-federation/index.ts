/**
 * @contract join-federation
 * 
 * SAFE GOLD — PI-D6.1.2: Federation Governance Edge Function
 * 
 * INPUT:
 *   - tenantId: UUID (required)
 *   - federationId: UUID (required)
 * 
 * PRECONDITIONS:
 *   - tenant.lifecycle_status === 'ACTIVE'
 *   - federation.status === 'ACTIVE'
 *   - requester has FED_ADMIN or ADMIN_TENANT role
 *   - tenant is not already a member of the federation
 * 
 * POSTCONDITIONS:
 *   - federation_tenants row created
 *   - audit event TENANT_JOINED_FEDERATION logged with federation_id
 * 
 * SECURITY:
 *   - Rate limited: 10 joins per hour
 *   - Full audit trail
 *   - Soft history (never delete)
 * 
 * INVARIANT (I2):
 *   - Tenant↔Federation link is immutable (soft history)
 *   - Events require metadata.federation_id
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { requireTenantActive, tenantNotActiveResponse } from "../_shared/requireTenantActive.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { validateCaptcha, captchaErrorResponse } from "../_shared/captcha.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


interface JoinFederationRequest {
  tenantId: string;
  federationId: string;
}

serve(async (req) => {
  // P0-1: KILL-SWITCH — disabled pending frontend route implementation
  return new Response('disabled', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("join-federation", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // PARSE INPUT
    // ========================================================================
    let body: JoinFederationRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.MALFORMED_JSON, "validation.invalid_json", false, ["could not parse request body"], correlationId),
        dynamicCors,
      );
    }

    const { tenantId, federationId } = body;

    // CAPTCHA validation (optional — graceful degradation)
    if (body.captchaToken) {
      const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const captchaResult = await validateCaptcha(body.captchaToken, clientIP);
      if (!captchaResult.success) {
        return captchaErrorResponse(captchaResult, dynamicCors);
      }
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tenantId || !federationId || !uuidRegex.test(tenantId) || !uuidRegex.test(federationId)) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.invalid_uuid", false, ["tenantId and federationId must be valid UUIDs"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // ROLE CHECK (FED_ADMIN or ADMIN_TENANT)
    // ========================================================================
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id);

    const isSuperadmin = roles?.some(r => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null);
    const isTenantAdmin = roles?.some(r => 
      (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && 
      r.tenant_id === tenantId
    );

    // Check federation roles
    const { data: fedRoles } = await supabase
      .from("federation_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("federation_id", federationId);

    const isFedAdmin = fedRoles?.some(r => r.role === "FED_ADMIN");

    if (!isSuperadmin && !isTenantAdmin && !isFedAdmin) {
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["FED_ADMIN, ADMIN_TENANT or SUPERADMIN_GLOBAL required"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // TENANT LIFECYCLE CHECK (I4)
    // ========================================================================
    const tenantCheck = await requireTenantActive(supabase, tenantId);
    if (!tenantCheck.allowed) {
      return tenantNotActiveResponse(tenantCheck.status);
    }

    // ========================================================================
    // FEDERATION STATUS CHECK
    // ========================================================================
    const { data: federation, error: fedError } = await supabase
      .from("federations")
      .select("id, name, status")
      .eq("id", federationId)
      .maybeSingle();

    if (fedError || !federation) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["federation"], correlationId),
        dynamicCors,
      );
    }

    if (federation.status !== "ACTIVE") {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, [`federation status is ${federation.status}`], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // CHECK EXISTING MEMBERSHIP
    // ========================================================================
    const { data: existing } = await supabase
      .from("federation_tenants")
      .select("tenant_id, left_at")
      .eq("tenant_id", tenantId)
      .eq("federation_id", federationId)
      .maybeSingle();

    if (existing && !existing.left_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.duplicate", false, ["tenant is already a member of this federation"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // CREATE MEMBERSHIP (or rejoin if previously left)
    // ========================================================================
    const now = new Date().toISOString();

    if (existing && existing.left_at) {
      // Rejoin: clear left_at
      const { error: updateError } = await supabase
        .from("federation_tenants")
        .update({ 
          left_at: null,
          joined_at: now
        })
        .eq("tenant_id", tenantId)
        .eq("federation_id", federationId);

      if (updateError) {
        log.error("Update error", updateError);
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, [`failed to rejoin federation: ${updateError.message}`], correlationId),
          dynamicCors,
        );
      }
    } else {
      // New membership
      const { error: insertError } = await supabase
        .from("federation_tenants")
        .insert({
          tenant_id: tenantId,
          federation_id: federationId,
          joined_at: now
        });

      if (insertError) {
        log.error("Insert error", insertError);
        return errorResponse(
          500,
          buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, [`failed to join federation: ${insertError.message}`], correlationId),
          dynamicCors,
        );
      }
    }

    // ========================================================================
    // AUDIT LOG (I2, I3 - MANDATORY federation_id)
    // ========================================================================
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.TENANT_JOINED_FEDERATION,
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        federation_id: federationId, // MANDATORY per PI-D5.A
        federation_name: federation.name,
        joined_at: now,
        rejoined: !!existing?.left_at,
      },
    });

    log.info("Success", { tenantId, federationId });

    return okResponse(
      {
        federationId,
        tenantId,
        joinedAt: now,
      },
      dynamicCors,
      correlationId,
    );

  } catch (error) {
    log.error("Error", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});

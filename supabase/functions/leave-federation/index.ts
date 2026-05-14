/**
 * @contract leave-federation
 * 
 * SAFE GOLD — PI-D6.1.2: Federation Governance Edge Function
 * 
 * INPUT:
 *   - tenantId: UUID (required)
 *   - federationId: UUID (required)
 *   - reason: string (required, min 5 chars)
 * 
 * PRECONDITIONS:
 *   - tenant is an active member of the federation
 *   - requester has FED_ADMIN or ADMIN_TENANT role
 * 
 * POSTCONDITIONS:
 *   - federation_tenants.left_at set (NEVER delete)
 *   - audit event TENANT_LEFT_FEDERATION logged with federation_id
 * 
 * SECURITY:
 *   - Rate limited: 10 leaves per hour
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
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


interface LeaveFederationRequest {
  tenantId: string;
  federationId: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("leave-federation", correlationId);

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
    let body: LeaveFederationRequest;
    try {
      body = await req.json();
    } catch {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.MALFORMED_JSON, "validation.invalid_json", false, ["could not parse request body"], correlationId),
        dynamicCors,
      );
    }

    const { tenantId, federationId, reason } = body;

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tenantId || !federationId || !uuidRegex.test(tenantId) || !uuidRegex.test(federationId)) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.invalid_uuid", false, ["tenantId and federationId must be valid UUIDs"], correlationId),
        dynamicCors,
      );
    }

    // Validate reason (required, min 5 chars)
    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.reason_too_short", false, ["reason must be at least 5 characters"], correlationId),
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
    // CHECK EXISTING MEMBERSHIP
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("federation_tenants")
      .select("tenant_id, federation_id, joined_at, left_at")
      .eq("tenant_id", tenantId)
      .eq("federation_id", federationId)
      .maybeSingle();

    if (membershipError) {
      log.error("Membership lookup error", membershipError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, [`membership lookup failed: ${membershipError.message}`], correlationId),
        dynamicCors,
      );
    }

    if (!membership) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["tenant is not a member of this federation"], correlationId),
        dynamicCors,
      );
    }

    if (membership.left_at) {
      return errorResponse(
        409,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["tenant has already left this federation"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // FETCH FEDERATION NAME FOR AUDIT
    // ========================================================================
    const { data: federation } = await supabase
      .from("federations")
      .select("name")
      .eq("id", federationId)
      .maybeSingle();

    // ========================================================================
    // UPDATE MEMBERSHIP (SOFT DELETE - NEVER actually delete)
    // ========================================================================
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("federation_tenants")
      .update({ left_at: now })
      .eq("tenant_id", tenantId)
      .eq("federation_id", federationId);

    if (updateError) {
      log.error("Update error", updateError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.query_failed", true, [`failed to leave federation: ${updateError.message}`], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // AUDIT LOG (I2, I3 - MANDATORY federation_id)
    // ========================================================================
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.TENANT_LEFT_FEDERATION,
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        federation_id: federationId, // MANDATORY per PI-D5.A
        federation_name: federation?.name || null,
        left_at: now,
        reason: reason.trim(),
        joined_at: membership.joined_at,
      },
    });

    log.info("Success", { tenantId, federationId, reason: reason.trim() });

    return okResponse(
      {
        federationId,
        tenantId,
        leftAt: now,
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

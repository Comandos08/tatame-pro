/**
 * 🏅 assign-athlete-badge — Grant a symbolic badge to an athlete
 *
 * SECURITY:
 * - Requires ADMIN_TENANT (or SUPERADMIN_GLOBAL)
 * - Validates athlete, badge, and tenant cross-references
 * - Writes via service_role only
 * - Idempotent: existing active badge → no-op; revoked → reactivate
 * - Audit logged
 *
 * @see docs/BADGE-CONTRACT.md
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireTenantRole,
  forbiddenResponse,
  unauthorizedResponse,
} from "../_shared/requireTenantRole.ts";
import { assertTenantAccess, TenantBoundaryError } from "../_shared/tenant-boundary.ts";
import { requireBillingStatus, billingRestrictedResponse } from "../_shared/requireBillingStatus.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
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


interface AssignBadgeRequest {
  athleteId: string;
  badgeId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("assign-athlete-badge", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return unauthorizedResponse("Missing authorization header");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return unauthorizedResponse("Invalid token");

    log.info("Authenticated", { userId: user.id });

    // Rate limiting: 100 badge assignments per hour per admin
    const rateLimiter = RATE_LIMIT_PRESETS.assignRevokeBadge();
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for assign-athlete-badge", { userId: user.id });
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    // 2. Parse input
    const body: AssignBadgeRequest = await req.json();
    const { athleteId, badgeId } = body;

    if (!athleteId || !badgeId) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.required_field", false, ["athleteId and badgeId are required"], correlationId),
        dynamicCors,
      );
    }

    // 3. Fetch athlete to get tenant_id
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .select("id, tenant_id")
      .eq("id", athleteId)
      .maybeSingle();

    if (athleteError || !athlete) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["athlete"], correlationId),
        dynamicCors,
      );
    }

    const tenantId = athlete.tenant_id;

    // A04 — Tenant Boundary Check (Zero-Trust)
    try {
      await assertTenantAccess(supabase, user.id, tenantId);
      log.info("Tenant boundary check passed");
    } catch (boundaryError) {
      if (boundaryError instanceof TenantBoundaryError) {
        log.warn("Tenant boundary violation", { code: boundaryError.code });
        return errorResponse(
          403,
          buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.tenant_boundary", false, [boundaryError.code], correlationId),
          dynamicCors,
        );
      }
      throw boundaryError;
    }

    // 4. Role check: ADMIN_TENANT for this tenant
    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      log.warn("Permission denied", { error: roleCheck.error });
      return forbiddenResponse(roleCheck.error || "Forbidden");
    }

    // P1-01 — Billing status check
    const billingCheck = await requireBillingStatus(supabase, tenantId);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", { status: billingCheck.status });
      return billingRestrictedResponse(billingCheck.status);
    }

    // 5. Validate badge belongs to same tenant
    const { data: badge, error: badgeError } = await supabase
      .from("badges")
      .select("id, code, name, tenant_id, is_active")
      .eq("id", badgeId)
      .maybeSingle();

    if (badgeError || !badge) {
      return errorResponse(
        404,
        buildErrorEnvelope(ERROR_CODES.NOT_FOUND, "data.not_found", false, ["badge"], correlationId),
        dynamicCors,
      );
    }

    if (badge.tenant_id !== tenantId) {
      log.warn("Cross-tenant badge attempt blocked");
      return errorResponse(
        403,
        buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.tenant_boundary", false, ["badge does not belong to this tenant"], correlationId),
        dynamicCors,
      );
    }

    if (!badge.is_active) {
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.CONFLICT, "data.invalid_state", false, ["badge is inactive"], correlationId),
        dynamicCors,
      );
    }

    // 6. Check existing assignment
    const { data: existing } = await supabase
      .from("athlete_badges")
      .select("id, revoked_at")
      .eq("athlete_id", athleteId)
      .eq("badge_id", badgeId)
      .maybeSingle();

    let action: "NOOP" | "REACTIVATED" | "GRANTED" = "NOOP";

    if (existing) {
      if (existing.revoked_at === null) {
        action = "NOOP";
        log.info("Badge already active, no-op", { athleteId, badgeCode: badge.code });
      } else {
        const { error: updateError } = await supabase
          .from("athlete_badges")
          .update({ revoked_at: null, granted_by: user.id, granted_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (updateError) throw updateError;
        action = "REACTIVATED";
        log.info("Badge reactivated", { athleteId, badgeCode: badge.code });
      }
    } else {
      const { error: insertError } = await supabase.from("athlete_badges").insert({
        athlete_id: athleteId,
        badge_id: badgeId,
        tenant_id: tenantId,
        granted_by: user.id,
      });

      if (insertError) throw insertError;
      action = "GRANTED";
      log.info("Badge granted", { athleteId, badgeCode: badge.code });
    }

    // 7. Audit log (B3 — via canonical helper)
    if (action !== "NOOP") {
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.BADGE_GRANTED,
        tenant_id: tenantId,
        profile_id: user.id,
        metadata: {
          target_type: 'ATHLETE',
          target_id: athleteId,
          badgeCode: badge.code,
          badgeName: badge.name,
          action,
        },
      });
    }

    return okResponse({ action, badgeCode: badge.code }, dynamicCors, correlationId);
  } catch (error) {
    log.error("Unexpected error", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});

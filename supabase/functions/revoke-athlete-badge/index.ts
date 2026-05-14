/**
 * 🏅 revoke-athlete-badge — Soft-revoke a badge from an athlete
 *
 * SECURITY:
 * - Requires ADMIN_TENANT (or SUPERADMIN_GLOBAL)
 * - Validates athlete, badge, and tenant cross-references
 * - Writes via service_role only
 * - Idempotent: already revoked → no-op
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
import { createAuditLog } from "../_shared/audit-logger.ts";
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


interface RevokeBadgeRequest {
  athleteId: string;
  badgeId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("revoke-athlete-badge", correlationId);

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

    // Rate limiting: 100 badge revocations per hour per admin
    const rateLimiter = RATE_LIMIT_PRESETS.assignRevokeBadge();
    const rlContext = buildRateLimitContext(req, user.id, null);
    const rlResult = await rateLimiter.check(rlContext);
    if (!rlResult.allowed) {
      log.warn("Rate limit exceeded for revoke-athlete-badge", { userId: user.id });
      return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
    }

    // 2. Parse input
    const body: RevokeBadgeRequest = await req.json();
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

    // 4. Role check
    const roleCheck = await requireTenantRole(supabase, authHeader, tenantId, ["ADMIN_TENANT"]);
    if (!roleCheck.allowed) {
      log.warn("Permission denied", { error: roleCheck.error });
      return forbiddenResponse(roleCheck.error || "Forbidden");
    }

    // 5. Find active assignment
    const { data: existing } = await supabase
      .from("athlete_badges")
      .select("id, revoked_at, badges(code, name)")
      .eq("athlete_id", athleteId)
      .eq("badge_id", badgeId)
      .maybeSingle();

    if (!existing) {
      return okResponse({ action: "NOOP", reason: "No assignment found" }, dynamicCors, correlationId);
    }

    if (existing.revoked_at !== null) {
      log.info("Already revoked, no-op");
      return okResponse({ action: "NOOP", reason: "Already revoked" }, dynamicCors, correlationId);
    }

    // 6. Soft revoke
    const { error: updateError } = await supabase
      .from("athlete_badges")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (updateError) throw updateError;

    // deno-lint-ignore no-explicit-any
    const badgeInfo = existing.badges as any;
    log.info("Badge revoked", { athleteId, badgeCode: badgeInfo?.code });

    // 7. Audit log (B3 — via canonical helper)
    await createAuditLog(supabase, {
      event_type: 'BADGE_REVOKED',
      tenant_id: tenantId,
      profile_id: user.id,
      metadata: {
        target_type: 'ATHLETE',
        target_id: athleteId,
        badgeCode: badgeInfo?.code,
        badgeName: badgeInfo?.name,
      },
    });

    return okResponse({ action: "REVOKED", badgeCode: badgeInfo?.code }, dynamicCors, correlationId);
  } catch (error) {
    log.error("Unexpected error", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});

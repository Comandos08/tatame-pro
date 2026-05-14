/**
 * 🔐 cancel-membership-manual — Manual Membership Cancellation with Full Governance
 *
 * SAFE GOLD:
 * - NÃO apaga dados
 * - Bloqueia retry futuro (via evento auditoria)
 * - NÃO altera memberships pagas
 * - SEM efeitos colaterais
 *
 * SECURITY:
 * - JWT validado manualmente (padrão do codebase)
 * - Valida tenant boundary (membership.tenant_id === user tenant)
 * - Valida role (ADMIN_TENANT, STAFF_ORGANIZACAO)
 * - Impersonation obrigatório para SUPERADMIN
 * - Billing status check
 * - Rate limiting (10/hour/user)
 * - Motivo obrigatório (min 5 chars)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import {
  requireImpersonationIfSuperadmin,
  extractImpersonationId,
} from "../_shared/requireImpersonationIfSuperadmin.ts";
import {
  SecureRateLimiter,
  buildRateLimitContext,
} from "../_shared/secure-rate-limiter.ts";
import {
  extractRequestContext,
} from "../_shared/security-logger.ts";
import {
  logDecision,
  logRateLimitBlock,
  logPermissionDenied,
  logImpersonationBlock,
  logBillingRestricted,
  DECISION_TYPES,
} from "../_shared/decision-logger.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


const OPERATION_NAME = "cancel-membership-manual";

interface CancelMembershipRequest {
  membershipId: string;
  reason: string;
  impersonationId?: string;
}

// Eligible statuses for manual cancellation
const ELIGIBLE_STATUSES = ["DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW"];

/**
 * Rate limiter preset: 10 cancellations per hour per user
 */
function cancelMembershipRateLimiter() {
  return new SecureRateLimiter({
    operation: OPERATION_NAME,
    limit: 10,
    windowSeconds: 3600,
  });
}

/**
 * Generic error response (anti-enumeration). Takes corsHeaders as a parameter
 * because `dynamicCors` is built per-request inside the serve() callback and
 * is not in scope at module level.
 */
function forbiddenResponse(corsHeaders: Record<string, string>, correlationId?: string): Response {
  return errorResponse(
    403,
    buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["operation not permitted"], correlationId),
    corsHeaders,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("cancel-membership-manual", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 1️⃣ AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      log.error("Auth failed - missing header");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        reason: "MISSING_AUTH",
      });
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      log.error("Auth failed - invalid token");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        reason: "INVALID_TOKEN",
      });
      return errorResponse(
        401,
        buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const adminProfileId = user.id;
    log.info("Admin authenticated", { adminProfileId });

    // ========================================================================
    // 2️⃣ RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = cancelMembershipRateLimiter();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    // deno-lint-ignore no-explicit-any
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase as any);
    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded", { count: rateLimitResult.count });

      await logRateLimitBlock(supabase, {
        operation: OPERATION_NAME,
        user_id: user.id,
        ip_address: extractRequestContext(req).ip_address,
        count: rateLimitResult.count,
        limit: 10,
      });

      return rateLimiter.tooManyRequestsResponse(rateLimitResult, dynamicCors, correlationId);
    }

    // ========================================================================
    // 3️⃣ PARSE INPUT
    // ========================================================================
    let body: CancelMembershipRequest;
    try {
      body = await req.json();
    } catch {
      log.warn("Validation failed - invalid JSON");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "INVALID_PAYLOAD",
      });
      return forbiddenResponse(dynamicCors, correlationId);
    }

    const membershipId = body.membershipId;
    const reason = body.reason?.trim() || "";

    if (!membershipId) {
      log.warn("Validation failed - missing membershipId");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "MISSING_MEMBERSHIP_ID",
      });
      return forbiddenResponse(dynamicCors, correlationId);
    }

    // Validate reason (min 5 chars)
    if (!reason || reason.length < 5) {
      log.warn("Validation failed - reason too short", { length: reason.length });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "REASON_TOO_SHORT",
        metadata: { reason_length: reason.length },
      });
      return errorResponse(
        400,
        buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, "validation.reason_too_short", false, ["reason must be at least 5 characters"], correlationId),
        dynamicCors,
      );
    }

    // ========================================================================
    // 4️⃣ FETCH MEMBERSHIP (before auth check - need tenant_id)
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        id,
        status,
        payment_status,
        tenant_id,
        applicant_data
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      log.warn("Membership not found or error", { membershipId });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "MEMBERSHIP_NOT_FOUND",
      });
      return forbiddenResponse(dynamicCors, correlationId);
    }

    const targetTenantId = membership.tenant_id;
    const previousStatus = membership.status;
    log.info("Fetched membership", {
      previousStatus,
      membershipId,
      tenantId: targetTenantId,
      paymentStatus: membership.payment_status,
    });

    // ========================================================================
    // 5️⃣ AUTHORIZATION CHECK (Role + Impersonation)
    // ========================================================================

    // 5.1 Check user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", adminProfileId);

    const isSuperadmin = roles?.some(
      (r) => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null
    );
    const isTenantAdmin = roles?.some(
      (r) =>
        (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") &&
        r.tenant_id === targetTenantId
    );

    if (!isSuperadmin && !isTenantAdmin) {
      log.warn("Permission denied - no valid role");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        required_roles: ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "SUPERADMIN_GLOBAL"],
        actual_roles: roles?.map((r) => r.role) || [],
        reason: "INSUFFICIENT_PERMISSIONS",
      });
      return forbiddenResponse(dynamicCors, correlationId);
    }

    // 5.2 If superadmin, REQUIRE valid impersonation
    if (isSuperadmin) {
      const impersonationId = extractImpersonationId(req, body);
      // deno-lint-ignore no-explicit-any
      const impersonationCheck = await requireImpersonationIfSuperadmin(
        supabase as any,
        user.id,
        targetTenantId,
        impersonationId
      );

      if (!impersonationCheck.valid) {
        log.warn("Impersonation validation failed", {
          error: impersonationCheck.error,
        });

        await logImpersonationBlock(supabase, {
          operation: OPERATION_NAME,
          user_id: user.id,
          tenant_id: targetTenantId,
          impersonation_id: impersonationId || undefined,
          reason: impersonationCheck.error || "INVALID_IMPERSONATION",
        });

        return forbiddenResponse(dynamicCors, correlationId);
      }

      log.info("Superadmin with valid impersonation", {
        impersonationId: impersonationCheck.impersonationId,
      });
    }

    log.info("Authorization verified", { isSuperadmin, isTenantAdmin });

    // ========================================================================
    // 6️⃣ BILLING STATUS CHECK
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabase, targetTenantId);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", {
        status: billingCheck.status,
        code: billingCheck.code,
      });

      await logBillingRestricted(supabase, {
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        billing_status: billingCheck.status,
      });

      return billingRestrictedResponse(billingCheck.status);
    }

    log.info("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // 7️⃣ VALIDATE MEMBERSHIP STATUS (Idempotent for CANCELLED)
    // ========================================================================
    if (previousStatus === "CANCELLED") {
      log.info("Membership already cancelled - idempotent return", {
        membershipId,
      });
      return okResponse(
        {
          membershipId,
          previousStatus: "CANCELLED",
          newStatus: "CANCELLED",
          idempotent: true,
        },
        dynamicCors,
        correlationId,
      );
    }

    if (!ELIGIBLE_STATUSES.includes(previousStatus)) {
      log.warn("Invalid status for cancellation", { status: previousStatus });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "INVALID_STATUS",
        metadata: { current_status: previousStatus },
      });
      return errorResponse(
        400,
        buildErrorEnvelope(
          ERROR_CODES.CONFLICT,
          "membership.status_not_eligible",
          false,
          [`cannot cancel membership with status ${previousStatus}; only DRAFT, PENDING_PAYMENT, PENDING_REVIEW are eligible`],
          correlationId,
        ),
        dynamicCors,
      );
    }

    // ========================================================================
    // 8️⃣ BLOCK IF ALREADY PAID
    // ========================================================================
    if (membership.payment_status === "PAID") {
      log.warn("Cannot cancel paid membership", { membershipId });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "ALREADY_PAID",
        metadata: { payment_status: membership.payment_status },
      });
      return errorResponse(
        400,
        buildErrorEnvelope(
          ERROR_CODES.CONFLICT,
          "membership.cannot_cancel_paid",
          false,
          ["paid memberships cannot be manually cancelled; use refund process instead"],
          correlationId,
        ),
        dynamicCors,
      );
    }

    // ========================================================================
    // 9️⃣ UPDATE MEMBERSHIP TO CANCELLED (Race-safe)
    // ========================================================================
    // GOV-001B: Transition status via gatekeeper RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "CANCELLED",
      p_reason: reason,
      p_actor_profile_id: adminProfileId,
      p_notes: null,
    });

    if (rpcError) {
      log.error("Gatekeeper RPC failed", { error: rpcError.message });
      // Check if it's a transition error (race condition)
      if (rpcError.message?.includes("Invalid transition")) {
        return errorResponse(
          409,
          buildErrorEnvelope(
            ERROR_CODES.CONFLICT,
            "membership.status_changed",
            false,
            ["membership status changed during operation"],
            correlationId,
          ),
          dynamicCors,
        );
      }
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.RPC_ERROR, "system.rpc_failed", false, [`change_membership_state: ${rpcError.message ?? "unknown"}`], correlationId),
        dynamicCors,
      );
    }

    log.info("Membership cancelled", { newStatus: "CANCELLED" });

    // ========================================================================
    // 🔟 AUDIT LOG — Membership Manually Cancelled
    // ========================================================================
    const actorRole = isSuperadmin ? "SUPERADMIN_GLOBAL" : isTenantAdmin ? "ADMIN_TENANT" : "STAFF_ORGANIZACAO";
    const impersonationIdForLog = isSuperadmin
      ? extractImpersonationId(req, body)
      : null;
    const clientIP = extractRequestContext(req).ip_address;

    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_MANUAL_CANCELLED,
      tenant_id: targetTenantId,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        previous_status: previousStatus,
        new_status: "CANCELLED",
        cancellation_source: "manual_admin",
        reason: reason,
        blocked_retry: true,
        actor_role: actorRole,
        impersonation_id: impersonationIdForLog,
        ip_address: clientIP,
      },
    });

    // ========================================================================
    // 1️⃣1️⃣ DECISION LOG — SUCCESS
    // ========================================================================
    await logDecision(supabase, {
      decision_type: "MEMBERSHIP_MANUAL_CANCELLED",
      severity: "MEDIUM",
      operation: OPERATION_NAME,
      user_id: adminProfileId,
      tenant_id: targetTenantId,
      reason_code: "SUCCESS",
      metadata: {
        membership_id: membershipId,
        previous_status: previousStatus,
        cancellation_reason: reason,
        actor_role: actorRole,
        impersonation_id: impersonationIdForLog,
      },
    });

    log.info("Operation completed successfully", { membershipId });

    return okResponse(
      {
        membershipId,
        previousStatus,
        newStatus: "CANCELLED",
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    log.error("Unexpected error", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});

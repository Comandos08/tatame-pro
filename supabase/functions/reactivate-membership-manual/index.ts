/**
 * 🔐 reactivate-membership-manual — Manual Membership Reactivation with Full Governance
 *
 * SAFE GOLD:
 * - NÃO apaga histórico de auditoria
 * - NÃO reabre pagamento automaticamente (volta para DRAFT)
 * - NÃO altera memberships pagas
 * - NÃO reativa cancelamentos automáticos (GC)
 * - Auditoria obrigatória
 *
 * SECURITY:
 * - JWT validado manualmente (padrão do codebase)
 * - Valida tenant boundary (membership.tenant_id === user tenant)
 * - Valida role (ADMIN_TENANT, STAFF_ORGANIZACAO)
 * - Impersonation obrigatório para SUPERADMIN
 * - Billing status check
 * - Rate limiting (10/hour/user)
 * - Motivo obrigatório (min 5 chars)
 * - Último evento DEVE ser MEMBERSHIP_MANUAL_CANCELLED
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

const OPERATION_NAME = "reactivate-membership-manual";

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REACTIVATE-MANUAL] ${step}${detailsStr}`);
};

interface ReactivateMembershipRequest {
  membershipId: string;
  reason: string;
  impersonationId?: string;
}

/**
 * Rate limiter preset: 10 reactivations per hour per user
 */
function reactivateMembershipRateLimiter() {
  return new SecureRateLimiter({
    operation: OPERATION_NAME,
    limit: 10,
    windowSeconds: 3600,
  });
}

/**
 * Generic error response (anti-enumeration)
 */
function forbiddenResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Operation not permitted" }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // 1️⃣ AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      logStep("Auth failed - missing header");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        reason: "MISSING_AUTH",
      });
      return new Response(
        JSON.stringify({ ok: false, error: "Operation not permitted" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      logStep("Auth failed - invalid token");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        reason: "INVALID_TOKEN",
      });
      return new Response(
        JSON.stringify({ ok: false, error: "Operation not permitted" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminProfileId = user.id;
    logStep("Admin authenticated", { adminProfileId });

    // ========================================================================
    // 2️⃣ RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = reactivateMembershipRateLimiter();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    // deno-lint-ignore no-explicit-any
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase as any);
    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { count: rateLimitResult.count });

      await logRateLimitBlock(supabase, {
        operation: OPERATION_NAME,
        user_id: user.id,
        ip_address: extractRequestContext(req).ip_address,
        count: rateLimitResult.count,
        limit: 10,
      });

      return rateLimiter.tooManyRequestsResponse(rateLimitResult, corsHeaders);
    }

    // ========================================================================
    // 3️⃣ PARSE INPUT
    // ========================================================================
    let body: ReactivateMembershipRequest;
    try {
      body = await req.json();
    } catch {
      logStep("Validation failed - invalid JSON");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "INVALID_PAYLOAD",
      });
      return forbiddenResponse();
    }

    const membershipId = body.membershipId;
    const reason = body.reason?.trim() || "";

    if (!membershipId) {
      logStep("Validation failed - missing membershipId");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "MISSING_MEMBERSHIP_ID",
      });
      return forbiddenResponse();
    }

    // Validate reason (min 5 chars)
    if (!reason || reason.length < 5) {
      logStep("Validation failed - reason too short", { length: reason.length });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "REASON_TOO_SHORT",
        metadata: { reason_length: reason.length },
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Reason must be at least 5 characters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
      logStep("Membership not found or error", { membershipId });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        reason_code: "MEMBERSHIP_NOT_FOUND",
      });
      return forbiddenResponse();
    }

    const targetTenantId = membership.tenant_id;
    const previousStatus = membership.status;
    logStep("Fetched membership", {
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
      logStep("Permission denied - no valid role");
      await logPermissionDenied(supabase, {
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        required_roles: ["ADMIN_TENANT", "STAFF_ORGANIZACAO", "SUPERADMIN_GLOBAL"],
        actual_roles: roles?.map((r) => r.role) || [],
        reason: "INSUFFICIENT_PERMISSIONS",
      });
      return forbiddenResponse();
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
        logStep("Impersonation validation failed", {
          error: impersonationCheck.error,
        });

        await logImpersonationBlock(supabase, {
          operation: OPERATION_NAME,
          user_id: user.id,
          tenant_id: targetTenantId,
          impersonation_id: impersonationId || undefined,
          reason: impersonationCheck.error || "INVALID_IMPERSONATION",
        });

        return forbiddenResponse();
      }

      logStep("Superadmin with valid impersonation", {
        impersonationId: impersonationCheck.impersonationId,
      });
    }

    logStep("Authorization verified", { isSuperadmin, isTenantAdmin });

    // ========================================================================
    // 6️⃣ BILLING STATUS CHECK
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabase, targetTenantId);
    if (!billingCheck.allowed) {
      logStep("Billing status blocked operation", {
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

    logStep("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // 7️⃣ VALIDATE MEMBERSHIP STATUS
    // ========================================================================
    // Idempotent return for DRAFT or PENDING states
    if (["DRAFT", "PENDING_PAYMENT", "PENDING_REVIEW"].includes(previousStatus)) {
      logStep("Membership already in eligible state - idempotent return", {
        membershipId,
        status: previousStatus,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          membershipId,
          previousStatus,
          newStatus: previousStatus,
          idempotent: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Only CANCELLED can be reactivated
    if (previousStatus !== "CANCELLED") {
      logStep("Invalid status for reactivation", { status: previousStatus });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "LOW",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "INVALID_STATUS",
        metadata: { current_status: previousStatus },
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "STATUS_NOT_ELIGIBLE",
          details: `Cannot reactivate membership with status ${previousStatus}. Only CANCELLED memberships can be reactivated.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ========================================================================
    // 8️⃣ BLOCK IF ALREADY PAID
    // ========================================================================
    if (membership.payment_status === "PAID") {
      logStep("Cannot reactivate paid membership", { membershipId });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "ALREADY_PAID",
        metadata: { payment_status: membership.payment_status },
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "CANNOT_REACTIVATE_PAID_MEMBERSHIP",
          details: "Paid memberships cannot be reactivated.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ========================================================================
    // 9️⃣ VALIDATE LAST AUDIT EVENT === MEMBERSHIP_MANUAL_CANCELLED
    // ========================================================================
    const { data: cancelEvents } = await supabase
      .from("audit_logs")
      .select("event_type, metadata, created_at")
      .in("event_type", [
        "MEMBERSHIP_MANUAL_CANCELLED",
        "MEMBERSHIP_PENDING_PAYMENT_CLEANUP",
        "MEMBERSHIP_ABANDONED_CLEANUP",
      ])
      .order("created_at", { ascending: false })
      .limit(50);

    // Find matching log for this membership
    const lastCancelEvent = cancelEvents?.find((log) => {
      const meta = log.metadata as { membership_id?: string } | null;
      return meta?.membership_id === membershipId;
    });

    if (!lastCancelEvent) {
      logStep("No cancellation event found", { membershipId });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "NO_CANCELLATION_EVENT_FOUND",
        metadata: { membership_id: membershipId },
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "NO_CANCELLATION_EVENT_FOUND",
          details: "Could not find cancellation event for this membership.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Only allow reactivation for manual cancellations
    if (lastCancelEvent.event_type !== "MEMBERSHIP_MANUAL_CANCELLED") {
      logStep("Reactivation not allowed for GC cancellation", {
        membershipId,
        event_type: lastCancelEvent.event_type,
      });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: "MEDIUM",
        operation: OPERATION_NAME,
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: "REACTIVATION_NOT_ALLOWED_FOR_GC",
        metadata: {
          membership_id: membershipId,
          last_event: lastCancelEvent.event_type,
        },
      });
      return new Response(
        JSON.stringify({
          ok: false,
          error: "REACTIVATION_NOT_ALLOWED_FOR_GC_CANCELLATION",
          details:
            "This membership was cancelled by automatic garbage collection. Use the retry payment flow instead.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    logStep("Last event validated as manual cancellation");

    // ========================================================================
    // 🔟 UPDATE MEMBERSHIP TO DRAFT (Race-safe)
    // ========================================================================
    // GOV-001B: Transition status via gatekeeper RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "DRAFT",
      p_reason: reason,
      p_actor_profile_id: adminProfileId,
      p_notes: null,
    });

    if (rpcError) {
      logStep("Gatekeeper RPC failed", { error: rpcError.message });
      if (rpcError.message?.includes("Invalid transition")) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "STATUS_CHANGED",
            details: "Membership status changed during operation",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      return new Response(
        JSON.stringify({ ok: false, error: "Operation failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    logStep("Membership reactivated", { newStatus: "DRAFT" });

    // ========================================================================
    // 1️⃣1️⃣ AUDIT LOG — Membership Manually Reactivated
    // ========================================================================
    const actorRole = isSuperadmin
      ? "SUPERADMIN_GLOBAL"
      : isTenantAdmin
        ? "ADMIN_TENANT"
        : "STAFF_ORGANIZACAO";
    const impersonationIdForLog = isSuperadmin
      ? extractImpersonationId(req, body)
      : null;
    const clientIP = extractRequestContext(req).ip_address;

    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_MANUAL_REACTIVATED,
      tenant_id: targetTenantId,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        previous_status: previousStatus,
        new_status: "DRAFT",
        reactivation_source: "manual_admin",
        reason: reason,
        actor_role: actorRole,
        impersonation_id: impersonationIdForLog,
        ip_address: clientIP,
      },
    });

    // ========================================================================
    // 1️⃣2️⃣ DECISION LOG — SUCCESS
    // ========================================================================
    await logDecision(supabase, {
      decision_type: "MEMBERSHIP_MANUAL_REACTIVATED",
      severity: "MEDIUM",
      operation: OPERATION_NAME,
      user_id: adminProfileId,
      tenant_id: targetTenantId,
      reason_code: "SUCCESS",
      metadata: {
        membership_id: membershipId,
        previous_status: previousStatus,
        new_status: "DRAFT",
        reason: reason,
      },
    });

    logStep("Operation complete", { membershipId, newStatus: "DRAFT" });

    // ========================================================================
    // 1️⃣3️⃣ SUCCESS RESPONSE
    // ========================================================================
    return new Response(
      JSON.stringify({
        ok: true,
        membershipId,
        previousStatus,
        newStatus: "DRAFT",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    logStep("Unhandled error", { error: errorMessage });
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

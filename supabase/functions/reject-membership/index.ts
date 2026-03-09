/**
 * 🔐 reject-membership — Hardened Membership Rejection
 * 
 * SECURITY (C6 Hardening):
 * - Requires ADMIN_TENANT or SUPERADMIN_GLOBAL role
 * - If superadmin, requires valid impersonation session
 * - Rate limited: 10 per hour per user
 * - Full decision logging for all paths
 * - Anti-enumeration responses
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { buildErrorEnvelope, errorResponse, okResponse, ERROR_CODES } from "../_shared/errors/envelope.ts";
import { resolveMembershipNotification, shouldSend, type NotificationInput } from "../_shared/notification-engine.ts";
import { getEmailClient, DEFAULT_EMAIL_FROM, isEmailConfigured } from "../_shared/emailClient.ts";
import { getMembershipRejectedTemplate } from "../_shared/email-templates/membership/rejected.ts";
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
  logMembershipRejected,
  logBillingRestricted,
  DECISION_TYPES,
} from "../_shared/decision-logger.ts";
import {
  requireBillingStatus,
  billingRestrictedResponse,
} from "../_shared/requireBillingStatus.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

interface RejectMembershipRequest {
  membershipId: string;
  reason?: string;
  rejectionReason?: string;
  impersonationId?: string;
}

/**
 * Rate limiter preset: 10 rejections per hour per user
 */
function rejectMembershipRateLimiter() {
  return new SecureRateLimiter({
    operation: "reject-membership",
    limit: 10,
    windowSeconds: 3600,
  });
}

/**
 * Generic error response (anti-enumeration)
 */
function forbiddenResp(correlationId?: string): Response {
  return errorResponse(403, buildErrorEnvelope(
    ERROR_CODES.FORBIDDEN, "auth.operation_not_permitted", false, undefined, correlationId
  ), corsHeaders);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("reject-membership", correlationId);

  try {
    // ========================================================================
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    // ========================================================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      log.error("Fail-fast: missing required env vars", undefined, {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
        hasAnonKey: !!supabaseAnonKey,
      });
      return errorResponse(500, buildErrorEnvelope(
        ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId
      ), corsHeaders);
    }

    // PI-AUTH-CLIENT-SPLIT-001: Two-client architecture
    // - supabaseAdmin → SERVICE_ROLE (all DB/RPC operations)
    // - supabaseAuth  → ANON KEY + Authorization header (JWT validation only)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get("authorization") ?? "" },
      },
    });

    // ========================================================================
    // 1️⃣ AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      log.warn("Auth failed - missing header");
      await logPermissionDenied(supabaseAdmin, {
        operation: 'reject-membership',
        reason: 'MISSING_AUTH',
      });
      return errorResponse(401, buildErrorEnvelope(
        ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId
      ), corsHeaders);
    }

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      log.warn("Auth failed - invalid token");
      await logPermissionDenied(supabaseAdmin, {
        operation: 'reject-membership',
        reason: 'INVALID_TOKEN',
      });
      return errorResponse(401, buildErrorEnvelope(
        ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId
      ), corsHeaders);
    }

    const adminProfileId = user.id;
    log.setUser(adminProfileId);
    log.info("Admin authenticated");

    // ========================================================================
    // 2️⃣ RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = rejectMembershipRateLimiter();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    // deno-lint-ignore no-explicit-any
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabaseAdmin as any);
    if (!rateLimitResult.allowed) {
      log.warn("Rate limit exceeded", { count: rateLimitResult.count });
      
      await logRateLimitBlock(supabaseAdmin, {
        operation: 'reject-membership',
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
    let body: RejectMembershipRequest;
    try {
      body = await req.json();
    } catch {
      log.warn("Validation failed - invalid JSON");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'INVALID_PAYLOAD',
      });
      return forbiddenResp(correlationId);
    }

    const membershipId = body.membershipId;
    const rejectionReason = body.rejectionReason || body.reason || "";

    if (!membershipId) {
      log.warn("Validation failed - missing membershipId");
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'MISSING_MEMBERSHIP_ID',
      });
      return forbiddenResp(correlationId);
    }

    // ========================================================================
    // 4️⃣ FETCH MEMBERSHIP (before auth check - need tenant_id)
    // ========================================================================
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select(`
        id,
        status,
        tenant_id,
        applicant_data,
        applicant_profile_id,
        rejection_reason,
        email_sent_for_status
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      log.warn("Membership not found or error", { membershipId });
      // Anti-enumeration: don't reveal if it exists
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'MEMBERSHIP_NOT_FOUND',
      });
      return forbiddenResp(correlationId);
    }

    const targetTenantId = membership.tenant_id;
    const previousStatus = membership.status;
    log.setTenant(targetTenantId);
    log.info("Fetched membership", { previousStatus, membershipId });

    // ========================================================================
    // 5️⃣ AUTHORIZATION CHECK (Role + Impersonation)
    // ========================================================================
    
    // 5.1 Check user roles
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", adminProfileId);

    const isSuperadmin = roles?.some(r => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null);
    const isTenantAdmin = roles?.some(r => 
      (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && 
      r.tenant_id === targetTenantId
    );

    if (!isSuperadmin && !isTenantAdmin) {
      log.warn("Permission denied - no valid role");
      await logPermissionDenied(supabaseAdmin, {
        operation: 'reject-membership',
        user_id: user.id,
        tenant_id: targetTenantId,
        required_roles: ['ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'SUPERADMIN_GLOBAL'],
        actual_roles: roles?.map(r => r.role) || [],
        reason: 'INSUFFICIENT_PERMISSIONS',
      });
      return forbiddenResp(correlationId);
    }

    // 5.2 If superadmin, REQUIRE valid impersonation
    if (isSuperadmin) {
      const impersonationId = extractImpersonationId(req, body);
      // deno-lint-ignore no-explicit-any
      const impersonationCheck = await requireImpersonationIfSuperadmin(
        supabaseAdmin as any,
        user.id,
        targetTenantId,
        impersonationId
      );

      if (!impersonationCheck.valid) {
        log.warn("Impersonation validation failed", { error: impersonationCheck.error });
        
        await logImpersonationBlock(supabaseAdmin, {
          operation: 'reject-membership',
          user_id: user.id,
          tenant_id: targetTenantId,
          impersonation_id: impersonationId || undefined,
          reason: impersonationCheck.error || 'INVALID_IMPERSONATION',
        });
        
        return forbiddenResp(correlationId);
      }

      log.info("Superadmin with valid impersonation", { impersonationId: impersonationCheck.impersonationId });
    }

    log.info("Authorization verified", { isSuperadmin, isTenantAdmin });

    // ========================================================================
    // 5️⃣.5️⃣ BILLING STATUS CHECK (P1 - Block operations on restricted tenants)
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabaseAdmin, targetTenantId);
    if (!billingCheck.allowed) {
      log.warn("Billing status blocked operation", { 
        status: billingCheck.status, 
        code: billingCheck.code 
      });
      
      await logBillingRestricted(supabaseAdmin, {
        operation: 'reject-membership',
        user_id: user.id,
        tenant_id: targetTenantId,
        billing_status: billingCheck.status,
      });
      
      return billingRestrictedResponse(billingCheck.status);
    }

    log.info("Billing status OK", { status: billingCheck.status });

    // ========================================================================
    // 6️⃣ VALIDATE MEMBERSHIP STATUS
    // ========================================================================
    if (previousStatus !== "PENDING_REVIEW") {
      log.warn("Invalid status for rejection", { status: previousStatus });
      await logDecision(supabaseAdmin, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: 'INVALID_STATUS',
        metadata: { current_status: previousStatus },
      });
      return forbiddenResp(correlationId);
    }

    // ========================================================================
    // 7️⃣ UPDATE MEMBERSHIP TO REJECTED
    // ========================================================================
    const finalRejectionReason = rejectionReason.trim() || membership.rejection_reason || "Motivo não informado";
    
    // GOV-001B: Transition status via gatekeeper RPC
    const { error: rpcError } = await supabaseAdmin.rpc("change_membership_state", {
      p_membership_id: membershipId,
      p_new_status: "REJECTED",
      p_reason: finalRejectionReason,
      p_actor_profile_id: adminProfileId,
      p_notes: finalRejectionReason,
    });

    if (rpcError) {
      log.error("Gatekeeper RPC failed", rpcError);
      return errorResponse(500, buildErrorEnvelope(
        ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId
      ), corsHeaders);
    }

    log.info("Membership rejected", { newStatus: "REJECTED" });

    // ========================================================================
    // 8️⃣ DECISION LOG — SUCCESS
    // ========================================================================
    const actorRole = isSuperadmin ? 'SUPERADMIN_GLOBAL' : 'ADMIN_TENANT';
    const impersonationIdForLog = isSuperadmin ? extractImpersonationId(req, body) : null;
    
    await logMembershipRejected(supabaseAdmin, {
      user_id: adminProfileId,
      tenant_id: targetTenantId,
      membership_id: membershipId,
      rejection_reason: finalRejectionReason,
      impersonation_id: impersonationIdForLog,
      actor_role: actorRole,
    });

    // ========================================================================
    // 9️⃣ AUDIT LOG — Membership Rejected
    // ========================================================================
    const applicantData = membership.applicant_data as { full_name?: string } | null;
    const applicantName = applicantData?.full_name || "Unknown";

    await createAuditLog(supabaseAdmin, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_REJECTED,
      tenant_id: targetTenantId,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        applicant_name: applicantName,
        rejected_by: adminProfileId,
        rejection_reason: finalRejectionReason,
      },
    });

    // ========================================================================
    // 🔟 FETCH DATA FOR NOTIFICATION ENGINE
    // ========================================================================
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, slug, name, default_locale")
      .eq("id", targetTenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      log.warn("Could not fetch tenant", { error: tenantError?.message });
    }

    const applicantEmail = (membership.applicant_data as { email?: string } | null)?.email;
    const applicantFullName = applicantData?.full_name || "Atleta";

    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const originHeader = req.headers.get("origin");
    const baseUrl = (publicAppUrl || originHeader || "https://tatame.pro").replace(/\/$/, "");

    log.info("Data collected for engine", {
      hasApplicantEmail: !!applicantEmail,
      tenantSlug: tenant?.slug,
      baseUrl,
    });

    // ========================================================================
    // 1️⃣1️⃣ EMAIL NOTIFICATION
    // ========================================================================
    const emailResult: {
      shouldSend: boolean;
      sent: boolean;
      templateId: string | null;
      skippedReason: string | null;
    } = {
      shouldSend: false,
      sent: false,
      templateId: null,
      skippedReason: null,
    };

    if (!tenant || !applicantEmail) {
      log.info("Email skip - missing required data", { 
        hasTenant: !!tenant, 
        hasApplicantEmail: !!applicantEmail 
      });
      emailResult.skippedReason = "missing_data";
    } else {
      const notificationInput: NotificationInput = {
        previousStatus: previousStatus as "PENDING_REVIEW",
        newStatus: "REJECTED",
        membership: {
          id: membershipId,
          rejectionReason: finalRejectionReason,
        },
        athlete: {
          fullName: applicantFullName,
          email: applicantEmail,
        },
        tenant: {
          name: tenant.name,
          slug: tenant.slug,
          defaultLocale: (tenant.default_locale as "pt-BR" | "en") || "pt-BR",
        },
        baseUrl,
      };

      const decision = resolveMembershipNotification(notificationInput);
      
      log.info("Email engine decision", { 
        shouldSendEmail: decision.shouldSendEmail,
        templateId: shouldSend(decision) ? decision.templateId : null,
      });

      emailResult.shouldSend = decision.shouldSendEmail;

      if (shouldSend(decision)) {
        emailResult.templateId = decision.templateId;

        const emailAlreadySent = membership.email_sent_for_status === "REJECTED";
        
        if (emailAlreadySent) {
          log.info("Email skip - already sent for status REJECTED");
          emailResult.skippedReason = "already_sent";
        } else if (!isEmailConfigured()) {
          log.info("Email skip - email not configured");
          emailResult.skippedReason = "email_not_configured";
        } else {
          try {
            const resend = getEmailClient();
            
            const { subject, html } = getMembershipRejectedTemplate({
              athleteName: applicantFullName,
              tenantName: tenant.name,
              rejectionReason: finalRejectionReason,
              reapplyUrl: decision.ctaUrl,
            });

            const emailResponse = await resend.emails.send({
              from: DEFAULT_EMAIL_FROM,
              to: [applicantEmail],
              subject,
              html,
            });

            log.info("Email sent successfully", { 
              emailId: emailResponse?.data?.id,
              recipient: applicantEmail,
            });

            emailResult.sent = true;

            await createAuditLog(supabaseAdmin, {
              event_type: "EMAIL_SENT",
              tenant_id: targetTenantId,
              profile_id: adminProfileId,
              metadata: {
                template_id: decision.templateId,
                membership_id: membershipId,
                recipient_email: applicantEmail,
                status: "REJECTED",
                sent_at: new Date().toISOString(),
              },
            });

            await supabaseAdmin
              .from("memberships")
              .update({ email_sent_for_status: "REJECTED" })
              .eq("id", membershipId);

            log.info("Idempotency flag set", { email_sent_for_status: "REJECTED" });

          } catch (emailError) {
            const errorMessage = emailError instanceof Error ? emailError.message : "Unknown email error";
            log.error("Email failed", emailError);

            emailResult.sent = false;
            emailResult.skippedReason = "send_failed";

            await createAuditLog(supabaseAdmin, {
              event_type: "EMAIL_FAILED",
              tenant_id: targetTenantId,
              profile_id: adminProfileId,
              metadata: {
                template_id: decision.templateId,
                membership_id: membershipId,
                recipient_email: applicantEmail,
                status: "REJECTED",
                error: errorMessage,
              },
            });
          }
        }
      } else {
        emailResult.skippedReason = "engine_noop";
      }
    }

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    log.info("Completed", { 
      rejected: true, 
      emailSent: emailResult.sent 
    });

    return okResponse({
      rejected: true,
      membershipId,
      previousStatus,
      newStatus: "REJECTED",
      email: emailResult,
    }, corsHeaders, correlationId);

  } catch (error: unknown) {
    log.error("Unexpected error", error);
    
    // Anti-enumeration: generic error response
    return errorResponse(500, buildErrorEnvelope(
      ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId
    ), corsHeaders);
  }
});

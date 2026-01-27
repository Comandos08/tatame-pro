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
  DECISION_TYPES,
} from "../_shared/decision-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-impersonation-id",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[REJECT] ${step}${detailsStr}`);
};

const logEmail = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EMAIL] ${step}${detailsStr}`);
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
function forbiddenResponse(): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Operation not permitted" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        operation: 'reject-membership',
        reason: 'MISSING_AUTH',
      });
      return new Response(
        JSON.stringify({ ok: false, error: "Operation not permitted" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      logStep("Auth failed - invalid token");
      await logPermissionDenied(supabase, {
        operation: 'reject-membership',
        reason: 'INVALID_TOKEN',
      });
      return new Response(
        JSON.stringify({ ok: false, error: "Operation not permitted" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminProfileId = user.id;
    logStep("Admin authenticated", { adminProfileId });

    // ========================================================================
    // 2️⃣ RATE LIMITING (before any business logic)
    // ========================================================================
    const rateLimiter = rejectMembershipRateLimiter();
    const rateLimitCtx = buildRateLimitContext(req, user.id, null);
    // deno-lint-ignore no-explicit-any
    const rateLimitResult = await rateLimiter.check(rateLimitCtx, supabase as any);
    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { count: rateLimitResult.count });
      
      await logRateLimitBlock(supabase, {
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
      logStep("Validation failed - invalid JSON");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'INVALID_PAYLOAD',
      });
      return forbiddenResponse();
    }

    const membershipId = body.membershipId;
    const rejectionReason = body.rejectionReason || body.reason || "";

    if (!membershipId) {
      logStep("Validation failed - missing membershipId");
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'MISSING_MEMBERSHIP_ID',
      });
      return forbiddenResponse();
    }

    // ========================================================================
    // 4️⃣ FETCH MEMBERSHIP (before auth check - need tenant_id)
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
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
      logStep("Membership not found or error", { membershipId });
      // Anti-enumeration: don't reveal if it exists
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        reason_code: 'MEMBERSHIP_NOT_FOUND',
      });
      return forbiddenResponse();
    }

    const targetTenantId = membership.tenant_id;
    const previousStatus = membership.status;
    logStep("Fetched membership", { previousStatus, membershipId, tenantId: targetTenantId });

    // ========================================================================
    // 5️⃣ AUTHORIZATION CHECK (Role + Impersonation)
    // ========================================================================
    
    // 5.1 Check user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", adminProfileId);

    const isSuperadmin = roles?.some(r => r.role === "SUPERADMIN_GLOBAL" && r.tenant_id === null);
    const isTenantAdmin = roles?.some(r => 
      (r.role === "ADMIN_TENANT" || r.role === "STAFF_ORGANIZACAO") && 
      r.tenant_id === targetTenantId
    );

    if (!isSuperadmin && !isTenantAdmin) {
      logStep("Permission denied - no valid role");
      await logPermissionDenied(supabase, {
        operation: 'reject-membership',
        user_id: user.id,
        tenant_id: targetTenantId,
        required_roles: ['ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'SUPERADMIN_GLOBAL'],
        actual_roles: roles?.map(r => r.role) || [],
        reason: 'INSUFFICIENT_PERMISSIONS',
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
        logStep("Impersonation validation failed", { error: impersonationCheck.error });
        
        await logImpersonationBlock(supabase, {
          operation: 'reject-membership',
          user_id: user.id,
          tenant_id: targetTenantId,
          impersonation_id: impersonationId || undefined,
          reason: impersonationCheck.error || 'INVALID_IMPERSONATION',
        });
        
        return forbiddenResponse();
      }

      logStep("Superadmin with valid impersonation", { impersonationId: impersonationCheck.impersonationId });
    }

    logStep("Authorization verified", { isSuperadmin, isTenantAdmin });

    // ========================================================================
    // 6️⃣ VALIDATE MEMBERSHIP STATUS
    // ========================================================================
    if (previousStatus !== "PENDING_REVIEW") {
      logStep("Invalid status for rejection", { status: previousStatus });
      await logDecision(supabase, {
        decision_type: DECISION_TYPES.VALIDATION_FAILURE,
        severity: 'LOW',
        operation: 'reject-membership',
        user_id: user.id,
        tenant_id: targetTenantId,
        reason_code: 'INVALID_STATUS',
        metadata: { current_status: previousStatus },
      });
      return forbiddenResponse();
    }

    // ========================================================================
    // 7️⃣ UPDATE MEMBERSHIP TO REJECTED
    // ========================================================================
    const finalRejectionReason = rejectionReason.trim() || membership.rejection_reason || "Motivo não informado";
    
    const { error: updateError } = await supabase
      .from("memberships")
      .update({
        status: "REJECTED",
        rejected_at: new Date().toISOString(),
        rejection_reason: finalRejectionReason,
        rejected_by_profile_id: adminProfileId,
        review_notes: finalRejectionReason,
        reviewed_by_profile_id: adminProfileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (updateError) {
      logStep("Failed to update membership", { error: updateError.message });
      return new Response(
        JSON.stringify({ ok: false, error: "Operation not permitted" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Membership rejected", { newStatus: "REJECTED" });

    // ========================================================================
    // 8️⃣ DECISION LOG — SUCCESS
    // ========================================================================
    const actorRole = isSuperadmin ? 'SUPERADMIN_GLOBAL' : 'ADMIN_TENANT';
    const impersonationIdForLog = isSuperadmin ? extractImpersonationId(req, body) : null;
    
    await logMembershipRejected(supabase, {
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

    await createAuditLog(supabase, {
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
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug, name, default_locale")
      .eq("id", targetTenantId)
      .single();

    if (tenantError || !tenant) {
      logStep("Warning: Could not fetch tenant", { error: tenantError?.message });
    }

    const applicantEmail = (membership.applicant_data as { email?: string } | null)?.email;
    const applicantFullName = applicantData?.full_name || "Atleta";

    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const originHeader = req.headers.get("origin");
    const baseUrl = (publicAppUrl || originHeader || "https://tatame.pro").replace(/\/$/, "");

    logStep("Data collected for engine", {
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
      logEmail("Skip - missing required data", { 
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
      
      logEmail("Engine decision", { 
        shouldSendEmail: decision.shouldSendEmail,
        templateId: shouldSend(decision) ? decision.templateId : null,
      });

      emailResult.shouldSend = decision.shouldSendEmail;

      if (shouldSend(decision)) {
        emailResult.templateId = decision.templateId;

        const emailAlreadySent = membership.email_sent_for_status === "REJECTED";
        
        if (emailAlreadySent) {
          logEmail("Skip - already sent for status REJECTED");
          emailResult.skippedReason = "already_sent";
        } else if (!isEmailConfigured()) {
          logEmail("Skip - email not configured");
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

            logEmail("Email sent successfully", { 
              emailId: emailResponse?.data?.id,
              recipient: applicantEmail,
            });

            emailResult.sent = true;

            await createAuditLog(supabase, {
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

            await supabase
              .from("memberships")
              .update({ email_sent_for_status: "REJECTED" })
              .eq("id", membershipId);

            logEmail("Idempotency flag set", { email_sent_for_status: "REJECTED" });

          } catch (emailError) {
            const errorMessage = emailError instanceof Error ? emailError.message : "Unknown email error";
            logEmail("Email failed", { error: errorMessage });

            emailResult.sent = false;
            emailResult.skippedReason = "send_failed";

            await createAuditLog(supabase, {
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
    logStep("Completed", { 
      rejected: true, 
      emailSent: emailResult.sent 
    });

    return new Response(
      JSON.stringify({
        ok: true,
        rejected: true,
        membershipId,
        previousStatus,
        newStatus: "REJECTED",
        email: emailResult,
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Unexpected error", { error: errorMessage });
    
    // Anti-enumeration: generic error response
    return new Response(
      JSON.stringify({ ok: false, error: "Operation not permitted" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

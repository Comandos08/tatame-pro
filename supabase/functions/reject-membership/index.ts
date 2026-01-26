import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { resolveMembershipNotification, shouldSend, type NotificationInput } from "../_shared/notification-engine.ts";
import { getEmailClient, DEFAULT_EMAIL_FROM, isEmailConfigured } from "../_shared/emailClient.ts";
import { getMembershipRejectedTemplate } from "../_shared/email-templates/membership/rejected.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  rejectionReason?: string; // Alternative field name for compatibility
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // 1️⃣ AUTH & PERMISSION
    // =========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: Missing authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const adminProfileId = user.id;
    logStep("Admin authenticated", { adminProfileId });

    // Parse request body with compatibility for both field names
    const body: RejectMembershipRequest = await req.json();
    const membershipId = body.membershipId;
    const rejectionReason = body.rejectionReason || body.reason || "";

    if (!membershipId) {
      throw new Error("Missing membershipId");
    }

    // =========================================================================
    // 2️⃣ FETCH MEMBERSHIP (BEFORE UPDATE)
    // =========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        id,
        status,
        tenant_id,
        applicant_data,
        applicant_profile_id,
        rejection_reason
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    const previousStatus = membership.status;
    logStep("Fetched membership", { previousStatus, membershipId });

    // Validate status
    if (previousStatus !== "PENDING_REVIEW") {
      throw new Error(`Invalid status: ${previousStatus}. Only PENDING_REVIEW can be rejected.`);
    }

    // =========================================================================
    // 3️⃣ CHECK ADMIN PERMISSIONS
    // =========================================================================
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminProfileId)
      .or(`tenant_id.eq.${membership.tenant_id},tenant_id.is.null`);

    const validRoles = ["SUPERADMIN_GLOBAL", "ADMIN_TENANT", "STAFF_ORGANIZACAO"];
    const hasPermission = roles?.some(r => validRoles.includes(r.role));
    
    if (!hasPermission) {
      throw new Error("Forbidden: Insufficient permissions");
    }

    logStep("Admin permissions verified");

    // =========================================================================
    // 4️⃣ UPDATE MEMBERSHIP TO REJECTED
    // =========================================================================
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
      throw new Error(`Failed to update membership: ${updateError.message}`);
    }

    logStep("Membership rejected", { newStatus: "REJECTED" });

    // Create audit log for rejection
    const applicantData = membership.applicant_data as { full_name?: string } | null;
    const applicantName = applicantData?.full_name || "Unknown";

    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.MEMBERSHIP_REJECTED,
      tenant_id: membership.tenant_id,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        applicant_name: applicantName,
        rejected_by: adminProfileId,
        rejection_reason: finalRejectionReason,
      },
    });

    // =========================================================================
    // 5️⃣ FETCH DATA FOR NOTIFICATION ENGINE
    // =========================================================================
    
    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug, name, default_locale")
      .eq("id", membership.tenant_id)
      .single();

    if (tenantError || !tenant) {
      logStep("Warning: Could not fetch tenant", { error: tenantError?.message });
    }

    // Get applicant data from membership.applicant_data (since no athlete is created on rejection)
    const applicantEmail = (membership.applicant_data as { email?: string } | null)?.email;
    const applicantFullName = applicantData?.full_name || "Atleta";

    // Resolve baseUrl
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const originHeader = req.headers.get("origin");
    const baseUrl = (publicAppUrl || originHeader || "https://tatame.pro").replace(/\/$/, "");

    logStep("Data collected for engine", {
      hasApplicantEmail: !!applicantEmail,
      tenantSlug: tenant?.slug,
      baseUrl,
    });

    // =========================================================================
    // 6️⃣ CALL NOTIFICATION ENGINE
    // =========================================================================
    
    // Prepare email response object
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

    // Only proceed with notification if we have required data
    if (!tenant || !applicantEmail) {
      logEmail("Skip - missing required data", { 
        hasTenant: !!tenant, 
        hasApplicantEmail: !!applicantEmail 
      });
      emailResult.skippedReason = "missing_data";
    } else {
      // Build notification input
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

        // =====================================================================
        // 7️⃣ SEND EMAIL
        // =====================================================================
        
        if (!isEmailConfigured()) {
          logEmail("Skip - email not configured");
          emailResult.skippedReason = "email_not_configured";
        } else {
          try {
            const resend = getEmailClient();
            
            // Get email template
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

            // 8️⃣ AUDIT LOG - EMAIL_SENT
            await createAuditLog(supabase, {
              event_type: "EMAIL_SENT",
              tenant_id: membership.tenant_id,
              profile_id: adminProfileId,
              metadata: {
                template_id: decision.templateId,
                membership_id: membershipId,
                recipient_email: applicantEmail,
                status: "REJECTED",
                sent_at: new Date().toISOString(),
              },
            });

          } catch (emailError) {
            const errorMessage = emailError instanceof Error ? emailError.message : "Unknown email error";
            logEmail("Email failed", { error: errorMessage });

            emailResult.sent = false;
            emailResult.skippedReason = "send_failed";

            // 8️⃣ AUDIT LOG - EMAIL_FAILED
            await createAuditLog(supabase, {
              event_type: "EMAIL_FAILED",
              tenant_id: membership.tenant_id,
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

    // =========================================================================
    // 🔟 RESPONSE JSON (STANDARDIZED)
    // =========================================================================
    logStep("Completed", { 
      rejected: true, 
      emailSent: emailResult.sent 
    });

    return new Response(
      JSON.stringify({
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
    logStep("Error", { error: errorMessage });
    
    const statusCode = errorMessage.includes("Unauthorized") ? 401 
      : errorMessage.includes("Forbidden") ? 403 
      : errorMessage.includes("Invalid status") ? 400
      : errorMessage.includes("Missing") ? 400
      : 500;

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: statusCode }
    );
  }
});

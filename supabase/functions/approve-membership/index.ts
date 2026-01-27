import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getEmailClient, isEmailConfigured, DEFAULT_EMAIL_FROM } from "../_shared/emailClient.ts";
import { getMembershipApprovedTemplate, type EmailLayoutData } from "../_shared/email-templates/index.ts";
import {
  resolveMembershipNotification,
  shouldSend,
  type MembershipStatus,
  type SupportedLocale,
} from "../_shared/notification-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[APPROVE] ${step}${detailsStr}`);
};

interface ApproveMembershipRequest {
  membershipId: string;
  academyId?: string | null;
  coachId?: string | null;
  reviewNotes?: string | null;
  roles?: string[]; // NEW: Selected roles to assign
}

// Valid roles that can be assigned during approval
const VALID_APPROVAL_ROLES = [
  'ATLETA',
  'COACH_ASSISTENTE', 
  'COACH_PRINCIPAL',
  'INSTRUTOR',
  'STAFF_ORGANIZACAO',
] as const;

type ApprovalRole = typeof VALID_APPROVAL_ROLES[number];

interface ApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface DocumentUploaded {
  type: string;
  storage_path: string;
  file_type: string;
}

// ============================================================================
// EMAIL RESPONSE TYPE
// ============================================================================

interface EmailResult {
  shouldSend: boolean;
  sent: boolean;
  templateId: string | null;
  skippedReason: 'already_sent' | 'engine_noop' | 'resend_not_configured' | null;
}

// ============================================================================
// BASE URL RESOLUTION
// ============================================================================

function resolveBaseUrl(req: Request): string {
  // Priority 1: Environment variable
  const envUrl = Deno.env.get("PUBLIC_APP_URL");
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  // Priority 2: Request origin header
  const origin = req.headers.get("origin");
  if (origin) {
    return origin.replace(/\/$/, '');
  }

  // Fallback: Production URL
  return "https://tatame-pro.lovable.app";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Variables for response
  let approved = false;
  let membershipId = "";
  let previousStatus: MembershipStatus = "PENDING_REVIEW";
  let newStatus: MembershipStatus = "APPROVED";
  let emailResult: EmailResult = {
    shouldSend: false,
    sent: false,
    templateId: null,
    skippedReason: null,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================================================
    // AUTH VALIDATION
    // ========================================================================
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) {
      throw new Error("Unauthorized: Invalid token");
    }

    const adminProfileId = user.id;
    logStep("Admin authenticated", { adminProfileId });

    // ========================================================================
    // PARSE INPUT
    // ========================================================================
    const body: ApproveMembershipRequest = await req.json();
    membershipId = body.membershipId;
    const { academyId, coachId, reviewNotes, roles: requestedRoles } = body;

    if (!membershipId) {
      throw new Error("Missing membershipId");
    }
    
    // ========================================================================
    // VALIDATE ROLES - At least one role is required
    // ========================================================================
    const validatedRoles: ApprovalRole[] = [];
    
    if (!requestedRoles || requestedRoles.length === 0) {
      // Default to ATLETA if no roles provided (backward compatibility)
      validatedRoles.push('ATLETA');
      logStep("No roles provided, defaulting to ATLETA");
    } else {
      // Validate each role
      for (const role of requestedRoles) {
        if (VALID_APPROVAL_ROLES.includes(role as ApprovalRole)) {
          validatedRoles.push(role as ApprovalRole);
        } else {
          logStep("Invalid role rejected", { role });
        }
      }
      
      if (validatedRoles.length === 0) {
        throw new Error("No valid roles provided. At least one role is required.");
      }
    }
    
    logStep("Roles validated", { roles: validatedRoles });

    // ========================================================================
    // 1. FETCH MEMBERSHIP (before update)
    // ========================================================================
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select(`
        id,
        status,
        payment_status,
        tenant_id,
        applicant_profile_id,
        applicant_data,
        documents_uploaded,
        price_cents,
        currency,
        end_date,
        rejection_reason,
        email_sent_for_status
      `)
      .eq("id", membershipId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error(membershipError?.message || "Membership not found");
    }

    previousStatus = membership.status as MembershipStatus;
    logStep("Fetched membership", { status: previousStatus, payment: membership.payment_status });

    // Validate status
    if (previousStatus !== "PENDING_REVIEW") {
      throw new Error(`Invalid status: ${previousStatus}. Only PENDING_REVIEW can be approved.`);
    }

    // Validate payment
    if (membership.payment_status !== "PAID") {
      throw new Error("Payment not completed");
    }

    // Check if applicant_data exists
    const applicantData = membership.applicant_data as ApplicantData | null;
    if (!applicantData) {
      throw new Error("Missing applicant data");
    }

    // ========================================================================
    // 2. CHECK ADMIN PERMISSIONS
    // ========================================================================
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

    // ========================================================================
    // 3. FETCH TENANT DATA (for notification engine)
    // ========================================================================
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, slug, name, default_locale")
      .eq("id", membership.tenant_id)
      .single();

    if (tenantError || !tenant) {
      throw new Error("Tenant not found");
    }

    logStep("Tenant data fetched", { slug: tenant.slug });

    // ========================================================================
    // 4. CREATE ATHLETE
    // ========================================================================
    const { data: athlete, error: athleteError } = await supabase
      .from("athletes")
      .insert({
        tenant_id: membership.tenant_id,
        profile_id: membership.applicant_profile_id,
        full_name: applicantData.full_name,
        birth_date: applicantData.birth_date,
        national_id: applicantData.national_id,
        gender: applicantData.gender,
        email: applicantData.email,
        phone: applicantData.phone,
        address_line1: applicantData.address_line1,
        address_line2: applicantData.address_line2 || null,
        city: applicantData.city,
        state: applicantData.state,
        postal_code: applicantData.postal_code,
        country: applicantData.country,
        current_academy_id: academyId || null,
        current_main_coach_id: coachId || null,
      })
      .select()
      .single();

    if (athleteError) {
      throw new Error(`Failed to create athlete: ${athleteError.message}`);
    }

    logStep("Athlete created", { athleteId: athlete.id });

    // ========================================================================
    // 4.5. CREATE USER ROLES (CRITICAL - Roles only assigned here)
    // ========================================================================
    const createdRoles: string[] = [];
    
    for (const role of validatedRoles) {
      // Check if role already exists (idempotency)
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", membership.applicant_profile_id)
        .eq("tenant_id", membership.tenant_id)
        .eq("role", role)
        .maybeSingle();
      
      if (!existingRole) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: membership.applicant_profile_id,
            tenant_id: membership.tenant_id,
            role: role,
          });

        if (roleError) {
          logStep("Role creation warning", { role, error: roleError.message });
        } else {
          createdRoles.push(role);
          logStep("Role created", { role, profileId: membership.applicant_profile_id });
        }
      } else {
        logStep("Role already exists, skipping", { role });
        createdRoles.push(role); // Count as assigned even if pre-existing
      }
    }
    
    // Audit log for role grants
    if (createdRoles.length > 0) {
      await supabase.from("audit_logs").insert({
        event_type: "ROLES_GRANTED",
        tenant_id: membership.tenant_id,
        profile_id: adminProfileId,
        metadata: {
          target_profile_id: membership.applicant_profile_id,
          membership_id: membershipId,
          athlete_id: athlete.id,
          roles_granted: createdRoles,
          granted_by: adminProfileId,
          granted_at: new Date().toISOString(),
        },
      });
      logStep("Roles audit log created", { roles: createdRoles });
    }

    // ========================================================================
    // 5. MOVE DOCUMENTS
    // ========================================================================
    const documentsUploaded = membership.documents_uploaded as DocumentUploaded[] | null;
    const movedDocuments: DocumentUploaded[] = [];

    if (documentsUploaded && documentsUploaded.length > 0) {
      for (const doc of documentsUploaded) {
        const oldPath = doc.storage_path;
        const fileName = oldPath.split("/").pop() || `${doc.type.toLowerCase()}.${doc.file_type?.split("/")[1] || "pdf"}`;
        const newPath = `${membership.tenant_id}/${athlete.id}/${fileName}`;

        try {
          const { error: copyError } = await supabase.storage
            .from("documents")
            .copy(oldPath, newPath);

          if (copyError) {
            logStep("Copy warning", { oldPath, newPath, error: copyError.message });
          }

          const { error: deleteError } = await supabase.storage
            .from("documents")
            .remove([oldPath]);

          if (deleteError) {
            logStep("Delete warning", { oldPath, error: deleteError.message });
          }

          const { error: docInsertError } = await supabase
            .from("documents")
            .insert({
              tenant_id: membership.tenant_id,
              athlete_id: athlete.id,
              type: doc.type,
              file_url: newPath,
              file_type: doc.file_type,
            });

          if (docInsertError) {
            logStep("Document insert warning", { error: docInsertError.message });
          }

          movedDocuments.push({ ...doc, storage_path: newPath });
          logStep("Document moved", { oldPath, newPath });
        } catch (e) {
          logStep("Document move error", { oldPath, error: String(e) });
        }
      }
    }

    // ========================================================================
    // 6. UPDATE MEMBERSHIP TO APPROVED
    // ========================================================================
    const now = new Date();
    const startDate = now.toISOString().split("T")[0];
    const endDate = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString().split("T")[0];

    const { error: updateError } = await supabase
      .from("memberships")
      .update({
        athlete_id: athlete.id,
        status: "APPROVED",
        start_date: startDate,
        end_date: endDate,
        academy_id: academyId || null,
        preferred_coach_id: coachId || null,
        review_notes: reviewNotes || null,
        reviewed_by_profile_id: adminProfileId,
        reviewed_at: new Date().toISOString(),
        applicant_data: null,
        documents_uploaded: movedDocuments.length > 0 ? movedDocuments : null,
      })
      .eq("id", membershipId);

    if (updateError) {
      throw new Error(`Failed to update membership: ${updateError.message}`);
    }

    approved = true;
    newStatus = "APPROVED";
    logStep("Membership updated to APPROVED");

    // ========================================================================
    // 7. GENERATE DIGITAL CARD
    // ========================================================================
    let cardGenerated = false;
    try {
      const cardResponse = await supabase.functions.invoke("generate-digital-card", {
        body: { membershipId },
      });
      
      if (cardResponse.error) {
        logStep("Card generation warning", { error: cardResponse.error.message });
      } else {
        cardGenerated = true;
        logStep("Digital card generated");
      }
    } catch (e) {
      logStep("Card generation error", { error: String(e) });
    }

    // ========================================================================
    // 8. NOTIFICATION ENGINE — Decision Layer
    // ========================================================================
    const baseUrl = resolveBaseUrl(req);
    const tenantLocale = (tenant.default_locale === 'en' ? 'en' : 'pt-BR') as SupportedLocale;

    const notificationDecision = resolveMembershipNotification({
      previousStatus,
      newStatus,
      membership: {
        id: membershipId,
        endDate,
        rejectionReason: membership.rejection_reason ?? undefined,
      },
      athlete: {
        fullName: applicantData.full_name,
        email: applicantData.email,
        // Athlete doesn't have preferredLocale yet, fall back to tenant
      },
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        defaultLocale: tenantLocale,
      },
      baseUrl,
    });

    logStep("[EMAIL] Engine decision", { 
      shouldSend: notificationDecision.shouldSendEmail,
      templateId: shouldSend(notificationDecision) ? notificationDecision.templateId : null,
    });

    // ========================================================================
    // 9. SEND EMAIL (if engine says so)
    // ========================================================================
    if (shouldSend(notificationDecision)) {
      emailResult.shouldSend = true;
      emailResult.templateId = notificationDecision.templateId;

      // ======================================================================
      // 9.1 IDEMPOTENCY CHECK - Skip if already sent for APPROVED
      // ======================================================================
      const emailAlreadySent = membership.email_sent_for_status === "APPROVED";

      if (emailAlreadySent) {
        logStep("[EMAIL] Skip: already sent for status=APPROVED");
        emailResult.skippedReason = 'already_sent';
      } else if (!isEmailConfigured()) {
        // Check Resend configuration
        logStep("[EMAIL] Skip: RESEND_API_KEY not configured");
        emailResult.skippedReason = 'resend_not_configured';
      } else {
        try {
          const resend = getEmailClient();

          // Build email content using existing template
          const layoutData: EmailLayoutData = {
            tenantName: tenant.name,
          };

          const { subject, html } = getMembershipApprovedTemplate({
            ...layoutData,
            athleteName: notificationDecision.payload.athleteName,
            portalUrl: notificationDecision.ctaUrl,
          });

          // Send email
          const { error: emailError } = await resend.emails.send({
            from: DEFAULT_EMAIL_FROM,
            to: [applicantData.email],
            subject,
            html,
          });

          if (emailError) {
            throw new Error(`Resend error: ${JSON.stringify(emailError)}`);
          }

          emailResult.sent = true;
          logStep("[EMAIL] Sent successfully", { 
            to: applicantData.email, 
            templateId: notificationDecision.templateId 
          });

          // Audit log for EMAIL_SENT
          await supabase.from("audit_logs").insert({
            event_type: "EMAIL_SENT",
            tenant_id: membership.tenant_id,
            profile_id: adminProfileId,
            metadata: {
              template_id: notificationDecision.templateId,
              recipient_email: applicantData.email,
              membership_id: membershipId,
              status: newStatus,
              locale: notificationDecision.locale,
              sent_at: new Date().toISOString(),
            },
          });

          // ====================================================================
          // 9.2 PERSIST IDEMPOTENCY - Mark email as sent for APPROVED
          // ====================================================================
          await supabase
            .from("memberships")
            .update({ email_sent_for_status: "APPROVED" })
            .eq("id", membershipId);

          logStep("[EMAIL] Idempotency flag set", { email_sent_for_status: "APPROVED" });

        } catch (emailErr) {
          const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
          logStep("[EMAIL] Failed", { error: errMsg });

          // Audit log for EMAIL_FAILED
          await supabase.from("audit_logs").insert({
            event_type: "EMAIL_FAILED",
            tenant_id: membership.tenant_id,
            profile_id: adminProfileId,
            metadata: {
              template_id: notificationDecision.templateId,
              recipient_email: applicantData.email,
              membership_id: membershipId,
              status: newStatus,
              error: errMsg.substring(0, 500), // Truncate to avoid huge logs
              occurred_at: new Date().toISOString(),
            },
          });
        }
      }
    } else {
      emailResult.skippedReason = 'engine_noop';
      logStep("[EMAIL] Skip: engine returned shouldSendEmail=false");
    }

    // ========================================================================
    // 10. AUDIT LOG — Membership Approved
    // ========================================================================
    await supabase.from("audit_logs").insert({
      event_type: "MEMBERSHIP_APPROVED",
      tenant_id: membership.tenant_id,
      profile_id: adminProfileId,
      metadata: {
        membership_id: membershipId,
        athlete_id: athlete.id,
        athlete_name: applicantData.full_name,
        academy_id: academyId || null,
        coach_id: coachId || null,
        approved_by: adminProfileId,
        review_notes: reviewNotes || null,
        roles_assigned: createdRoles,
        start_date: startDate,
        end_date: endDate,
        card_generated: cardGenerated,
        email_sent: emailResult.sent,
        occurred_at: new Date().toISOString(),
      },
    });

    logStep("Audit log created", { roles: createdRoles });

    // ========================================================================
    // SUCCESS RESPONSE
    // ========================================================================
    return new Response(
      JSON.stringify({
        approved: true,
        membershipId,
        previousStatus,
        newStatus,
        athleteId: athlete.id,
        rolesAssigned: createdRoles,
        cardGenerated,
        email: emailResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    
    const statusCode = errorMessage.includes("Unauthorized") ? 401 
      : errorMessage.includes("Forbidden") ? 403 
      : errorMessage.includes("Invalid status") ? 400
      : 500;

    return new Response(
      JSON.stringify({ 
        approved,
        membershipId,
        previousStatus,
        newStatus,
        email: emailResult,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: statusCode }
    );
  }
});

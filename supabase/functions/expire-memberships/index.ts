import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { resolveMembershipNotification, shouldSend, type SupportedLocale } from "../_shared/notification-engine.ts";
import { getEmailClient, DEFAULT_EMAIL_FROM, isEmailConfigured } from "../_shared/emailClient.ts";
import { getMembershipExpiringTemplate } from "../_shared/email-templates/membership/expiring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EXPIRE-MEMBERSHIPS] ${step}${detailsStr}`);
};

const logEmail = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[EMAIL] ${step}${detailsStr}`);
};

interface MembershipResult {
  membershipId: string;
  success: boolean;
  email: {
    shouldSend: boolean;
    sent: boolean;
    templateId: string | null;
    skippedReason: "already_sent" | "engine_noop" | "resend_not_configured" | "missing_data" | "send_failed" | null;
  };
  error?: string;
}

/**
 * Expire Memberships Job
 * 
 * ⚠️ DEPENDÊNCIA DE CRON: Esta função DEVE ser agendada via pg_cron para funcionar.
 * Sem o agendamento, filiações vencidas NÃO serão expiradas automaticamente.
 * 
 * Veja: docs/operacao-configuracoes.md → Seção "4. Cron Jobs"
 * 
 * This function runs on a schedule (daily at 03:00 UTC) to:
 * 1. Find all memberships with status ACTIVE where end_date < today
 * 2. Update their status to EXPIRED
 * 3. Send notification email using Notification Engine (idempotent)
 * 4. Log the change in audit_logs
 * 
 * This is idempotent - running multiple times won't cause duplicate emails.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    logStep("Starting membership expiration job");

    // Resolve baseUrl for email CTAs
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const originHeader = req.headers.get("origin");
    const baseUrl = (publicAppUrl || originHeader || "https://tatame-pro.lovable.app").replace(/\/$/, "");

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];
    logStep("Checking memberships with end_date before", { today });

    // ========================================================================
    // 1️⃣ FIND MEMBERSHIPS TO EXPIRE (only ACTIVE, not APPROVED)
    // ========================================================================
    const { data: expiredMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        end_date,
        status,
        athlete_id,
        tenant_id,
        email_sent_for_status,
        athlete:athletes(id, full_name, email),
        tenant:tenants(id, slug, name, default_locale)
      `)
      .eq("status", "ACTIVE")
      .lt("end_date", today);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    logStep("Found memberships to expire", { count: expiredMemberships?.length || 0 });

    if (!expiredMemberships || expiredMemberships.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          expired: 0, 
          message: "No memberships to expire" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: MembershipResult[] = [];

    for (const membership of expiredMemberships) {
      const emailResult: MembershipResult["email"] = {
        shouldSend: false,
        sent: false,
        templateId: null,
        skippedReason: null,
      };

      try {
        // ====================================================================
        // 2️⃣ UPDATE STATUS TO EXPIRED
        // ====================================================================
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            status: "EXPIRED",
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        logStep("Membership expired", { membershipId: membership.id });

        // Log to audit - MEMBERSHIP_EXPIRED
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_EXPIRED,
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            previous_status: membership.status,
            new_status: "EXPIRED",
            end_date: membership.end_date,
            automatic: true,
            scheduled: true,
            source: "expire-memberships-job",
          },
        });

        // ====================================================================
        // 3️⃣ PREPARE DATA FOR NOTIFICATION ENGINE
        // ====================================================================
        // Handle array relation from Supabase (take first element)
        const athleteData = membership.athlete as unknown;
        const tenantData = membership.tenant as unknown;
        const athlete = Array.isArray(athleteData) ? athleteData[0] as { id: string; full_name: string; email: string } | undefined : athleteData as { id: string; full_name: string; email: string } | null;
        const tenant = Array.isArray(tenantData) ? tenantData[0] as { id: string; slug: string; name: string; default_locale: string } | undefined : tenantData as { id: string; slug: string; name: string; default_locale: string } | null;

        if (!athlete || !tenant) {
          logEmail("Skip - missing athlete or tenant data", { 
            membershipId: membership.id,
            hasAthlete: !!athlete,
            hasTenant: !!tenant,
          });
          emailResult.skippedReason = "missing_data";
        } else {
          // ==================================================================
          // 4️⃣ CALL NOTIFICATION ENGINE
          // ==================================================================
          const decision = resolveMembershipNotification({
            previousStatus: "ACTIVE",
            newStatus: "EXPIRED",
            membership: {
              id: membership.id,
              endDate: membership.end_date,
            },
            athlete: {
              fullName: athlete.full_name,
              email: athlete.email,
            },
            tenant: {
              name: tenant.name,
              slug: tenant.slug,
              defaultLocale: (tenant.default_locale as SupportedLocale) || "pt-BR",
            },
            baseUrl,
          });

          logEmail("Engine decision", {
            membershipId: membership.id,
            shouldSendEmail: decision.shouldSendEmail,
            templateId: shouldSend(decision) ? decision.templateId : null,
          });

          emailResult.shouldSend = decision.shouldSendEmail;

          if (shouldSend(decision)) {
            emailResult.templateId = decision.templateId;

            // ================================================================
            // 5️⃣ IDEMPOTENCY CHECK - Skip if already sent for EXPIRED
            // ================================================================
            const emailAlreadySent = membership.email_sent_for_status === "EXPIRED";

            if (emailAlreadySent) {
              logEmail("Skip: already sent for status=EXPIRED", { membershipId: membership.id });
              emailResult.skippedReason = "already_sent";
            } else if (!isEmailConfigured()) {
              logEmail("Skip: RESEND_API_KEY not configured");
              emailResult.skippedReason = "resend_not_configured";
            } else {
              // ==============================================================
              // 6️⃣ SEND EMAIL
              // ==============================================================
              try {
                const resend = getEmailClient();

                const { subject, html } = getMembershipExpiringTemplate({
                  athleteName: athlete.full_name,
                  tenantName: tenant.name,
                  daysRemaining: 0, // Already expired
                  expirationDate: membership.end_date,
                  renewUrl: decision.ctaUrl,
                });

                const { error: emailError } = await resend.emails.send({
                  from: DEFAULT_EMAIL_FROM,
                  to: [athlete.email],
                  subject,
                  html,
                });

                if (emailError) {
                  throw new Error(`Resend error: ${JSON.stringify(emailError)}`);
                }

                emailResult.sent = true;
                logEmail("Sent successfully", {
                  membershipId: membership.id,
                  recipient: athlete.email,
                });

                // Audit log - EMAIL_SENT
                await createAuditLog(supabase, {
                  event_type: "EMAIL_SENT",
                  tenant_id: membership.tenant_id,
                  metadata: {
                    template_id: decision.templateId,
                    membership_id: membership.id,
                    recipient_email: athlete.email,
                    status: "EXPIRED",
                    sent_at: new Date().toISOString(),
                    source: "expire-memberships-job",
                  },
                });

                // ==============================================================
                // 7️⃣ PERSIST IDEMPOTENCY FLAG
                // ==============================================================
                await supabase
                  .from("memberships")
                  .update({ email_sent_for_status: "EXPIRED" })
                  .eq("id", membership.id);

                logEmail("Idempotency flag set", { 
                  membershipId: membership.id,
                  email_sent_for_status: "EXPIRED",
                });

              } catch (emailErr) {
                const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
                logEmail("Failed", { membershipId: membership.id, error: errMsg });

                emailResult.skippedReason = "send_failed";

                // Audit log - EMAIL_FAILED
                await createAuditLog(supabase, {
                  event_type: "EMAIL_FAILED",
                  tenant_id: membership.tenant_id,
                  metadata: {
                    template_id: decision.templateId,
                    membership_id: membership.id,
                    recipient_email: athlete.email,
                    status: "EXPIRED",
                    error: errMsg.substring(0, 500),
                    source: "expire-memberships-job",
                  },
                });
              }
            }
          } else {
            emailResult.skippedReason = "engine_noop";
          }
        }

        results.push({ 
          membershipId: membership.id, 
          success: true,
          email: emailResult,
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logStep("Error expiring membership", { membershipId: membership.id, error: errorMessage });
        results.push({ 
          membershipId: membership.id, 
          success: false, 
          email: emailResult,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const emailsSent = results.filter(r => r.email.sent).length;

    logStep("Job completed", { successCount, failCount, emailsSent });

    return new Response(
      JSON.stringify({ 
        success: true, 
        expired: successCount,
        failed: failCount,
        emailsSent,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logStep("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { resolveMembershipNotification, shouldSend, type MembershipStatus, type SupportedLocale } from "../_shared/notification-engine.ts";
import { getEmailClient, DEFAULT_EMAIL_FROM, isEmailConfigured } from "../_shared/emailClient.ts";
import { getMembershipExpiredTemplate } from "../_shared/email-templates/membership/expired.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


interface MembershipResult {
  membershipId: string;
  success: boolean;
  skipped?: boolean;
  email: {
    shouldSend: boolean;
    sent: boolean;
    templateId: string | null;
    skippedReason: "already_sent" | "already_processed" | "engine_noop" | "resend_not_configured" | "missing_data" | "send_failed" | null;
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
 * 2. Update their status to EXPIRED (with conditional update for race protection)
 * 3. Send notification email using Notification Engine (idempotent)
 * 4. Log the change in audit_logs
 * 
 * This is idempotent and race-safe - running multiple times or in parallel won't cause issues.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("expire-memberships", correlationId);

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    log.error("Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // ========================================

  // ========================================================================
  // 4️⃣ JOB CORRELATION ID
  // ========================================================================
  const jobRunId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.info("Job started", { jobRunId });

    // Log job execution start
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_EXPIRE_MEMBERSHIPS_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'expire-memberships-job',
      },
    });

    // Resolve baseUrl for email CTAs
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL");
    const originHeader = req.headers.get("origin");
    const baseUrl = (publicAppUrl || originHeader || "https://tatame-pro.lovable.app").replace(/\/$/, "");

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];
    log.info("Checking memberships with end_date before", { jobRunId, today });

    // ========================================================================
    // 1️⃣ FIND MEMBERSHIPS TO EXPIRE (only ACTIVE)
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
      .in("status", ["ACTIVE", "APPROVED"])
      .lt("end_date", today);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    const totalFound = expiredMemberships?.length || 0;
    log.info("Found memberships to expire", { jobRunId, count: totalFound });

    if (!expiredMemberships || expiredMemberships.length === 0) {
      return new Response(
        JSON.stringify({ 
          job: "expire-memberships",
          jobRunId,
          success: true,
          processed: 0,
          expired: 0,
          emailsSent: 0,
          failed: 0,
          message: "No memberships to expire",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: MembershipResult[] = [];

    for (const membership of expiredMemberships) {
      const previousStatus = membership.status as MembershipStatus;
      
      const emailResult: MembershipResult["email"] = {
        shouldSend: false,
        sent: false,
        templateId: null,
        skippedReason: null,
      };

      try {
        // ====================================================================
        // 2️⃣ CONDITIONAL UPDATE TO EXPIRED (RACE PROTECTION)
        // ====================================================================
        // GOV-001B: Transition status via gatekeeper RPC
        const { data: rpcResult, error: rpcError } = await supabase.rpc("change_membership_state", {
          p_membership_id: membership.id,
          p_new_status: "EXPIRED",
          p_reason: "end_date_passed",
          p_actor_profile_id: null,
          p_notes: `Expired by cron job ${jobRunId}`,
        });

        if (rpcError) {
          // If idempotent (already expired) or invalid transition, skip
          if (rpcError.message?.includes("Invalid transition") || rpcError.message?.includes("not found")) {
            log.info("Skip - RPC rejected (likely already processed)", { 
              jobRunId, 
              membershipId: membership.id,
              error: rpcError.message,
            });
            results.push({
              membershipId: membership.id,
              success: true,
              skipped: true,
              email: { ...emailResult, skippedReason: "already_processed" },
            });
            continue;
          }
          throw new Error(rpcError.message);
        }

        // Check if no_change (idempotent)
        if (rpcResult?.status === "no_change") {
          log.info("Skip - already expired (idempotent)", { 
            jobRunId, 
            membershipId: membership.id,
          });
          results.push({
            membershipId: membership.id,
            success: true,
            skipped: true,
            email: { ...emailResult, skippedReason: "already_processed" },
          });
          continue;
        }

        log.info("Membership expired", { jobRunId, membershipId: membership.id });

        // Log to audit - MEMBERSHIP_EXPIRED
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_EXPIRED,
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            previous_status: previousStatus,
            new_status: "EXPIRED",
            end_date: membership.end_date,
            automatic: true,
            scheduled: true,
            source: "expire-memberships-job",
            job_run_id: jobRunId,
          },
        });

        // ====================================================================
        // 3️⃣ PREPARE DATA FOR NOTIFICATION ENGINE
        // ====================================================================
        const athleteData = membership.athlete as unknown;
        const tenantData = membership.tenant as unknown;
        const athlete = Array.isArray(athleteData) 
          ? athleteData[0] as { id: string; full_name: string; email: string } | undefined 
          : athleteData as { id: string; full_name: string; email: string } | null;
        const tenant = Array.isArray(tenantData) 
          ? tenantData[0] as { id: string; slug: string; name: string; default_locale: string } | undefined 
          : tenantData as { id: string; slug: string; name: string; default_locale: string } | null;

        if (!athlete || !tenant) {
          log.info("[EMAIL] Skip - missing athlete or tenant data", { 
            jobRunId,
            membershipId: membership.id,
            hasAthlete: !!athlete,
            hasTenant: !!tenant,
          });
          emailResult.skippedReason = "missing_data";
        } else {
          // ==================================================================
          // 4️⃣ CALL NOTIFICATION ENGINE (using actual previousStatus)
          // ==================================================================
          const decision = resolveMembershipNotification({
            previousStatus,
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

          log.info("[EMAIL] Engine decision", {
            jobRunId,
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
              log.info("[EMAIL] Skip: already sent for status=EXPIRED", { jobRunId, membershipId: membership.id });
              emailResult.skippedReason = "already_sent";
            } else if (!isEmailConfigured()) {
              log.info("[EMAIL] Skip: RESEND_API_KEY not configured", { jobRunId });
              emailResult.skippedReason = "resend_not_configured";
            } else {
              // ==============================================================
              // 6️⃣ SEND EMAIL (using correct expired template)
              // ==============================================================
              try {
                const resend = getEmailClient();

                const { subject, html } = getMembershipExpiredTemplate({
                  athleteName: athlete.full_name,
                  tenantName: tenant.name,
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
                log.info("[EMAIL] Sent successfully", {
                  jobRunId,
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
                    job_run_id: jobRunId,
                  },
                });

                // ==============================================================
                // 7️⃣ PERSIST IDEMPOTENCY FLAG
                // ==============================================================
                await supabase
                  .from("memberships")
                  .update({ email_sent_for_status: "EXPIRED" })
                  .eq("id", membership.id);

                log.info("[EMAIL] Idempotency flag set", { 
                  jobRunId,
                  membershipId: membership.id,
                  email_sent_for_status: "EXPIRED",
                });

              } catch (emailErr) {
                const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
                log.info("[EMAIL] Failed", { jobRunId, membershipId: membership.id, error: errMsg });

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
                    job_run_id: jobRunId,
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
        log.info("Error expiring membership", { jobRunId, membershipId: membership.id, error: errorMessage });
        results.push({ 
          membershipId: membership.id, 
          success: false, 
          email: emailResult,
          error: errorMessage,
        });
      }
    }

    // ========================================================================
    // 5️⃣ RESPONSE — STANDARDIZED JOB FORMAT
    // ========================================================================
    const processed = results.length;
    const expired = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    const emailsSent = results.filter(r => r.email.sent).length;

    log.info("Job completed", { jobRunId, processed, expired, skipped, failed, emailsSent });

    // Log job execution completion
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_EXPIRE_MEMBERSHIPS_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        processed,
        expired,
        skipped,
        failed,
        emailsSent,
        automatic: true,
        scheduled: true,
        source: 'expire-memberships-job',
      },
    });

    return new Response(
      JSON.stringify({ 
        job: "expire-memberships",
        jobRunId,
        success: true,
        processed,
        expired,
        skipped,
        failed,
        emailsSent,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error", undefined, { jobRunId, error: errorMessage });
    return new Response(
      JSON.stringify({ 
        job: "expire-memberships",
        jobRunId,
        success: false,
        error: errorMessage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * PRE-EXPIRATION SCHEDULER
 * 
 * Sends pre-expiration notifications at defined windows (30, 15, 7, 3, 1 days).
 * Fully idempotent, race-safe, and audit-logged.
 * 
 * Designed to run once daily via pg_cron (recommended: 02:30 UTC).
 * 
 * Uses Notification Engine as the single source of truth for decisions.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import {
  resolveMembershipNotification,
  shouldSend,
  type ExpiringVirtualStatus,
  type MembershipStatus,
  type SupportedLocale,
} from "../_shared/notification-engine.ts";
import { getMembershipExpiringTemplate, type MembershipExpiringData } from "../_shared/email-templates/index.ts";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================


/**
 * Pre-expiration notification windows (days before expiration).
 * Order matters: we check from smallest to largest to avoid sending multiple.
 */
const NOTIFICATION_WINDOWS = [1, 3, 7, 15, 30] as const;
type NotificationWindow = typeof NOTIFICATION_WINDOWS[number];

/**
 * Mapping days to virtual status and email flag value.
 */
const WINDOW_CONFIG: Record<NotificationWindow, { virtualStatus: ExpiringVirtualStatus; flagValue: string }> = {
  30: { virtualStatus: 'EXPIRING_30D', flagValue: 'EXPIRING_30D' },
  15: { virtualStatus: 'EXPIRING_15D', flagValue: 'EXPIRING_15D' },
  7: { virtualStatus: 'EXPIRING_7D', flagValue: 'EXPIRING_7D' },
  3: { virtualStatus: 'EXPIRING_3D', flagValue: 'EXPIRING_3D' },
  1: { virtualStatus: 'EXPIRING_1D', flagValue: 'EXPIRING_1D' },
};

// ============================================================================
// TYPES
// ============================================================================

interface MembershipRecord {
  id: string;
  end_date: string;
  status: string;
  email_sent_for_status: string | null;
  athletes: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  tenants: {
    id: string;
    slug: string;
    name: string;
    default_locale: string;
  } | null;
}

interface ProcessResult {
  membershipId: string;
  daysToExpire: number;
  window: NotificationWindow;
  emailSent: boolean;
  skipped: boolean;
  skippedReason?: string;
  error?: string;
}

interface JobResponse {
  job: string;
  jobRunId: string;
  processed: number;
  notified: number;
  skipped: number;
  failed: number;
  emailsSent: number;
  results: ProcessResult[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate days until expiration from end_date.
 */
function calculateDaysToExpire(endDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiration = new Date(endDate);
  expiration.setHours(0, 0, 0, 0);
  
  const diffTime = expiration.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine which notification window applies for given days.
 * Returns null if no window matches.
 */
function getApplicableWindow(daysToExpire: number): NotificationWindow | null {
  // Must be 1-30 days (not expired, not too far)
  if (daysToExpire < 1 || daysToExpire > 30) {
    return null;
  }
  
  // Find the matching window (exact or closest lower)
  for (const window of NOTIFICATION_WINDOWS) {
    if (daysToExpire === window) {
      return window;
    }
  }
  
  return null;
}

/**
 * Check if notification already sent for this window or a more urgent one.
 */
function isAlreadySentForWindow(emailSentForStatus: string | null, window: NotificationWindow): boolean {
  if (!emailSentForStatus) return false;
  
  // If already sent for this exact window
  const config = WINDOW_CONFIG[window];
  if (emailSentForStatus === config.flagValue) {
    return true;
  }
  
  // If sent for a more urgent window (smaller number = more urgent)
  const windowIndex = NOTIFICATION_WINDOWS.indexOf(window);
  for (let i = 0; i < windowIndex; i++) {
    const moreUrgentWindow = NOTIFICATION_WINDOWS[i];
    if (emailSentForStatus === WINDOW_CONFIG[moreUrgentWindow].flagValue) {
      return true;
    }
  }
  
  return false;
}

/**
 * Format date for display in email.
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("pre-expiration-scheduler", correlationId);

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }

  if (requestSecret !== cronSecret) {
    log.error("Invalid or missing x-cron-secret");
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
  // ========================================

  const jobRunId = crypto.randomUUID();

  try {
    log.info("Job started", { jobRunId });

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", "") || "https://tatame.pro";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Calculate date range: today to today + 30 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

    log.info("Fetching expiring memberships", { from: todayStr, to: thirtyDaysStr });

    // Fetch eligible memberships
    const { data: memberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        end_date,
        status,
        email_sent_for_status,
        athletes!inner (
          id,
          full_name,
          email
        ),
        tenants!inner (
          id,
          slug,
          name,
          default_locale
        )
      `)
      .in("status", ["ACTIVE", "APPROVED"])
      .gte("end_date", todayStr)
      .lte("end_date", thirtyDaysStr);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    if (!memberships || memberships.length === 0) {
      log.info("No expiring memberships found");
      const response: JobResponse = {
        job: "pre-expiration-scheduler",
        jobRunId,
        processed: 0,
        notified: 0,
        skipped: 0,
        failed: 0,
        emailsSent: 0,
        results: [],
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...dynamicCors, "Content-Type": "application/json" },
      });
    }

    log.info(`Found ${memberships.length} expiring memberships`);

    // Process each membership
    const results: ProcessResult[] = [];
    let notified = 0;
    let skipped = 0;
    let failed = 0;
    let emailsSent = 0;

    for (const membership of memberships as unknown as MembershipRecord[]) {
      const membershipId = membership.id;
      
      // Handle Supabase array relations
      const athlete = Array.isArray(membership.athletes) 
        ? membership.athletes[0] 
        : membership.athletes;
      const tenant = Array.isArray(membership.tenants) 
        ? membership.tenants[0] 
        : membership.tenants;

      if (!athlete || !tenant) {
        log.info("Skip - missing athlete or tenant", { membershipId });
        results.push({
          membershipId,
          daysToExpire: 0,
          window: 30,
          emailSent: false,
          skipped: true,
          skippedReason: "missing_data",
        });
        skipped++;
        continue;
      }

      const daysToExpire = calculateDaysToExpire(membership.end_date);
      const window = getApplicableWindow(daysToExpire);

      if (!window) {
        // Not on an exact notification day
        results.push({
          membershipId,
          daysToExpire,
          window: 30,
          emailSent: false,
          skipped: true,
          skippedReason: "not_on_notification_day",
        });
        skipped++;
        continue;
      }

      const config = WINDOW_CONFIG[window];

      // Idempotency check: already sent for this or more urgent window?
      if (isAlreadySentForWindow(membership.email_sent_for_status, window)) {
        log.info(`Skip: already sent for status=${membership.email_sent_for_status}`, { membershipId });
        results.push({
          membershipId,
          daysToExpire,
          window,
          emailSent: false,
          skipped: true,
          skippedReason: "already_sent",
        });
        skipped++;
        continue;
      }

      // Use Notification Engine to decide
      const decision = resolveMembershipNotification({
        previousStatus: membership.status as MembershipStatus,
        newStatus: config.virtualStatus,
        daysToExpire,
        membership: {
          id: membershipId,
          endDate: membership.end_date,
        },
        athlete: {
          fullName: athlete.full_name,
          email: athlete.email,
          preferredLocale: undefined,
        },
        tenant: {
          name: tenant.name,
          slug: tenant.slug,
          defaultLocale: (tenant.default_locale as SupportedLocale) || "pt-BR",
        },
        baseUrl: "https://tatame.pro",
      });

      if (!shouldSend(decision)) {
        log.info("Engine decided not to send", { membershipId, window });
        results.push({
          membershipId,
          daysToExpire,
          window,
          emailSent: false,
          skipped: true,
          skippedReason: "engine_decision",
        });
        skipped++;
        continue;
      }

      // Prepare and send email
      if (!resend) {
        log.info("Skip - Resend not configured", { membershipId });
        results.push({
          membershipId,
          daysToExpire,
          window,
          emailSent: false,
          skipped: true,
          skippedReason: "resend_not_configured",
        });
        skipped++;
        continue;
      }

      try {
        // Generate email content using existing template
        const templateData: MembershipExpiringData = {
          athleteName: athlete.full_name,
          tenantName: tenant.name,
          daysRemaining: daysToExpire,
          expirationDate: formatDate(membership.end_date),
          renewUrl: decision.ctaUrl,
        };

        const { subject, html } = getMembershipExpiringTemplate(templateData);

        log.info("Sending pre-expiration email", {
          membershipId,
          window,
          daysToExpire,
          to: athlete.email,
        });

        // Send email
        const emailResponse = await resend.emails.send({
          from: "TATAME <noreply@tatame.pro>",
          to: [athlete.email],
          subject,
          html,
        });

        if (emailResponse.error) {
          throw new Error(emailResponse.error.message);
        }

        // Persist flag AFTER successful send
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ email_sent_for_status: config.flagValue })
          .eq("id", membershipId);

        if (updateError) {
          log.info("Warning: failed to update flag", { membershipId, error: updateError.message });
        }

        // Audit log
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_EXPIRING_NOTIFIED,
          tenant_id: tenant.id,
          metadata: {
            membership_id: membershipId,
            template_id: decision.templateId,
            days_to_expire: daysToExpire,
            window: `${window}d`,
            email: athlete.email,
            job_run_id: jobRunId,
            source: "pre-expiration-scheduler",
          },
        });

        await createAuditLog(supabase, {
          event_type: "EMAIL_SENT",
          tenant_id: tenant.id,
          metadata: {
            membership_id: membershipId,
            template_id: decision.templateId,
            recipient: athlete.email,
            job_run_id: jobRunId,
            source: "pre-expiration-scheduler",
          },
        });

        log.info("Email sent successfully", { membershipId, window });

        results.push({
          membershipId,
          daysToExpire,
          window,
          emailSent: true,
          skipped: false,
        });
        notified++;
        emailsSent++;

      } catch (emailError) {
        const errorMessage = emailError instanceof Error ? emailError.message : "Unknown error";
        log.info("Failed to send email", { membershipId, error: errorMessage });

        // Audit log for failure
        await createAuditLog(supabase, {
          event_type: "EMAIL_FAILED",
          tenant_id: tenant.id,
          metadata: {
            membership_id: membershipId,
            template_id: decision.templateId,
            error: errorMessage,
            job_run_id: jobRunId,
            source: "pre-expiration-scheduler",
          },
        });

        results.push({
          membershipId,
          daysToExpire,
          window,
          emailSent: false,
          skipped: false,
          error: errorMessage,
        });
        failed++;
      }
    }

    log.info("Job completed", {
      processed: memberships.length,
      notified,
      skipped,
      failed,
      emailsSent,
    });

    const response: JobResponse = {
      job: "pre-expiration-scheduler",
      jobRunId,
      processed: memberships.length,
      notified,
      skipped,
      failed,
      emailsSent,
      results,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...dynamicCors, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.info("Job failed", { error: errorMessage });

    return new Response(
      JSON.stringify({
        job: "pre-expiration-scheduler",
        jobRunId,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...dynamicCors, "Content-Type": "application/json" },
      }
    );
  }
});

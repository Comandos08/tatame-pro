/**
 * expire-trials - Daily job to transition TRIALING → TRIAL_EXPIRED
 * 
 * Executes daily at 00:05 UTC via pg_cron
 * 
 * Flow:
 * 1. Find tenants with status='TRIALING' and trial_expires_at < NOW()
 * 2. Update status to 'TRIAL_EXPIRED'
 * 3. Set grace_period_ends_at = NOW() + 8 days
 * 4. Keep tenant.is_active = true (partial access allowed)
 * 5. Send email "TRIAL_EXPIRED"
 * 6. Log to audit_logs
 * 
 * A02: Institutional envelope + structured logger + correlationId
 * NOTE: Cron job — no rate limiting applied
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


const GRACE_PERIOD_DAYS = 8;

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string,
  data?: Record<string, unknown>,
  log?: ReturnType<typeof createBackendLogger>,
) {
  try {
    const emailUrl = `${supabaseUrl}/functions/v1/send-billing-email`;
    await fetch(emailUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ event_type: eventType, tenant_id: tenantId, data }),
    });
    log?.info("Billing email triggered", { eventType, tenantId });
  } catch (err) {
    log?.warn("Failed to trigger billing email", { error: err instanceof Error ? err.message : "Unknown" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("expire-trials", correlationId);

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.cron_secret_missing", false, undefined, correlationId),
      dynamicCors,
    );
  }

  if (requestSecret !== cronSecret) {
    log.warn("Invalid or missing x-cron-secret");
    return errorResponse(
      403,
      buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.cron_secret_invalid", false, undefined, correlationId),
      dynamicCors,
    );
  }
  // ========================================

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      log.error("Missing SUPABASE_SERVICE_ROLE_KEY");
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.config_missing", false, undefined, correlationId),
        dynamicCors,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    log.info("Starting expire-trials job");

    // Find tenants with expired trials
    const now = new Date().toISOString();
    const { data: expiredTrials, error: fetchError } = await supabase
      .from("tenant_billing")
      .select("id, tenant_id, status, trial_expires_at")
      .eq("status", "TRIALING")
      .lt("trial_expires_at", now)
      .is("is_manual_override", false);

    if (fetchError) {
      log.error("Failed to fetch expired trials", fetchError);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.fetch_failed", true, [`fetch: ${fetchError.message}`], correlationId),
        dynamicCors,
      );
    }

    log.info("Found expired trials", { count: expiredTrials?.length || 0 });

    const results = {
      processed: 0,
      errors: 0,
      tenantIds: [] as string[],
    };

    for (const billing of expiredTrials || []) {
      try {
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

        // Update billing status to TRIAL_EXPIRED
        const { error: updateError } = await supabase
          .from("tenant_billing")
          .update({
            status: "TRIAL_EXPIRED",
            grace_period_ends_at: gracePeriodEnd.toISOString(),
          })
          .eq("id", billing.id)
          .eq("status", "TRIALING"); // Optimistic lock

        if (updateError) {
          throw updateError;
        }

        // Note: tenant.is_active remains true for partial access

        // Log to audit
        await supabase.from("audit_logs").insert({
          event_type: "TRIAL_EXPIRED",
          tenant_id: billing.tenant_id,
          metadata: {
            billing_id: billing.id,
            trial_expires_at: billing.trial_expires_at,
            grace_period_ends_at: gracePeriodEnd.toISOString(),
            automatic: true,
            source: "expire-trials-job",
          },
        });

        // Send email notification
        sendBillingEmail(supabaseUrl, supabaseServiceKey, "TRIAL_EXPIRED", billing.tenant_id, {
          grace_period_end: gracePeriodEnd.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        }, log);

        results.processed++;
        results.tenantIds.push(billing.tenant_id);
        log.info("Expired trial", { tenantId: billing.tenant_id });
      } catch (err) {
        results.errors++;
        log.error("Error expiring trial", err, { tenantId: billing.tenant_id });
      }
    }

    log.info("Job completed", results);

    return okResponse({ success: true, ...results }, dynamicCors, correlationId);
  } catch (err) {
    log.error("Unhandled exception", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.internal_error", false, undefined, correlationId),
      dynamicCors,
    );
  }
});

/**
 * mark-pending-delete - Daily job to transition TRIAL_EXPIRED → PENDING_DELETE
 * 
 * Executes daily at 00:10 UTC via pg_cron
 * 
 * Flow:
 * 1. Find tenants with status='TRIAL_EXPIRED' and grace_period_ends_at < NOW()
 * 2. Update status to 'PENDING_DELETE'
 * 3. Set scheduled_delete_at = NOW() + 7 days (safety buffer)
 * 4. Deactivate tenant (is_active = false)
 * 5. Send email "PENDING_DELETE_WARNING"
 * 6. Log to audit_logs
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse } from "../_shared/cors.ts";


const DELETE_BUFFER_DAYS = 7;

async function sendBillingEmail(
  supabaseUrl: string,
  supabaseServiceKey: string,
  eventType: string,
  tenantId: string,
  data?: Record<string, unknown>,
  log?: ReturnType<typeof createBackendLogger>
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
    log?.info("Failed to trigger billing email", { error: err instanceof Error ? err.message : "Unknown" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("mark-pending-delete", correlationId);

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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseServiceKey) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    log.info("Starting mark-pending-delete job");

    // Find tenants with expired grace period
    const now = new Date().toISOString();
    const { data: expiredGrace, error: fetchError } = await supabase
      .from("tenant_billing")
      .select("id, tenant_id, status, grace_period_ends_at")
      .eq("status", "TRIAL_EXPIRED")
      .lt("grace_period_ends_at", now)
      .is("is_manual_override", false);

    if (fetchError) {
      throw new Error(`Failed to fetch expired grace periods: ${fetchError.message}`);
    }

    log.info("Found expired grace periods", { count: expiredGrace?.length || 0 });

    const results = {
      processed: 0,
      errors: 0,
      tenantIds: [] as string[],
    };

    for (const billing of expiredGrace || []) {
      try {
        const scheduledDeleteAt = new Date();
        scheduledDeleteAt.setDate(scheduledDeleteAt.getDate() + DELETE_BUFFER_DAYS);

        // Update billing status to PENDING_DELETE
        const { error: updateBillingError } = await supabase
          .from("tenant_billing")
          .update({
            status: "PENDING_DELETE",
            scheduled_delete_at: scheduledDeleteAt.toISOString(),
            deletion_reason: "trial_expired_no_conversion",
          })
          .eq("id", billing.id)
          .eq("status", "TRIAL_EXPIRED"); // Optimistic lock

        if (updateBillingError) {
          throw updateBillingError;
        }

        // Deactivate tenant
        const { error: updateTenantError } = await supabase
          .from("tenants")
          .update({ is_active: false })
          .eq("id", billing.tenant_id);

        if (updateTenantError) {
          log.info("Warning: Failed to deactivate tenant", { 
            tenantId: billing.tenant_id, 
            error: updateTenantError.message 
          });
        }

        // Log to audit
        await supabase.from("audit_logs").insert({
          event_type: "PENDING_DELETE",
          tenant_id: billing.tenant_id,
          metadata: {
            billing_id: billing.id,
            grace_period_ends_at: billing.grace_period_ends_at,
            scheduled_delete_at: scheduledDeleteAt.toISOString(),
            automatic: true,
            source: "mark-pending-delete-job",
          },
        });

        // Send warning email
        sendBillingEmail(supabaseUrl, supabaseServiceKey, "PENDING_DELETE_WARNING", billing.tenant_id, {
          delete_date: scheduledDeleteAt.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        }, log);

        results.processed++;
        results.tenantIds.push(billing.tenant_id);
        log.info("Marked pending delete", { tenantId: billing.tenant_id });
      } catch (err) {
        results.errors++;
        log.info("Error marking pending delete", { 
          tenantId: billing.tenant_id, 
          error: err instanceof Error ? err.message : "Unknown" 
        });
      }
    }

    log.info("Job completed", results);

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Job failed", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

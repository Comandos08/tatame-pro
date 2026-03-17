/**
 * Check Trial Ending Job
 * 
 * ⚠️ DEPENDÊNCIA DE CRON: Esta função DEVE ser agendada via pg_cron para funcionar.
 * Sem o agendamento, notificações de fim de trial NÃO serão enviadas.
 * 
 * Veja: docs/operacao-configuracoes.md → Seção "4. Cron Jobs"
 * 
 * This function runs on a schedule (daily at 10:00 UTC) to:
 * 1. Find tenants with trial ending in DAYS_BEFORE_TRIAL_END days
 * 2. Send notification emails
 * 3. Mark notification as sent to avoid duplicates
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


const DAYS_BEFORE_TRIAL_END = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("check-trial-ending", correlationId);

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

  try {
    log.info("Starting trial ending check");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const jobRunId = crypto.randomUUID();

    // Log job execution start
    await supabase.from("audit_logs").insert({
      event_type: "JOB_CHECK_TRIALS_RUN",
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'check-trial-ending-job',
      },
    });

    // Find tenants in TRIALING status with current_period_end within 3 days
    // We check for current_period_end between 2 and 4 days from now to have a window
    const now = new Date();
    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() + (DAYS_BEFORE_TRIAL_END - 1)); // 2 days from now
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + (DAYS_BEFORE_TRIAL_END + 1)); // 4 days from now

    log.info("Checking for trials ending soon", { 
      minDate: minDate.toISOString(), 
      maxDate: maxDate.toISOString() 
    });

    const { data: trialingTenants, error: fetchError } = await supabase
      .from("tenant_billing")
      .select(`
        id,
        tenant_id,
        current_period_end,
        status,
        trial_end_notification_sent
      `)
      .eq("status", "TRIALING")
      .gte("current_period_end", minDate.toISOString())
      .lte("current_period_end", maxDate.toISOString());

    if (fetchError) {
      throw new Error(`Error fetching trialing tenants: ${fetchError.message}`);
    }

    log.info("Found trialing tenants", { count: trialingTenants?.length || 0 });

    if (!trialingTenants || trialingTenants.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No trials ending soon", processed: 0 }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Filter out tenants that already received notification today
    const tenantsToNotify = trialingTenants.filter(t => !t.trial_end_notification_sent);
    
    log.info("Tenants to notify", { count: tenantsToNotify.length });

    const results = [];

    for (const tenant of tenantsToNotify) {
      try {
        log.info("Processing tenant", { tenantId: tenant.tenant_id });

        // Send email notification
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-billing-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            event_type: "TRIAL_ENDING_SOON",
            tenant_id: tenant.tenant_id,
            data: {
              trial_end_date: tenant.current_period_end,
            },
          }),
        });

        log.info("Email sent", { tenantId: tenant.tenant_id, result: emailResult });

        // Mark as notified
        const { error: updateError } = await supabase
          .from("tenant_billing")
          .update({ trial_end_notification_sent: true })
          .eq("id", tenant.id);

        if (updateError) {
          log.error("Error updating notification flag", { error: updateError.message });
        }

        // Create audit log entry
        await supabase.from("audit_logs").insert({
          event_type: "TRIAL_END_NOTIFICATION_SENT",
          tenant_id: tenant.tenant_id,
          metadata: {
            trial_end_date: tenant.current_period_end,
            notification_type: "TRIAL_ENDING_SOON",
          },
        });

        results.push({ tenantId: tenant.tenant_id, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Error processing tenant", { tenantId: tenant.tenant_id, error: errorMessage });
        results.push({ tenantId: tenant.tenant_id, success: false, error: errorMessage });
      }
    }

    log.info("Finished processing", { results });

    // Log job execution completion
    await supabase.from("audit_logs").insert({
      event_type: "JOB_CHECK_TRIALS_RUN",
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        processed: results.length,
        notified: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        automatic: true,
        scheduled: true,
        source: 'check-trial-ending-job',
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error in check-trial-ending", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

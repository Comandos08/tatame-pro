import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


/**
 * Cleanup Abandoned Memberships Job
 * 
 * ⚠️ DEPENDÊNCIA DE CRON: Esta função DEVE ser agendada via pg_cron para funcionar.
 * Sem o agendamento, filiações abandonadas NÃO serão limpas automaticamente.
 * 
 * Veja: docs/operacao-configuracoes.md → Seção "4. Cron Jobs"
 * 
 * This function runs on a schedule (daily at 04:00 UTC) to:
 * 1. Find memberships in DRAFT status that are older than 24 hours
 * 2. Mark them as ABANDONED (preserves data for audit)
 * 3. Log the cleanup in audit_logs
 * 
 * This helps prevent database pollution from incomplete registrations.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("cleanup-abandoned-memberships", correlationId);

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.info("Starting cleanup job for abandoned memberships");

    const jobRunId = crypto.randomUUID();

    // Log job execution start
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_CLEANUP_ABANDONED_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'cleanup-abandoned-memberships-job',
      },
    });

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    const cutoffIso = cutoffTime.toISOString();

    log.info("Looking for DRAFT memberships older than", { cutoff: cutoffIso });

    // Find abandoned memberships (DRAFT status, older than 24 hours, no payment)
    const { data: abandonedMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        created_at,
        status,
        payment_status,
        athlete_id,
        tenant_id
      `)
      .eq("status", "DRAFT")
      .eq("payment_status", "NOT_PAID")
      .lt("created_at", cutoffIso);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    log.info("Found abandoned memberships", { count: abandonedMemberships?.length || 0 });

    if (!abandonedMemberships || abandonedMemberships.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          cleaned: 0, 
          message: "No abandoned memberships to clean up" 
        }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: { membershipId: string; success: boolean; error?: string }[] = [];

    for (const membership of abandonedMemberships) {
      try {
        // Update status to CANCELLED (not deleting to preserve audit trail)
        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            status: "CANCELLED",
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        // Log to audit using shared logger
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_ABANDONED_CLEANUP,
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            previous_status: membership.status,
            new_status: 'CANCELLED',
            created_at: membership.created_at,
            reason: 'DRAFT status for more than 24 hours without payment',
            automatic: true,
            scheduled: true,
            source: 'cleanup-abandoned-memberships-job',
          },
        });

        log.info("Membership marked as abandoned", { membershipId: membership.id });
        results.push({ membershipId: membership.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Error cleaning membership", { membershipId: membership.id, error: errorMessage });
        results.push({ membershipId: membership.id, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    log.info("Cleanup completed", { successCount, failCount });

    // Log job execution completion
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_CLEANUP_ABANDONED_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        cleaned: successCount,
        failed: failCount,
        automatic: true,
        scheduled: true,
        source: 'cleanup-abandoned-memberships-job',
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        cleaned: successCount,
        failed: failCount,
        results 
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error", { error: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

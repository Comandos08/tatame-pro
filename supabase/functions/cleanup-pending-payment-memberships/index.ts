import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


/**
 * Cleanup Pending Payment Memberships Job
 * 
 * ⚠️ DEPENDÊNCIA DE CRON: Esta função DEVE ser agendada via pg_cron para funcionar.
 * Sem o agendamento, filiações com pagamento pendente NÃO serão limpas automaticamente.
 * 
 * Veja: docs/operacao-configuracoes.md → Seção "4. Cron Jobs"
 * 
 * This function runs on a schedule (daily at 03:45 UTC) to:
 * 1. Find memberships in PENDING_PAYMENT status that are older than 24 hours
 * 2. Mark them as CANCELLED (soft delete, preserves data for audit)
 * 3. Log the cleanup in audit_logs
 * 
 * SAFE GOLD:
 * - ❌ DOES NOT touch Stripe (sessions, invoices)
 * - ❌ DOES NOT touch athletes
 * - ❌ DOES NOT touch guardians
 * - ❌ DOES NOT touch financial data
 * - ✅ ONLY updates status to CANCELLED
 * 
 * This helps prevent database pollution from abandoned payment sessions.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("cleanup-pending-payment-memberships", correlationId);

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

    log.info("Starting cleanup job for pending payment memberships");

    const jobRunId = crypto.randomUUID();

    // Log job execution start
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_PENDING_PAYMENT_GC_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'cleanup-pending-payment-memberships-job',
      },
    });

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);
    const cutoffIso = cutoffTime.toISOString();

    log.info("Looking for PENDING_PAYMENT memberships older than", { cutoff: cutoffIso });

    // Find abandoned memberships (PENDING_PAYMENT status, older than 24 hours, no payment)
    const { data: abandonedMemberships, error: fetchError } = await supabase
      .from("memberships")
      .select(`
        id,
        created_at,
        status,
        payment_status,
        athlete_id,
        tenant_id,
        applicant_profile_id
      `)
      .eq("status", "PENDING_PAYMENT")
      .eq("payment_status", "NOT_PAID")
      .lt("created_at", cutoffIso);

    if (fetchError) {
      throw new Error(`Failed to fetch memberships: ${fetchError.message}`);
    }

    log.info("Found pending payment memberships to cleanup", { count: abandonedMemberships?.length || 0 });

    if (!abandonedMemberships || abandonedMemberships.length === 0) {
      // Log job completion even when no items to process
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.JOB_PENDING_PAYMENT_GC_RUN,
        tenant_id: null,
        metadata: {
          job_run_id: jobRunId,
          status: 'COMPLETED',
          processed: 0,
          cancelled: 0,
          skipped: 0,
          failed: 0,
          automatic: true,
          scheduled: true,
          source: 'cleanup-pending-payment-memberships-job',
        },
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          cancelled: 0, 
          message: "No pending payment memberships to clean up" 
        }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const results: { membershipId: string; success: boolean; error?: string }[] = [];

    for (const membership of abandonedMemberships) {
      try {
        // Calculate age in hours for audit
        const createdAt = new Date(membership.created_at);
        const ageHours = Math.round((Date.now() - createdAt.getTime()) / 3600000);

        // Update status to CANCELLED with race protection
        // The status check ensures idempotency and race protection
        // GOV-001B: Transition status via gatekeeper RPC
        const { data: rpcResult, error: rpcError } = await supabase.rpc("change_membership_state", {
          p_membership_id: membership.id,
          p_new_status: "CANCELLED",
          p_reason: "payment_timeout",
          p_actor_profile_id: null,
          p_notes: `Cleanup job ${jobRunId} - age ${ageHours}h`,
        });

        if (rpcError) {
          if (rpcError.message?.includes("Invalid transition")) {
            log.info("Membership skipped (status changed)", { membershipId: membership.id });
            results.push({ membershipId: membership.id, success: true, error: "skipped_status_changed" });
            continue;
          }
          throw new Error(rpcError.message);
        }

        if (rpcResult?.status === "no_change") {
          log.info("Membership skipped (already cancelled)", { membershipId: membership.id });
          results.push({ membershipId: membership.id, success: true, error: "skipped_status_changed" });
          continue;
        }

        // Log to audit using shared logger
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.MEMBERSHIP_PENDING_PAYMENT_CLEANUP,
          tenant_id: membership.tenant_id,
          metadata: {
            membership_id: membership.id,
            athlete_id: membership.athlete_id,
            applicant_profile_id: membership.applicant_profile_id,
            previous_status: 'PENDING_PAYMENT',
            new_status: 'CANCELLED',
            payment_status: 'NOT_PAID',
            created_at: membership.created_at,
            age_hours: ageHours,
            reason: 'payment_timeout',
            automatic: true,
            scheduled: true,
            job_run_id: jobRunId,
            source: 'cleanup-pending-payment-memberships-job',
          },
        });

        log.info("Membership marked as cancelled", { membershipId: membership.id, ageHours });
        results.push({ membershipId: membership.id, success: true });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log.error("Error cleaning membership", error, { membershipId: membership.id });
        results.push({ membershipId: membership.id, success: false, error: errorMessage });
      }
    }

    const cancelledCount = results.filter(r => r.success && !r.error).length;
    const skippedCount = results.filter(r => r.error === "skipped_status_changed").length;
    const failCount = results.filter(r => !r.success).length;

    log.info("Cleanup completed", { cancelledCount, skippedCount, failCount });

    // Log job execution completion
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_PENDING_PAYMENT_GC_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        processed: abandonedMemberships.length,
        cancelled: cancelledCount,
        skipped: skippedCount,
        failed: failCount,
        automatic: true,
        scheduled: true,
        source: 'cleanup-pending-payment-memberships-job',
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: abandonedMemberships.length,
        cancelled: cancelledCount,
        skipped: skippedCount,
        failed: failCount,
        results 
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Error", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

/**
 * transition-youth-to-adult - Daily job to transition minors who turned 18
 * 
 * Executes daily at 03:15 UTC via pg_cron
 * 
 * Flow:
 * 1. Find athletes with birth_date indicating age >= 18
 * 2. Filter for those with guardian_links (indicating youth membership)
 * 3. Filter for active memberships with applicant_data.is_minor = true
 * 4. Update membership.applicant_data.is_minor = false (preserve guardian history)
 * 5. Log YOUTH_AUTO_TRANSITION to audit_logs
 * 
 * SAFE GOLD Principles:
 * - NO new membership created
 * - NO new athlete created
 * - NO guardian/guardian_links deleted
 * - NO financial history altered
 * - ONLY metadata updates
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createAuditLog, AUDIT_EVENTS } from "../_shared/audit-logger.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


/**
 * Calculate precise age from birth date
 * Returns true if person is 18 or older
 */
function isAdult(birthDate: string): boolean {
  const birth = new Date(birthDate);
  const today = new Date();
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  
  // Adjust if birthday hasn't occurred yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }
  
  return age >= 18;
}

interface TransitionResult {
  athleteId: string;
  membershipId: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("transition-youth-to-adult", correlationId);

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

  const jobRunId = crypto.randomUUID();

  try {
    // PI-SAFE-GOLD-GATE-TRACE-001 — FAIL-FAST ENV VALIDATION (P0)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    log.info("Starting youth-to-adult transition job", { jobRunId });

    // Log job execution start
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'STARTED',
        automatic: true,
        scheduled: true,
        source: 'transition-youth-to-adult-job',
      },
    });

    // ========================================================================
    // 1️⃣ FIND ATHLETES WITH GUARDIAN_LINKS (indicating youth membership)
    // ========================================================================
    const { data: athletesWithGuardians, error: fetchError } = await supabase
      .from("guardian_links")
      .select(`
        athlete_id,
        guardian_id,
        tenant_id,
        athlete:athletes!inner(
          id,
          birth_date,
          full_name,
          tenant_id
        )
      `);

    if (fetchError) {
      throw new Error(`Failed to fetch guardian_links: ${fetchError.message}`);
    }

    log.info("Found athletes with guardians", { count: athletesWithGuardians?.length || 0 });

    if (!athletesWithGuardians || athletesWithGuardians.length === 0) {
      // Log job completion even with 0 processed
      await createAuditLog(supabase, {
        event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
        tenant_id: null,
        metadata: {
          job_run_id: jobRunId,
          status: 'COMPLETED',
          processed: 0,
          transitioned: 0,
          skipped: 0,
          failed: 0,
          automatic: true,
          scheduled: true,
          source: 'transition-youth-to-adult-job',
        },
      });

      return new Response(
        JSON.stringify({
          job: "transition-youth-to-adult",
          jobRunId,
          success: true,
          processed: 0,
          transitioned: 0,
          skipped: 0,
          failed: 0,
          message: "No athletes with guardians found",
        }),
        { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ========================================================================
    // 2️⃣ FILTER FOR ADULTS (age >= 18) USING PRECISE CALCULATION
    // ========================================================================
    const adultsWithGuardians = athletesWithGuardians.filter(link => {
      const athlete = link.athlete as unknown as { id: string; birth_date: string; full_name: string; tenant_id: string };
      return athlete && isAdult(athlete.birth_date);
    });

    log.info("Athletes now adults", { count: adultsWithGuardians.length });

    const results: TransitionResult[] = [];

    for (const guardianLink of adultsWithGuardians) {
      const athlete = guardianLink.athlete as unknown as { 
        id: string; 
        birth_date: string; 
        full_name: string; 
        tenant_id: string 
      };

      // ====================================================================
      // 3️⃣ FIND ACTIVE MEMBERSHIP WITH is_minor = true
      // ====================================================================
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("id, athlete_id, status, applicant_data, tenant_id")
        .eq("athlete_id", athlete.id)
        .in("status", ["ACTIVE", "APPROVED"])
        .limit(1);

      if (membershipError) {
        log.info("Error fetching membership", { athleteId: athlete.id, error: membershipError.message });
        results.push({
          athleteId: athlete.id,
          membershipId: "",
          success: false,
          error: membershipError.message,
        });
        continue;
      }

      if (!memberships || memberships.length === 0) {
        log.info("Skip - no active membership", { athleteId: athlete.id });
        results.push({
          athleteId: athlete.id,
          membershipId: "",
          success: true,
          skipped: true,
          skipReason: "no_active_membership",
        });
        continue;
      }

      const membership = memberships[0];
      const applicantData = membership.applicant_data as Record<string, unknown> | null;

      // ====================================================================
      // 4️⃣ IDEMPOTENCY CHECK - Skip if already transitioned
      // ====================================================================
      if (applicantData?.is_minor !== true) {
        log.info("Skip - already transitioned or not a minor", { 
          athleteId: athlete.id, 
          membershipId: membership.id,
          is_minor: applicantData?.is_minor 
        });
        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: true,
          skipped: true,
          skipReason: "already_transitioned",
        });
        continue;
      }

      // ====================================================================
      // 5️⃣ UPDATE MEMBERSHIP applicant_data (SAFE GOLD)
      // ====================================================================
      try {
        const updatedApplicantData = {
          ...applicantData,
          is_minor: false,
          youth_transition: {
            transitioned_at: new Date().toISOString(),
            previous_guardian: applicantData.guardian || null,
            job_run_id: jobRunId,
          },
        };

        delete (updatedApplicantData as Record<string, unknown>).guardian;

        const { error: updateError } = await supabase
          .from("memberships")
          .update({ 
            applicant_data: updatedApplicantData,
            updated_at: new Date().toISOString()
          })
          .eq("id", membership.id)
          .eq("status", membership.status);

        if (updateError) {
          throw updateError;
        }

        log.info("Membership transitioned", { 
          athleteId: athlete.id, 
          membershipId: membership.id 
        });

        // ====================================================================
        // 6️⃣ AUDIT LOG - YOUTH_AUTO_TRANSITION
        // ====================================================================
        await createAuditLog(supabase, {
          event_type: AUDIT_EVENTS.YOUTH_AUTO_TRANSITION,
          tenant_id: membership.tenant_id,
          metadata: {
            athlete_id: athlete.id,
            membership_id: membership.id,
            athlete_name: athlete.full_name,
            birth_date: athlete.birth_date,
            previous_is_minor: true,
            new_is_minor: false,
            transitioned_at: new Date().toISOString(),
            guardian_preserved: true,
            guardian_link_preserved: true,
            automatic: true,
            scheduled: true,
            source: "transition-youth-to-adult-job",
            job_run_id: jobRunId,
          },
        });

        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: true,
        });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        log.info("Error transitioning", { 
          athleteId: athlete.id, 
          membershipId: membership.id,
          error: errorMessage 
        });
        results.push({
          athleteId: athlete.id,
          membershipId: membership.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    // ========================================================================
    // 7️⃣ RESPONSE — STANDARDIZED JOB FORMAT
    // ========================================================================
    const processed = results.length;
    const transitioned = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;

    log.info("Job completed", { jobRunId, processed, transitioned, skipped, failed });

    // Log job execution completion
    await createAuditLog(supabase, {
      event_type: AUDIT_EVENTS.JOB_YOUTH_TRANSITION_RUN,
      tenant_id: null,
      metadata: {
        job_run_id: jobRunId,
        status: 'COMPLETED',
        processed,
        transitioned,
        skipped,
        failed,
        automatic: true,
        scheduled: true,
        source: 'transition-youth-to-adult-job',
      },
    });

    return new Response(
      JSON.stringify({
        job: "transition-youth-to-adult",
        jobRunId,
        success: true,
        processed,
        transitioned,
        skipped,
        failed,
        results,
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.info("Job failed", { jobRunId, error: errorMessage });
    return new Response(
      JSON.stringify({
        job: "transition-youth-to-adult",
        jobRunId,
        success: false,
        error: errorMessage,
      }),
      { headers: { ...dynamicCors, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

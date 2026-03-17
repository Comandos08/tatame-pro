/**
 * expire-grace-period — Cron Job (Tier 3)
 *
 * Transitions tenants from PAST_DUE → UNPAID when grace_period_ends_at has passed.
 * Uses billing-state-machine for transition validation and deriveTenantActive for is_active.
 *
 * Schedule: 0 3 * * * (03:05 UTC daily)
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import {
  assertValidBillingTransition,
  deriveTenantActive,
} from "../_shared/billing-state-machine.ts";
import type { BillingStatus } from "../_shared/billing-state-machine.ts";
import {
  okResponse,
  errorResponse,
  buildErrorEnvelope,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";
import { createAuditLog } from "../_shared/audit-logger.ts";
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("expire-grace-period", correlationId);

  // ========================================
  // CRON_SECRET VALIDATION
  // ========================================
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestSecret = req.headers.get("x-cron-secret");

  if (!cronSecret) {
    log.error("CRON_SECRET not configured");
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.misconfigured", false, undefined, correlationId),
      dynamicCors,
    );
  }

  if (requestSecret !== cronSecret) {
    log.warn("Invalid or missing x-cron-secret");
    return errorResponse(
      403,
      buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, undefined, correlationId),
      dynamicCors,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log.setStep("fetch_expired");

    // deno-lint-ignore no-temporal — cron job requires runtime timestamp (aligned with expire-memberships)
    const nowIso = new Date().toISOString();

    const { data: expiredTenants, error } = await supabase
      .from("tenant_billing")
      .select("tenant_id, status, grace_period_ends_at")
      .eq("status", "PAST_DUE")
      .not("grace_period_ends_at", "is", null)
      .lt("grace_period_ends_at", nowIso);

    if (error) {
      log.error("Failed to fetch expired grace periods", error);
      return errorResponse(
        500,
        buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.db_error", true, undefined, correlationId),
        dynamicCors,
      );
    }

    const count = expiredTenants?.length ?? 0;
    log.info("Found expired grace periods", { count });

    let transitioned = 0;
    let failed = 0;

    for (const tenant of expiredTenants ?? []) {
      log.setStep("transition");
      log.setTenant(tenant.tenant_id);

      try {
        // A03 — Validate transition via state machine
        assertValidBillingTransition("PAST_DUE" as BillingStatus, "UNPAID" as BillingStatus);

        // Update billing status to UNPAID
        const { error: updateError } = await supabase
          .from("tenant_billing")
          .update({ status: "UNPAID" })
          .eq("tenant_id", tenant.tenant_id)
          .eq("status", "PAST_DUE"); // Conditional update for race protection

        if (updateError) {
          log.warn("Failed to update billing status", { error: updateError.message, tenant_id: tenant.tenant_id });
          failed++;
          continue;
        }

        // A03 — deriveTenantActive: single source of truth for is_active
        const isActive = deriveTenantActive("UNPAID" as BillingStatus);
        await supabase
          .from("tenants")
          .update({ is_active: isActive })
          .eq("id", tenant.tenant_id);

        // Audit log
        await createAuditLog(supabase, {
          event_type: "BILLING_GRACE_PERIOD_EXPIRED",
          tenant_id: tenant.tenant_id,
          metadata: {
            previous_status: "PAST_DUE",
            new_status: "UNPAID",
            grace_period_ends_at: tenant.grace_period_ends_at,
            is_active: isActive,
            source: "expire-grace-period",
            correlation_id: correlationId,
          },
        });

        log.info("Tenant transitioned to UNPAID", { tenant_id: tenant.tenant_id });
        transitioned++;
      } catch (err) {
        log.error("Transition failed for tenant", err, { tenant_id: tenant.tenant_id });
        failed++;
      }
    }

    log.setStep("done");
    log.info("Job completed", { transitioned, failed, total: count });

    return okResponse(
      {
        job: "expire-grace-period",
        success: true,
        found: count,
        transitioned,
        failed,
      },
      dynamicCors,
      correlationId,
    );
  } catch (err) {
    log.error("Unhandled error", err);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.unhandled", true, undefined, correlationId),
      dynamicCors,
    );
  }
});

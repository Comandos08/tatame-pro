/**
 * 🔍 audit-billing-consistency — Periodic Billing Consistency Scan
 *
 * P2-02: Scheduled scan that verifies billing↔tenant consistency for ALL active tenants.
 * Detects drift that may have occurred due to silent webhook failures.
 *
 * TRIGGER: pg_cron (daily) or manual via SUPERADMIN
 * AUTH: Service role only (no user auth required for cron)
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveTenantActive, isKnownBillingStatus } from "../_shared/billing-state-machine.ts";
import type { BillingStatus } from "../_shared/billing-state-machine.ts";
import { createBackendLogger } from "../_shared/backend-logger.ts";
import { extractCorrelationId } from "../_shared/correlation.ts";
import { corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";
import {
  buildErrorEnvelope,
  errorResponse,
  okResponse,
  ERROR_CODES,
} from "../_shared/errors/envelope.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }
  const dynamicCors = buildCorsHeaders(req.headers.get("Origin") ?? null);

  const correlationId = extractCorrelationId(req);
  const log = createBackendLogger("audit-billing-consistency", correlationId);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: either an x-cron-secret header (pg_cron path) OR a SUPERADMIN_GLOBAL JWT.
    // The previous implementation compared the Authorization header against the
    // service-role key with `.includes()`, which is a brittle and timing-leaky
    // way to identify cron callers. The pg_cron migration already sends the
    // canonical `x-cron-secret` header — we match that instead.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const requestCronSecret = req.headers.get("x-cron-secret");
    const isCronCall = Boolean(cronSecret && requestCronSecret && requestCronSecret === cronSecret);

    if (!isCronCall) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return errorResponse(
          401,
          buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.missing_token", false, undefined, correlationId),
          dynamicCors,
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return errorResponse(
          401,
          buildErrorEnvelope(ERROR_CODES.UNAUTHORIZED, "auth.invalid_token", false, undefined, correlationId),
          dynamicCors,
        );
      }
      const { data: superadmin } = await supabase
        .from("user_roles").select("id")
        .eq("user_id", user.id).eq("role", "SUPERADMIN_GLOBAL")
        .is("tenant_id", null).maybeSingle();
      if (!superadmin) {
        return errorResponse(
          403,
          buildErrorEnvelope(ERROR_CODES.FORBIDDEN, "auth.forbidden", false, ["SUPERADMIN_GLOBAL required"], correlationId),
          dynamicCors,
        );
      }

      // Rate limiting for human callers: 10 scans per hour (expensive full-table scan)
      const rateLimiter = RATE_LIMIT_PRESETS.auditTool();
      const rlContext = buildRateLimitContext(req, user.id, null);
      const rlResult = await rateLimiter.check(rlContext);
      if (!rlResult.allowed) {
        log.warn("Rate limit exceeded for audit-billing-consistency", { userId: user.id });
        return rateLimiter.tooManyRequestsResponse(rlResult, dynamicCors, correlationId);
      }
    }

    log.info("Starting billing consistency scan");

    // Fetch all tenants with billing
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, slug, is_active")
      .order("created_at", { ascending: false });

    if (tenantsError || !tenants) {
      throw new Error(`Failed to fetch tenants: ${tenantsError?.message}`);
    }

    const { data: billingRecords, error: billingError } = await supabase
      .from("tenant_billing")
      .select("tenant_id, status");

    if (billingError) {
      throw new Error(`Failed to fetch billing: ${billingError.message}`);
    }

    const billingByTenant = new Map(
      (billingRecords || []).map((b) => [b.tenant_id, b.status])
    );

    const mismatches: Array<{
      tenant_id: string;
      tenant_slug: string;
      is_active: boolean;
      billing_status: string;
      expected_active: boolean;
    }> = [];

    for (const tenant of tenants) {
      const billingStatus = billingByTenant.get(tenant.id);
      if (!billingStatus) continue; // No billing record — skip

      if (!isKnownBillingStatus(billingStatus)) {
        mismatches.push({
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          is_active: tenant.is_active ?? false,
          billing_status: billingStatus,
          expected_active: false,
        });
        continue;
      }

      const expectedActive = deriveTenantActive(billingStatus as BillingStatus);
      const actualActive = tenant.is_active ?? false;

      if (expectedActive !== actualActive) {
        mismatches.push({
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          is_active: actualActive,
          billing_status: billingStatus,
          expected_active: expectedActive,
        });
      }
    }

    // Log results. Mismatches are a data-integrity incident: they mean a
    // tenant's is_active flag has drifted from what the billing status
    // expects (silent webhook failure, manual override gone wrong, etc.)
    // and on-call needs to know without a human refreshing this endpoint.
    if (mismatches.length > 0) {
      log.critical("BILLING_CONSISTENCY_MISMATCH_DETECTED", undefined, {
        total_tenants: tenants.length,
        tenants_with_billing: billingByTenant.size,
        mismatches_found: mismatches.length,
        sample: mismatches.slice(0, 5).map((m) => ({
          tenant_slug: m.tenant_slug,
          billing_status: m.billing_status,
          is_active: m.is_active,
          expected_active: m.expected_active,
        })),
      });
    } else {
      log.info("Billing consistency scan complete", {
        total_tenants: tenants.length,
        tenants_with_billing: billingByTenant.size,
        mismatches_found: 0,
      });
    }

    // Record scan result as institutional event
    await supabase.from("institutional_events").insert({
      event_type: "BILLING_CONSISTENCY_SCAN_COMPLETED",
      severity: mismatches.length > 0 ? "WARNING" : "INFO",
      source: "audit-billing-consistency",
      metadata: {
        total_tenants: tenants.length,
        tenants_with_billing: billingByTenant.size,
        mismatches_found: mismatches.length,
        mismatches: mismatches.slice(0, 50),
        scan_timestamp: new Date().toISOString(),
      },
    });

    if (mismatches.length > 0) {
      for (const mismatch of mismatches) {
        await supabase.from("audit_logs").insert({
          event_type: "BILLING_CONSISTENCY_MISMATCH",
          tenant_id: mismatch.tenant_id,
          metadata: {
            billing_status: mismatch.billing_status,
            is_active: mismatch.is_active,
            expected_active: mismatch.expected_active,
            detected_by: "scheduled_scan",
            source: "audit-billing-consistency",
          },
        });
      }
    }

    return okResponse(
      {
        total_tenants: tenants.length,
        tenants_with_billing: billingByTenant.size,
        mismatches_found: mismatches.length,
        mismatches,
      },
      dynamicCors,
      correlationId,
    );
  } catch (error) {
    // Pages on-call. This watcher IS the billing-consistency net: if its
    // own run dies (DB unreachable, schema drift on tenants/tenant_billing,
    // OOM mid-scan), drift goes silently undetected until the next
    // scheduled run. Same severity as a detected mismatch.
    log.critical("Billing consistency scan failed", error);
    return errorResponse(
      500,
      buildErrorEnvelope(ERROR_CODES.INTERNAL_ERROR, "system.scan_failed", false, ["billing consistency scan failed"], correlationId),
      dynamicCors,
    );
  }
});

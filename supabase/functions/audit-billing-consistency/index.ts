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
import { corsHeaders, corsPreflightResponse, buildCorsHeaders } from "../_shared/cors.ts";
import { RATE_LIMIT_PRESETS, buildRateLimitContext } from "../_shared/secure-rate-limiter.ts";


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

    // Auth: Only service role or SUPERADMIN
    const authHeader = req.headers.get("authorization");
    if (authHeader && !authHeader.includes(supabaseServiceKey)) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401, headers: { ...dynamicCors, "Content-Type": "application/json" },
        });
      }
      const { data: superadmin } = await supabase
        .from("user_roles").select("id")
        .eq("user_id", user.id).eq("role", "SUPERADMIN_GLOBAL")
        .is("tenant_id", null).maybeSingle();
      if (!superadmin) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
          status: 403, headers: { ...dynamicCors, "Content-Type": "application/json" },
        });
      }

      // Rate limiting for human callers: 10 scans per hour (expensive full-table scan)
      const rateLimiter = RATE_LIMIT_PRESETS.auditTool();
      const rlContext = buildRateLimitContext(req, user.id, null);
      const rlResult = await rateLimiter.check(rlContext);
      if (!rlResult.allowed) {
        log.warn("Rate limit exceeded for audit-billing-consistency", { userId: user.id });
        return new Response(JSON.stringify({ ok: false, error: "Rate limit exceeded" }), {
          status: 429, headers: { ...dynamicCors, "Content-Type": "application/json", "Retry-After": String(rlResult.retryAfterSeconds ?? 3600) },
        });
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

    // Log results
    log.info("Billing consistency scan complete", {
      total_tenants: tenants.length,
      tenants_with_billing: billingByTenant.size,
      mismatches_found: mismatches.length,
    });

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

    return new Response(
      JSON.stringify({
        ok: true,
        total_tenants: tenants.length,
        tenants_with_billing: billingByTenant.size,
        mismatches_found: mismatches.length,
        mismatches,
      }),
      { status: 200, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Billing consistency scan failed", error);
    return new Response(
      JSON.stringify({ ok: false, error: "Scan failed" }),
      { status: 500, headers: { ...dynamicCors, "Content-Type": "application/json" } }
    );
  }
});

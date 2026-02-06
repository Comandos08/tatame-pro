/**
 * requireActiveTenantBillingWrite — Combined Tenant + Billing Write Gate
 * 
 * P3.4 — Billing Enforcement on Events
 * P3.5 — Billing-Aware Audit Trail
 * 
 * CONTRACT:
 * 1) Tenant must exist and be ACTIVE
 * 2) Billing must allow WRITE (TRIALING or ACTIVE, not blocked)
 * 3) All decisions (ALLOWED + BLOCKED) are audited
 * 
 * HTTP STATUS CODES:
 * - 404: TENANT_NOT_FOUND
 * - 409: TENANT_NOT_ACTIVE (tenant exists but not ACTIVE)
 * - 402: BILLING_BLOCKED (PENDING_DELETE, CANCELED)
 * - 423: BILLING_READ_ONLY (TRIAL_EXPIRED, PAST_DUE)
 * 
 * This is a READ-ONLY gate — does not modify any data except audit logs.
 */

import { requireBillingStatus, BillingStatus } from "./requireBillingStatus.ts";
import { emitBillingAuditEvent, AuditDomain } from "./emitBillingAuditEvent.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface TenantBillingWriteParams {
  supabase: SupabaseClient;
  tenantId: string;
  userId: string | null;
  domain: AuditDomain;
  operation: string;
}

export interface TenantBillingWriteResult {
  ok: boolean;
  httpStatus?: number;
  code?: string;
  error?: string;
  tenantStatus?: string;
  billingStatus?: BillingStatus | null;
}

// Statuses that completely block writes (hard block)
const BLOCKED_STATUSES: BillingStatus[] = ['PENDING_DELETE', 'CANCELED'];

// Statuses that allow read-only (soft block)
const READ_ONLY_STATUSES: BillingStatus[] = ['TRIAL_EXPIRED', 'PAST_DUE'];

/**
 * Check if tenant is ACTIVE and billing allows write operations.
 * Emits audit events for both ALLOWED and BLOCKED decisions.
 * 
 * @param params - The gate parameters including domain and operation
 */
export async function requireActiveTenantBillingWrite(
  params: TenantBillingWriteParams
): Promise<TenantBillingWriteResult> {
  const { supabase, tenantId, userId, domain, operation } = params;

  try {
    console.log(`[requireActiveTenantBillingWrite] Checking ${domain}:${operation} for tenant:`, tenantId);

    // ========================================================================
    // STEP 1: Fetch Tenant
    // ========================================================================
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, status")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError) {
      console.error("[requireActiveTenantBillingWrite] Tenant fetch error:", tenantError.message);
      return {
        ok: false,
        httpStatus: 500,
        code: "TENANT_FETCH_ERROR",
        error: "Error fetching tenant information",
      };
    }

    // ========================================================================
    // STEP 2: Tenant Not Found
    // ========================================================================
    if (!tenant) {
      console.warn("[requireActiveTenantBillingWrite] Tenant not found:", tenantId);
      return {
        ok: false,
        httpStatus: 404,
        code: "TENANT_NOT_FOUND",
        error: "Tenant not found",
      };
    }

    // ========================================================================
    // STEP 3: Tenant Must Be ACTIVE
    // ========================================================================
    if (tenant.status !== "ACTIVE") {
      console.log("[requireActiveTenantBillingWrite] Tenant not ACTIVE:", tenant.status);
      
      // P3.5: Audit the blocked decision
      await emitBillingAuditEvent(supabase, {
        event_type: 'TENANT_NOT_ACTIVE_BLOCK',
        tenant_id: tenantId,
        profile_id: userId,
        domain,
        operation,
        decision: 'BLOCKED',
        tenant_status: tenant.status,
        billing_status: null,
        billing_block_reason: 'TENANT_NOT_ACTIVE',
      });

      return {
        ok: false,
        httpStatus: 409,
        code: "TENANT_NOT_ACTIVE",
        error: `Tenant must be ACTIVE, current status: ${tenant.status}`,
        tenantStatus: tenant.status,
      };
    }

    // ========================================================================
    // STEP 4: Check Billing Status
    // ========================================================================
    const billingCheck = await requireBillingStatus(supabase, tenantId);

    // If billing check had an error
    if (billingCheck.code === "BILLING_CHECK_ERROR") {
      return {
        ok: false,
        httpStatus: 500,
        code: "BILLING_CHECK_ERROR",
        error: billingCheck.error ?? "Error checking billing status",
        billingStatus: null,
      };
    }

    // If no billing record found
    if (billingCheck.code === "BILLING_NOT_FOUND") {
      // P3.5: Audit the blocked decision
      await emitBillingAuditEvent(supabase, {
        event_type: 'BILLING_BLOCKED',
        tenant_id: tenantId,
        profile_id: userId,
        domain,
        operation,
        decision: 'BLOCKED',
        tenant_status: tenant.status,
        billing_status: null,
        billing_block_reason: 'BILLING_NOT_FOUND',
      });

      return {
        ok: false,
        httpStatus: 402,
        code: "BILLING_NOT_FOUND",
        error: "Billing information not found",
        billingStatus: null,
      };
    }

    const status = billingCheck.status;

    // ========================================================================
    // STEP 5: Check for Hard Block (PENDING_DELETE, CANCELED)
    // ========================================================================
    if (status && BLOCKED_STATUSES.includes(status)) {
      console.log("[requireActiveTenantBillingWrite] Billing BLOCKED:", status);
      
      // P3.5: Audit the blocked decision
      await emitBillingAuditEvent(supabase, {
        event_type: 'BILLING_BLOCKED',
        tenant_id: tenantId,
        profile_id: userId,
        domain,
        operation,
        decision: 'BLOCKED',
        tenant_status: tenant.status,
        billing_status: status,
        billing_block_reason: 'BILLING_BLOCKED',
      });

      return {
        ok: false,
        httpStatus: 402,
        code: "BILLING_BLOCKED",
        error: `Operation blocked: billing status is ${status}`,
        billingStatus: status,
      };
    }

    // ========================================================================
    // STEP 6: Check for Read-Only (TRIAL_EXPIRED, PAST_DUE)
    // ========================================================================
    if (status && READ_ONLY_STATUSES.includes(status) && !billingCheck.isManualOverride) {
      console.log("[requireActiveTenantBillingWrite] Billing READ_ONLY:", status);
      
      // P3.5: Audit the blocked decision
      await emitBillingAuditEvent(supabase, {
        event_type: 'BILLING_READ_ONLY_BLOCK',
        tenant_id: tenantId,
        profile_id: userId,
        domain,
        operation,
        decision: 'BLOCKED',
        tenant_status: tenant.status,
        billing_status: status,
        billing_block_reason: 'BILLING_READ_ONLY',
      });

      return {
        ok: false,
        httpStatus: 423,
        code: "BILLING_READ_ONLY",
        error: `Write operations not permitted: billing status is ${status}`,
        billingStatus: status,
      };
    }

    // ========================================================================
    // STEP 7: Check if Billing Allows (ACTIVE, TRIALING, or manual override)
    // ========================================================================
    if (!billingCheck.allowed) {
      console.log("[requireActiveTenantBillingWrite] Billing not allowed:", status);
      
      // P3.5: Audit the blocked decision
      await emitBillingAuditEvent(supabase, {
        event_type: 'BILLING_WRITE_BLOCKED',
        tenant_id: tenantId,
        profile_id: userId,
        domain,
        operation,
        decision: 'BLOCKED',
        tenant_status: tenant.status,
        billing_status: status,
        billing_block_reason: billingCheck.code ?? 'BILLING_RESTRICTED',
      });

      return {
        ok: false,
        httpStatus: 402,
        code: "BILLING_BLOCKED",
        error: billingCheck.error ?? "Operation not permitted due to billing status",
        billingStatus: status,
      };
    }

    // ========================================================================
    // SUCCESS: Tenant is ACTIVE and Billing allows writes
    // ========================================================================
    console.log(`[requireActiveTenantBillingWrite] ${domain}:${operation} allowed for tenant:`, tenantId);
    
    // P3.5: Audit the allowed decision
    await emitBillingAuditEvent(supabase, {
      event_type: 'BILLING_WRITE_ALLOWED',
      tenant_id: tenantId,
      profile_id: userId,
      domain,
      operation,
      decision: 'ALLOWED',
      tenant_status: tenant.status,
      billing_status: status,
    });

    return {
      ok: true,
      tenantStatus: tenant.status,
      billingStatus: status,
    };

  } catch (err) {
    console.error("[requireActiveTenantBillingWrite] Unexpected error:", err);
    return {
      ok: false,
      httpStatus: 500,
      code: "INTERNAL_ERROR",
      error: "Internal error checking tenant billing status",
    };
  }
}

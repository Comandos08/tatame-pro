/**
 * 🔐 requireBillingStatus — Billing Status Enforcement for Edge Functions
 * 
 * Validates that the tenant's billing status allows sensitive operations.
 * DENY BY DEFAULT — blocks operations in TRIAL_EXPIRED, PENDING_DELETE, CANCELED, etc.
 * 
 * Allowed statuses for sensitive operations:
 * - ACTIVE
 * - TRIALING
 * - (Or is_manual_override = true)
 * 
 * @module requireBillingStatus
 */

// Use generic type for Supabase client to avoid version mismatches
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type BillingStatus = 
  | 'ACTIVE' 
  | 'TRIALING' 
  | 'TRIAL_EXPIRED' 
  | 'PENDING_DELETE' 
  | 'PAST_DUE' 
  | 'CANCELED' 
  | 'UNPAID' 
  | 'INCOMPLETE';

export interface BillingCheckResult {
  allowed: boolean;
  status: BillingStatus | null;
  isManualOverride: boolean;
  error?: string;
  code?: string;
}

const ALLOWED_STATUSES: BillingStatus[] = ['ACTIVE', 'TRIALING'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

/**
 * Check if tenant's billing status allows sensitive operations
 * 
 * @param supabase - Service role Supabase client
 * @param tenantId - The tenant ID to check
 * @returns BillingCheckResult with allowed status and details
 */
export async function requireBillingStatus(
  supabase: SupabaseClient,
  tenantId: string
): Promise<BillingCheckResult> {
  try {
    const { data: billing, error } = await supabase
      .from("tenant_billing")
      .select("status, is_manual_override")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      console.error("[requireBillingStatus] Database error:", error.message);
      return {
        allowed: false,
        status: null,
        isManualOverride: false,
        error: "Error checking billing status",
        code: "BILLING_CHECK_ERROR",
      };
    }

    if (!billing) {
      // No billing record found - this is unexpected but should fail closed
      console.warn("[requireBillingStatus] No billing record found for tenant:", tenantId);
      return {
        allowed: false,
        status: null,
        isManualOverride: false,
        error: "Billing information not found",
        code: "BILLING_NOT_FOUND",
      };
    }

    const status = billing.status as BillingStatus;
    const isManualOverride = billing.is_manual_override === true;

    // Manual override bypasses status check
    if (isManualOverride) {
      console.log("[requireBillingStatus] Manual override active, allowing operation");
      return {
        allowed: true,
        status,
        isManualOverride: true,
      };
    }

    // Check if status allows operations
    if (!ALLOWED_STATUSES.includes(status)) {
      console.log("[requireBillingStatus] Billing status not allowed:", status);
      return {
        allowed: false,
        status,
        isManualOverride: false,
        error: `Operation blocked: billing status is ${status}`,
        code: "BILLING_RESTRICTED",
      };
    }

    return {
      allowed: true,
      status,
      isManualOverride: false,
    };
  } catch (err) {
    console.error("[requireBillingStatus] Unexpected error:", err);
    return {
      allowed: false,
      status: null,
      isManualOverride: false,
      error: "Error checking billing status",
      code: "BILLING_CHECK_ERROR",
    };
  }
}

/**
 * Create a standardized BILLING_RESTRICTED response.
 * Returns 403 Forbidden with consistent error format.
 */
export function billingRestrictedResponse(status: BillingStatus | null): Response {
  return new Response(
    JSON.stringify({ 
      ok: false, 
      error: "Operation not permitted due to billing status",
      code: "BILLING_RESTRICTED",
      status,
    }),
    { 
      status: 403, 
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json',
      } 
    }
  );
}

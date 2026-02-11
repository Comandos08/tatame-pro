/**
 * ============================================================================
 * 🔐 requireBillingStatus — Billing Access Gate (READ-ONLY)
 * ============================================================================
 * 
 * IMMUTABLE CONTRACT:
 * -------------------
 * This module is the SINGLE SOURCE OF TRUTH for billing access decisions.
 * It determines whether a tenant can perform sensitive operations based on
 * their billing status.
 * 
 * WHAT THIS MODULE DOES:
 * - Reads tenant_billing.status from the database
 * - Evaluates if status is in ALLOWED_STATUSES
 * - Checks for is_manual_override bypass
 * - Returns a typed result with allowed/blocked decision
 * 
 * WHAT THIS MODULE DOES NOT DO:
 * - Does NOT charge the customer
 * - Does NOT create Stripe sessions
 * - Does NOT modify billing records
 * - Does NOT cancel subscriptions
 * - Does NOT send billing emails
 * - Does NOT trigger webhooks
 * 
 * SECURITY INVARIANTS:
 * - FAIL-CLOSED: Any error results in blocked access (BY DESIGN)
 * - No billing record = blocked (INTENTIONAL)
 * - Only ACTIVE and TRIALING allow operations (BY DESIGN)
 * - Manual override is an escape hatch for support (INTENTIONAL)
 * 
 * BILLING IS NOT PUNISHMENT:
 * - This is an ACCESS GATE, not a penalty system
 * - Operations are blocked to protect data integrity during billing issues
 * - Users can always VIEW their data, just not MODIFY it
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 * 
 * ============================================================================
 * @module requireBillingStatus
 */

import { createBackendLogger } from "./backend-logger.ts";

// Use generic type for Supabase client to avoid version mismatches
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * All possible billing statuses in the system.
 * BY DESIGN: Only ACTIVE and TRIALING allow sensitive operations.
 */
export type BillingStatus = 
  | 'ACTIVE' 
  | 'TRIALING' 
  | 'TRIAL_EXPIRED' 
  | 'PENDING_DELETE' 
  | 'PAST_DUE' 
  | 'CANCELED' 
  | 'UNPAID' 
  | 'INCOMPLETE';

/**
 * Result of a billing status check.
 * INTENTIONAL: Typed result for consistent handling by callers.
 */
export interface BillingCheckResult {
  allowed: boolean;
  status: BillingStatus | null;
  isManualOverride: boolean;
  error?: string;
  code?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Statuses that allow sensitive operations.
 * BY DESIGN: Restrictive allowlist, not a blocklist.
 */
const ALLOWED_STATUSES: BillingStatus[] = ['ACTIVE', 'TRIALING'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-impersonation-id',
};

// ============================================================================
// BILLING CHECK FUNCTION
// ============================================================================

/**
 * Check if tenant's billing status allows sensitive operations.
 * 
 * READ-ONLY: This function only reads billing status.
 * It does NOT modify any data or trigger any side effects.
 * 
 * @param supabase - Service role Supabase client
 * @param tenantId - The tenant ID to check
 * @returns BillingCheckResult with allowed status and details
 */
export async function requireBillingStatus(
  supabase: SupabaseClient,
  tenantId: string
): Promise<BillingCheckResult> {
  const log = createBackendLogger("requireBillingStatus", crypto.randomUUID());
  log.setTenant(tenantId);

  try {
    // ========================================================================
    // STEP 1: Fetch Billing Record
    // ========================================================================
    const { data: billing, error } = await supabase
      .from("tenant_billing")
      .select("status, is_manual_override")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // ========================================================================
    // STEP 2: Handle Database Errors
    // FAIL-CLOSED: Database error = blocked access
    // ========================================================================
    if (error) {
      log.error("Database error", error);
      return {
        allowed: false,
        status: null,
        isManualOverride: false,
        error: "Error checking billing status",
        code: "BILLING_CHECK_ERROR",
      };
    }

    // ========================================================================
    // STEP 3: Handle Missing Billing Record
    // FAIL-CLOSED: No record = blocked access (INTENTIONAL)
    // ========================================================================
    if (!billing) {
      log.warn("No billing record found for tenant");
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

    // ========================================================================
    // STEP 4: Check Manual Override
    // BY DESIGN: Support escape hatch for special cases
    // ========================================================================
    if (isManualOverride) {
      log.info("Manual override active, allowing operation");
      return {
        allowed: true,
        status,
        isManualOverride: true,
      };
    }

    // ========================================================================
    // STEP 5: Evaluate Status Against Allowlist
    // BY DESIGN: Only ACTIVE and TRIALING pass
    // ========================================================================
    if (!ALLOWED_STATUSES.includes(status)) {
      log.info("Billing status not allowed", { status });
      return {
        allowed: false,
        status,
        isManualOverride: false,
        error: `Operation blocked: billing status is ${status}`,
        code: "BILLING_RESTRICTED",
      };
    }

    // ========================================================================
    // STEP 6: Access Granted
    // ========================================================================
    return {
      allowed: true,
      status,
      isManualOverride: false,
    };
  } catch (err) {
    // ========================================================================
    // FALLBACK: Unexpected Errors
    // FAIL-CLOSED: Any exception = blocked access
    // ========================================================================
    log.error("Unexpected error", err);
    return {
      allowed: false,
      status: null,
      isManualOverride: false,
      error: "Error checking billing status",
      code: "BILLING_CHECK_ERROR",
    };
  }
}

// ============================================================================
// RESPONSE HELPER
// ============================================================================

/**
 * Create a standardized BILLING_RESTRICTED response.
 * Returns 403 Forbidden with consistent error format.
 * 
 * DOES NOT modify billing status.
 * DOES NOT trigger any side effects.
 * Only formats a response for the caller to return.
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
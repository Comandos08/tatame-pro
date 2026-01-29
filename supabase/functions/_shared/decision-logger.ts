/**
 * 🔐 Decision Logger with Hash Chain Integrity
 * 
 * Logs security decisions (blocks, denials) with cryptographic hash chain.
 * Each log entry references the previous hash for tamper detection.
 * 
 * IMPORTANT: Only call from Edge Functions with service role client.
 */

import { SecuritySeverity } from "./security-logger.ts";

// Use generic type for Supabase client to avoid version mismatches
// deno-lint-ignore no-explicit-any
type SupabaseAdminClient = any;

// Decision types that trigger logging
export const DECISION_TYPES = {
  RATE_LIMIT_BLOCK: 'RATE_LIMIT_BLOCK',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  IMPERSONATION_BLOCK: 'IMPERSONATION_BLOCK',
  ONBOARDING_BLOCK: 'ONBOARDING_BLOCK',
  CROSS_TENANT_BLOCK: 'CROSS_TENANT_BLOCK',
  AUTH_FAILURE: 'AUTH_FAILURE',
  VALIDATION_FAILURE: 'VALIDATION_FAILURE',
  PASSWORD_RESET: 'PASSWORD_RESET',
  MEMBERSHIP_APPROVED: 'MEMBERSHIP_APPROVED',
  MEMBERSHIP_REJECTED: 'MEMBERSHIP_REJECTED',
  BILLING_RESTRICTED: 'BILLING_RESTRICTED',
} as const;

export type DecisionType = typeof DECISION_TYPES[keyof typeof DECISION_TYPES];

export interface DecisionLogData {
  decision_type: DecisionType;
  severity?: SecuritySeverity;
  operation?: string;
  user_id?: string | null;
  tenant_id?: string | null;
  reason_code: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calculate SHA-256 hash of payload using Web Crypto API (Deno native)
 */
async function calculateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the hash of the last decision log for a tenant
 */
async function getLastHash(
  supabaseAdmin: SupabaseAdminClient,
  tenantId: string | null
): Promise<string | null> {
  if (!tenantId) {
    // For global events without tenant, get the last global event
    const { data, error } = await supabaseAdmin
      .from('decision_logs')
      .select('current_hash')
      .is('tenant_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[DECISION-LOG] Failed to get last global hash:', error.message);
      return null;
    }
    return data?.current_hash || null;
  }

  const { data, error } = await supabaseAdmin
    .from('decision_logs')
    .select('current_hash')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[DECISION-LOG] Failed to get last hash:', error.message);
    return null;
  }

  return data?.current_hash || null;
}

/**
 * Log a security decision with hash chain integrity
 * 
 * @param supabaseAdmin - Service role Supabase client
 * @param decision - Decision data to log
 * @returns The created log ID or null if failed
 */
export async function logDecision(
  supabaseAdmin: SupabaseAdminClient,
  decision: DecisionLogData
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString();
    
    // Get previous hash for chain integrity
    const previousHash = await getLastHash(supabaseAdmin, decision.tenant_id || null);

    // Create payload for hashing (deterministic order)
    const hashPayload = JSON.stringify({
      decision_type: decision.decision_type,
      severity: decision.severity || 'MEDIUM',
      operation: decision.operation || null,
      user_id: decision.user_id || null,
      tenant_id: decision.tenant_id || null,
      reason_code: decision.reason_code,
      metadata: decision.metadata || {},
      previous_hash: previousHash,
      timestamp,
    });

    // Calculate current hash
    const currentHash = await calculateSHA256(hashPayload);

    // Insert decision log
    const { data, error } = await supabaseAdmin
      .from('decision_logs')
      .insert({
        decision_type: decision.decision_type,
        severity: decision.severity || 'MEDIUM',
        operation: decision.operation || null,
        user_id: decision.user_id || null,
        tenant_id: decision.tenant_id || null,
        reason_code: decision.reason_code,
        previous_hash: previousHash,
        current_hash: currentHash,
        metadata: {
          ...decision.metadata,
          logged_at: timestamp,
        },
      })
      .select('id')
      .single();

    if (error) {
      console.error('[DECISION-LOG] Failed to insert:', error.message);
      return null;
    }

    console.log(`[DECISION-LOG] Created: ${decision.decision_type} (${decision.reason_code}) -> ${data.id}`);
    return data.id;

  } catch (err) {
    console.error('[DECISION-LOG] Unexpected error:', err);
    return null;
  }
}

/**
 * Log a rate limit block decision
 */
export async function logRateLimitBlock(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    operation: string;
    user_id?: string | null;
    tenant_id?: string | null;
    ip_address?: string;
    count?: number;
    limit?: number;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.RATE_LIMIT_BLOCK,
    severity: 'HIGH',
    operation: options.operation,
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: 'TOO_MANY_REQUESTS',
    metadata: {
      ip_address: options.ip_address,
      request_count: options.count,
      limit: options.limit,
    },
  });
}

/**
 * Log a permission denied decision
 */
export async function logPermissionDenied(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    operation: string;
    user_id?: string | null;
    tenant_id?: string | null;
    required_roles?: string[];
    actual_roles?: string[];
    reason?: string;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.PERMISSION_DENIED,
    severity: 'MEDIUM',
    operation: options.operation,
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: options.reason || 'INSUFFICIENT_PERMISSIONS',
    metadata: {
      required_roles: options.required_roles,
      actual_roles: options.actual_roles,
    },
  });
}

/**
 * Log an impersonation block decision
 */
export async function logImpersonationBlock(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    operation: string;
    user_id: string;
    tenant_id?: string | null;
    impersonation_id?: string;
    reason: string;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.IMPERSONATION_BLOCK,
    severity: 'HIGH',
    operation: options.operation,
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: options.reason,
    metadata: {
      impersonation_id: options.impersonation_id,
    },
  });
}

/**
 * Log a cross-tenant access block
 */
export async function logCrossTenantBlock(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    operation: string;
    user_id: string;
    source_tenant_id?: string | null;
    target_tenant_id: string;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.CROSS_TENANT_BLOCK,
    severity: 'CRITICAL',
    operation: options.operation,
    user_id: options.user_id,
    tenant_id: options.target_tenant_id,
    reason_code: 'CROSS_TENANT_VIOLATION',
    metadata: {
      source_tenant_id: options.source_tenant_id,
      target_tenant_id: options.target_tenant_id,
    },
  });
}

/**
 * Log a membership approval decision
 */
export async function logMembershipApproved(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    user_id: string;
    tenant_id: string;
    membership_id: string;
    impersonation_id?: string | null;
    actor_role: 'ADMIN_TENANT' | 'SUPERADMIN_GLOBAL';
    athlete_id?: string;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.MEMBERSHIP_APPROVED,
    severity: 'HIGH',
    operation: 'approve-membership',
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: 'SUCCESS',
    metadata: {
      membership_id: options.membership_id,
      impersonation_id: options.impersonation_id,
      actor_role: options.actor_role,
      athlete_id: options.athlete_id,
    },
  });
}

/**
 * Log a membership rejection decision
 */
export async function logMembershipRejected(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    user_id: string;
    tenant_id: string;
    membership_id: string;
    rejection_reason?: string;
    impersonation_id?: string | null;
    actor_role: 'ADMIN_TENANT' | 'SUPERADMIN_GLOBAL';
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.MEMBERSHIP_REJECTED,
    severity: 'HIGH',
    operation: 'reject-membership',
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: 'SUCCESS',
    metadata: {
      membership_id: options.membership_id,
      rejection_reason: options.rejection_reason,
      impersonation_id: options.impersonation_id,
      actor_role: options.actor_role,
    },
  });
}

/**
 * Log a billing restricted decision (P1 enforcement)
 */
export async function logBillingRestricted(
  supabaseAdmin: SupabaseAdminClient,
  options: {
    operation: string;
    user_id: string;
    tenant_id: string;
    billing_status: string | null;
  }
): Promise<string | null> {
  return logDecision(supabaseAdmin, {
    decision_type: DECISION_TYPES.BILLING_RESTRICTED,
    severity: 'MEDIUM',
    operation: options.operation,
    user_id: options.user_id,
    tenant_id: options.tenant_id,
    reason_code: 'BILLING_RESTRICTED',
    metadata: {
      billing_status: options.billing_status,
      blocked_at: new Date().toISOString(),
    },
  });
}

/**
 * Verify the hash chain integrity for a tenant
 */
export async function verifyHashChain(
  supabaseAdmin: SupabaseAdminClient,
  tenantId: string
): Promise<{ valid: boolean; brokenAt?: string; totalLogs: number }> {
  const { data, error } = await supabaseAdmin
    .rpc('verify_decision_log_chain', { p_tenant_id: tenantId });

  if (error) {
    console.error('[DECISION-LOG] Chain verification failed:', error.message);
    return { valid: false, totalLogs: 0 };
  }

  const logs = data || [];
  const invalidLog = logs.find((log: { is_valid: boolean }) => !log.is_valid);

  return {
    valid: !invalidLog,
    brokenAt: invalidLog?.log_id,
    totalLogs: logs.length,
  };
}

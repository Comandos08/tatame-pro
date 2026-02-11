/**
 * 🔐 requireImpersonationIfSuperadmin — Backend Validation Utility
 * 
 * Ensures that SUPERADMIN_GLOBAL users have a valid impersonation session
 * when performing sensitive tenant-scoped operations.
 * 
 * SECURITY RULES:
 * - If caller is SUPERADMIN_GLOBAL: requires valid impersonation for the target tenant
 * - If caller is tenant admin/staff: uses normal role-based checks
 * - Deny by default
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createBackendLogger } from "./backend-logger.ts";

interface ImpersonationValidation {
  valid: boolean;
  isSuperadmin: boolean;
  impersonationId?: string;
  error?: string;
}

/**
 * Validates that a superadmin has a valid impersonation session for the given tenant.
 * Returns validation result including whether the caller is a superadmin.
 * 
 * @param supabaseAdmin - Service role client
 * @param userId - The authenticated user's ID
 * @param targetTenantId - The tenant ID the operation is targeting
 * @param impersonationId - The impersonation session ID from request header/body
 */
export async function requireImpersonationIfSuperadmin(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string,
  targetTenantId: string,
  impersonationId?: string | null
): Promise<ImpersonationValidation> {
  const log = createBackendLogger("requireImpersonationIfSuperadmin", crypto.randomUUID());
  log.setUser(userId);
  log.setTenant(targetTenantId);

  // 1️⃣ Check if user is SUPERADMIN_GLOBAL
  const { data: superadminRole, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .is('tenant_id', null)
    .eq('role', 'SUPERADMIN_GLOBAL')
    .maybeSingle();

  if (roleError) {
    log.error('Role check failed', roleError);
    return { valid: false, isSuperadmin: false, error: 'Failed to verify role' };
  }

  // 2️⃣ Not a superadmin - use normal role-based checks
  if (!superadminRole) {
    return { valid: true, isSuperadmin: false };
  }

  // 3️⃣ Superadmin without impersonation ID
  if (!impersonationId) {
    log.warn('Superadmin attempted action without impersonation');
    return { 
      valid: false, 
      isSuperadmin: true, 
      error: 'Superadmin requires active impersonation for tenant operations' 
    };
  }

  // 4️⃣ Validate impersonation session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('superadmin_impersonations')
    .select('id, superadmin_user_id, target_tenant_id, status, expires_at')
    .eq('id', impersonationId)
    .maybeSingle();

  if (sessionError || !session) {
    log.warn('Invalid impersonation session', undefined, { impersonation_id: impersonationId });
    return { 
      valid: false, 
      isSuperadmin: true, 
      error: 'Invalid impersonation session' 
    };
  }

  // 5️⃣ Verify session ownership
  if (session.superadmin_user_id !== userId) {
    log.warn('Session not owned by user', undefined, { impersonation_id: impersonationId });
    return { 
      valid: false, 
      isSuperadmin: true, 
      error: 'Impersonation session belongs to another user' 
    };
  }

  // 6️⃣ Verify session is active
  if (session.status !== 'ACTIVE') {
    return { 
      valid: false, 
      isSuperadmin: true, 
      error: `Impersonation session is ${session.status}` 
    };
  }

  // 7️⃣ Verify not expired
  if (new Date(session.expires_at) <= new Date()) {
    // Auto-expire the session
    await supabaseAdmin
      .from('superadmin_impersonations')
      .update({ status: 'EXPIRED', ended_at: new Date().toISOString() })
      .eq('id', impersonationId);

    return { 
      valid: false, 
      isSuperadmin: true, 
      error: 'Impersonation session has expired' 
    };
  }

  // 8️⃣ Verify tenant matches
  if (session.target_tenant_id !== targetTenantId) {
    log.warn('Tenant mismatch', undefined, { 
      session_tenant: session.target_tenant_id, 
      target_tenant: targetTenantId 
    });
    return { 
      valid: false, 
      isSuperadmin: true, 
      error: 'Impersonation session is for a different tenant' 
    };
  }

  // ✅ Valid impersonation
  return { 
    valid: true, 
    isSuperadmin: true, 
    impersonationId 
  };
}

/**
 * Extracts impersonation ID from request headers or body.
 * Checks x-impersonation-id header first, then body.impersonationId.
 */
export function extractImpersonationId(
  req: Request,
  body?: { impersonationId?: string }
): string | null {
  // 1️⃣ Check header first
  const headerValue = req.headers.get('x-impersonation-id');
  if (headerValue && typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  // 2️⃣ Check body
  if (body?.impersonationId && typeof body.impersonationId === 'string') {
    return body.impersonationId.trim();
  }

  return null;
}
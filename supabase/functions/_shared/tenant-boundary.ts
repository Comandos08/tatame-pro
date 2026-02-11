/**
 * 🔐 tenant-boundary.ts — Zero-Trust Tenant Boundary Enforcement (A04)
 *
 * SAFE GOLD — Fail-closed, deterministic, additive only.
 *
 * This module provides composable guards for tenant isolation.
 * All guards THROW on failure (Adjustment 1) — callers cannot ignore violations.
 *
 * Does NOT replace requireTenantRole (additive only).
 * Functions can adopt assertTenantAccess incrementally.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createBackendLogger } from "./backend-logger.ts";
import { requireImpersonationIfSuperadmin } from "./requireImpersonationIfSuperadmin.ts";
import { deriveTenantActive } from "./billing-state-machine.ts";
import type { BillingStatus } from "./billing-state-machine.ts";
import { isKnownBillingStatus } from "./billing-state-machine.ts";

// =============================================================================
// ERROR CLASS
// =============================================================================

export type TenantBoundaryCode =
  | "TENANT_NOT_FOUND"
  | "TENANT_INACTIVE"
  | "NO_MEMBERSHIP"
  | "IMPERSONATION_REQUIRED"
  | "IMPERSONATION_MISMATCH";

/**
 * Structured error for tenant boundary violations.
 * Callers catch this specifically and convert to A07 envelope.
 */
export class TenantBoundaryError extends Error {
  public readonly code: TenantBoundaryCode;

  constructor(code: TenantBoundaryCode, message: string) {
    super(message);
    this.name = "TenantBoundaryError";
    this.code = code;
  }
}

// =============================================================================
// UUID FORMAT GUARD
// =============================================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidFormat(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

// =============================================================================
// SUCCESS RESULT
// =============================================================================

export interface TenantAccessResult {
  userId: string;
  tenantId: string;
  isSuperadmin: boolean;
}

// =============================================================================
// assertTenantAccess — THROWS on failure (fail-closed)
// =============================================================================

/**
 * Validates that a user has legitimate access to a tenant.
 *
 * Checks:
 * 1. tenantId is valid UUID
 * 2. Tenant exists and is_active = true
 * 3. User has membership in user_roles for this tenant
 *    OR is SUPERADMIN with valid impersonation
 *
 * @throws TenantBoundaryError on any failure
 * @returns Success metadata if all checks pass
 */
export async function assertTenantAccess(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string,
  tenantId: string,
  impersonationId?: string | null,
): Promise<TenantAccessResult> {
  const log = createBackendLogger("tenant-boundary", crypto.randomUUID());
  log.setUser(userId);
  log.setTenant(tenantId);

  // 1. Validate UUID format
  if (!isUuidFormat(tenantId)) {
    throw new TenantBoundaryError(
      "TENANT_NOT_FOUND",
      `Invalid tenant ID format: ${tenantId}`,
    );
  }

  // 2. Check tenant exists and is active
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("tenants")
    .select("id, is_active")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    throw new TenantBoundaryError(
      "TENANT_NOT_FOUND",
      `Tenant not found: ${tenantId}`,
    );
  }

  if (!tenant.is_active) {
    throw new TenantBoundaryError(
      "TENANT_INACTIVE",
      `Tenant is inactive: ${tenantId}`,
    );
  }

  // 3. Check SUPERADMIN status
  const { data: globalRole } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "SUPERADMIN_GLOBAL")
    .is("tenant_id", null)
    .maybeSingle();

  const isSuperadmin = !!globalRole;

  if (isSuperadmin) {
    // SUPERADMIN must have valid impersonation for this tenant
    await assertTenantMatchesImpersonation(
      supabaseAdmin,
      userId,
      tenantId,
      impersonationId,
    );
    return { userId, tenantId, isSuperadmin: true };
  }

  // 4. Check user has membership in this tenant
  const { data: userRoles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .limit(1);

  if (rolesError || !userRoles || userRoles.length === 0) {
    throw new TenantBoundaryError(
      "NO_MEMBERSHIP",
      `User ${userId} has no membership in tenant ${tenantId}`,
    );
  }

  return { userId, tenantId, isSuperadmin: false };
}

// =============================================================================
// assertTenantMatchesImpersonation — THROWS on failure
// =============================================================================

/**
 * Validates that a SUPERADMIN user has a valid impersonation session
 * targeting the specified tenant.
 *
 * @throws TenantBoundaryError if impersonation is missing or mismatched
 */
export async function assertTenantMatchesImpersonation(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string,
  tenantId: string,
  impersonationId?: string | null,
): Promise<void> {
  const log = createBackendLogger("tenant-boundary", crypto.randomUUID());

  if (!impersonationId) {
    throw new TenantBoundaryError(
      "IMPERSONATION_REQUIRED",
      `SUPERADMIN ${userId} must impersonate to access tenant ${tenantId}`,
    );
  }

  // Delegate to existing impersonation validator
  const result = await requireImpersonationIfSuperadmin(
    supabaseAdmin,
    userId,
    tenantId,
    impersonationId,
  );

  if (!result.valid) {
    const code: TenantBoundaryCode = result.reason === "missing_impersonation"
      ? "IMPERSONATION_REQUIRED"
      : "IMPERSONATION_MISMATCH";

    log.error("Impersonation validation failed", null, {
      reason: result.reason,
      userId,
      tenantId,
      impersonationId,
    });

    throw new TenantBoundaryError(
      code,
      `Impersonation invalid for tenant ${tenantId}: ${result.reason}`,
    );
  }
}

// =============================================================================
// assertBillingTenantConsistency — Post-write detection (THROWS on mismatch)
// =============================================================================

/**
 * Post-write consistency check between tenants.is_active and tenant_billing.status.
 * Detection-only safety net — callers should catch, audit, never 500.
 *
 * @throws Error if consistency mismatch detected
 */
export async function assertBillingTenantConsistency(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  tenantId: string,
): Promise<void> {
  const log = createBackendLogger("tenant-boundary", crypto.randomUUID());

  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("is_active")
    .eq("id", tenantId)
    .maybeSingle();

  const { data: billing } = await supabaseAdmin
    .from("tenant_billing")
    .select("status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!tenant || !billing) {
    // Cannot validate — skip (billing may not be provisioned yet)
    return;
  }

  const billingStatus = billing.status as string;
  if (!isKnownBillingStatus(billingStatus)) {
    log.error("Unknown billing status during consistency check", null, {
      tenantId,
      billingStatus,
    });
    return;
  }

  const expectedActive = deriveTenantActive(billingStatus as BillingStatus);
  const actualActive = tenant.is_active ?? false;

  if (expectedActive !== actualActive) {
    throw new Error(
      `Billing-tenant consistency mismatch: tenant ${tenantId} is_active=${actualActive} but billing status=${billingStatus} expects is_active=${expectedActive}`,
    );
  }
}

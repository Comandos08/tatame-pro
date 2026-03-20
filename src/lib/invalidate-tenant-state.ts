/**
 * P0 — Centralized tenant state invalidation helper
 *
 * Call this after ANY mutation that changes critical tenant state:
 * - onboarding completion
 * - billing status change
 * - feature flag changes
 * - impersonation start/end
 *
 * Ensures all caches are consistently invalidated so gates and
 * navigation reflect the new state immediately.
 */
import type { QueryClient } from '@tanstack/react-query';

export function invalidateTenantState(tenantId: string | undefined, queryClient: QueryClient): void {
  if (!tenantId) return;

  // Source of truth for onboarding and billing gates
  queryClient.invalidateQueries({ queryKey: ['tenant-flags-contract', tenantId] });

  // Onboarding wizard status
  queryClient.invalidateQueries({ queryKey: ['onboarding-status', tenantId] });

  // Feature access contract (sidebar nav visibility)
  queryClient.invalidateQueries({ queryKey: ['access-contract', tenantId] });
}

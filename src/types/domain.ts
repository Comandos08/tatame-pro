// src/types/domain.ts
// Consolidated domain types for TATAME platform
// SAFE MODE: Re-exports existing types, no files moved

// Re-exports (NÃO mover arquivos existentes!)
export type { Tenant, TenantContext, SportType } from './tenant';
export type { MembershipStatus, PaymentStatus, MembershipType } from './membership';

// Billing status types (aligned with Stripe)
export type BillingStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'INCOMPLETE';

// Tenant billing information
export interface TenantBilling {
  id: string;
  tenant_id: string;
  status: BillingStatus;
  current_period_end: string | null;
  is_manual_override: boolean;
  override_at: string | null;
}

// Athlete base type
export interface Athlete {
  id: string;
  tenant_id: string;
  full_name: string;
  is_active: boolean;
}

// Audit log entry with proper typing
export interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  event_type: string;
  metadata: Record<string, unknown>;  // Type-safe metadata
  created_at: string;
}

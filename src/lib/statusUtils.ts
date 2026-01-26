// src/lib/statusUtils.ts
// P4B-5A: Status utilities for type safety and i18n

import type { StatusType } from '@/components/ui/status-badge';

// Valid status values for type checking
const VALID_STATUSES: StatusType[] = [
  'DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'ACTIVE', 
  'EXPIRED', 'CANCELLED', 'REJECTED', 'TRIALING', 'PAST_DUE', 
  'INCOMPLETE', 'UNPAID', 'ISSUED', 'REVOKED', 'PAID', 'NOT_PAID', 
  'FAILED', 'success', 'warning', 'error', 'info', 'neutral'
];

/**
 * Type guard to validate if a string is a valid StatusType
 */
export function isValidStatusType(value: string | null | undefined): value is StatusType {
  return typeof value === 'string' && VALID_STATUSES.includes(value as StatusType);
}

/**
 * Get the i18n key for a status value
 * Usage: t(getStatusI18nKey('ACTIVE')) → 'status.active'
 */
export function getStatusI18nKey(status: StatusType): string {
  return `status.${status.toLowerCase()}`;
}

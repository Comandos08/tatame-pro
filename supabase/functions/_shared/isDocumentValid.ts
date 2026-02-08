/**
 * GOLDEN RULE — Institutional Document Validity (Edge Function Version)
 * 
 * A single, pure function that determines if any institutional document
 * (digital card, diploma, certificate) is valid.
 * 
 * RULES (immutable):
 * 1. Tenant must be ACTIVE
 * 2. Billing must be ACTIVE or TRIALING
 * 3. Document status must be ACTIVE or ISSUED
 * 4. Document must NOT be revoked
 * 
 * This function is the SINGLE SOURCE OF TRUTH for document validity.
 * No other code should duplicate this logic.
 */

export type TenantLifecycleStatus = 'SETUP' | 'ACTIVE' | 'BLOCKED';

export type DocumentStatus = 
  | 'DRAFT' 
  | 'ACTIVE' 
  | 'SUSPENDED' 
  | 'EXPIRED' 
  | 'REVOKED'  // Digital cards
  | 'ISSUED';  // Diplomas

export type BillingStatus = 
  | 'ACTIVE' 
  | 'TRIALING' 
  | 'TRIAL_EXPIRED' 
  | 'PENDING_DELETE' 
  | 'PAST_DUE' 
  | 'CANCELED' 
  | 'UNPAID' 
  | 'INCOMPLETE';

export interface DocumentValidityInput {
  tenantStatus: TenantLifecycleStatus | string;
  billingStatus: BillingStatus | string;
  documentStatus: DocumentStatus | string;
  revokedAt?: string | null;
}

export interface DocumentValidityResult {
  isValid: boolean;
  reason: DocumentInvalidReason | null;
}

export type DocumentInvalidReason =
  | 'TENANT_NOT_ACTIVE'
  | 'BILLING_INVALID'
  | 'DOCUMENT_NOT_ACTIVE'
  | 'DOCUMENT_REVOKED';

/**
 * Determines if an institutional document is valid.
 */
export function isInstitutionalDocumentValid(
  input: DocumentValidityInput
): DocumentValidityResult {
  const { tenantStatus, billingStatus, documentStatus, revokedAt } = input;

  // Rule 1: Tenant must be ACTIVE
  if (tenantStatus !== 'ACTIVE') {
    return { isValid: false, reason: 'TENANT_NOT_ACTIVE' };
  }

  // Rule 2: Billing must be ACTIVE or TRIALING
  const validBillingStatuses = ['ACTIVE', 'TRIALING'];
  if (!validBillingStatuses.includes(billingStatus)) {
    return { isValid: false, reason: 'BILLING_INVALID' };
  }

  // Rule 3: Document status must be ACTIVE or ISSUED
  const validDocumentStatuses = ['ACTIVE', 'ISSUED'];
  if (!validDocumentStatuses.includes(documentStatus)) {
    return { isValid: false, reason: 'DOCUMENT_NOT_ACTIVE' };
  }

  // Rule 4: Document must NOT be revoked
  if (revokedAt) {
    return { isValid: false, reason: 'DOCUMENT_REVOKED' };
  }

  return { isValid: true, reason: null };
}

/**
 * Simplified boolean check for document validity.
 */
export function isDocumentValid(input: DocumentValidityInput): boolean {
  return isInstitutionalDocumentValid(input).isValid;
}

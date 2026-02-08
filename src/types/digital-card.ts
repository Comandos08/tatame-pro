/**
 * Digital Card Explicit States
 * SAFE GOLD: Explicit lifecycle management
 */

export type DigitalCardStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED';

export interface DigitalCard {
  id: string;
  tenant_id: string;
  membership_id: string;
  qr_code_data: string | null;
  qr_code_image_url: string | null;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Explicit state columns
  status: DigitalCardStatus;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/**
 * Status display configuration
 */
export const DIGITAL_CARD_STATUS_LABELS: Record<DigitalCardStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  EXPIRED: 'Expirada',
  REVOKED: 'Revogada',
};

/**
 * Status color mapping for UI
 */
export const DIGITAL_CARD_STATUS_COLORS: Record<DigitalCardStatus, 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  EXPIRED: 'error',
  REVOKED: 'error',
};

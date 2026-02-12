/**
 * FX-01 — Deterministic Login Resume for Membership Flow
 *
 * Unified sessionStorage persistence for membership form data.
 * Ensures zero data loss across login redirects with fail-closed safety.
 *
 * RULES:
 * - Single storage key per membership type
 * - 30-minute expiry
 * - Tenant slug validation
 * - Clear only after successful checkout session creation
 */

import { logger } from '@/lib/logger';

const STORAGE_KEY_ADULT = 'tatame.membership.resume.adult';
const STORAGE_KEY_YOUTH = 'tatame.membership.resume.youth';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export type MembershipResumeType = 'adult' | 'youth';

export interface MembershipResumeData {
  membershipType: MembershipResumeType;
  step: number;
  formData: Record<string, unknown>;
  guardianData?: Record<string, unknown> | null;
  tenantSlug: string;
  timestamp: number;
}

export type ResumeOutcome = 'success' | 'expired' | 'invalid' | 'tenant_mismatch' | 'not_found';

/**
 * FX-01A: Extract resumeStep from raw storage even when outcome is non-success.
 * Returns 0 if parsing fails entirely.
 */
export function extractResumeStepFromStorage(type: MembershipResumeType): number {
  try {
    const raw = sessionStorage.getItem(getStorageKey(type));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed?.step === 'number' ? parsed.step : 0;
  } catch {
    return 0;
  }
}

interface ResumeResult {
  outcome: ResumeOutcome;
  data: MembershipResumeData | null;
}

function getStorageKey(type: MembershipResumeType): string {
  return type === 'adult' ? STORAGE_KEY_ADULT : STORAGE_KEY_YOUTH;
}

/**
 * Save membership form state for login resume.
 */
export function saveMembershipResume(data: MembershipResumeData): void {
  try {
    const key = getStorageKey(data.membershipType);
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage unavailable — silent fail
  }
}

/**
 * Attempt to restore membership form state after login.
 * Validates tenant slug match and 30-minute expiry.
 * Returns structured outcome for observability.
 */
export function restoreMembershipResume(
  type: MembershipResumeType,
  currentTenantSlug: string
): ResumeResult {
  const key = getStorageKey(type);

  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return { outcome: 'not_found', data: null };
    }

    const parsed = JSON.parse(raw) as MembershipResumeData;

    // Validate structure
    if (!parsed.tenantSlug || !parsed.timestamp || !parsed.formData || !parsed.step) {
      clearMembershipResume(type);
      return { outcome: 'invalid', data: null };
    }

    // Validate tenant
    if (parsed.tenantSlug !== currentTenantSlug) {
      clearMembershipResume(type);
      return { outcome: 'tenant_mismatch', data: null };
    }

    // Validate expiry
    const age = Date.now() - parsed.timestamp;
    if (age > MAX_AGE_MS) {
      clearMembershipResume(type);
      return { outcome: 'expired', data: null };
    }

    return { outcome: 'success', data: parsed };
  } catch {
    clearMembershipResume(type);
    return { outcome: 'invalid', data: null };
  }
}

/**
 * Clear resume data for a specific membership type.
 */
export function clearMembershipResume(type: MembershipResumeType): void {
  try {
    sessionStorage.removeItem(getStorageKey(type));
  } catch {
    // Silent fail
  }
}

/**
 * Check if any membership resume data exists (used by AuthCallback).
 */
export function detectMembershipResume(): { type: MembershipResumeType; tenantSlug: string } | null {
  try {
    for (const type of ['adult', 'youth'] as MembershipResumeType[]) {
      const raw = sessionStorage.getItem(getStorageKey(type));
      if (!raw) continue;

      const parsed = JSON.parse(raw) as MembershipResumeData;
      if (parsed.tenantSlug && parsed.timestamp) {
        const age = Date.now() - parsed.timestamp;
        if (age <= MAX_AGE_MS) {
          return { type, tenantSlug: parsed.tenantSlug };
        }
      }
    }
  } catch {
    // Silent fail
  }
  return null;
}

/**
 * Log structured observability event for membership resume.
 * FX-01A: For non-success outcomes, log the actual stored step (or 0 if unparseable).
 */
export function logMembershipResumeEvent(
  tenantSlug: string,
  membershipType: MembershipResumeType,
  resumeStep: number,
  resumeOutcome: ResumeOutcome
): void {
  logger.info('[MEMBERSHIP_LOGIN_RESUME_TRIGGERED]', {
    tenantSlug,
    membershipType,
    resumeStep,
    resumeOutcome,
  });
}

/**
 * FX-01A: Clean up a specific legacy sessionStorage key, but ONLY after
 * a restore attempt has already been made (never before).
 */
export function cleanupLegacyKey(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Silent fail
  }
}

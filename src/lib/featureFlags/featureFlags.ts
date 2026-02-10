// ============================================================================
// PI U15 — INSTITUTIONAL FEATURE FLAGS (Canonical Model)
// ============================================================================
//
// Feature flags for progressive enablement and kill switches.
// NOT a replacement for can() permissions or RLS.
//
// Usage order: can(feature) → state (billing, lifecycle) → flag → render
// ============================================================================

export type InstitutionalFeatureFlag =
  | 'EVENTS_V2'
  | 'ADVANCED_REPORTS'
  | 'DIGITAL_DIPLOMA_PDF'
  | 'ACADEMY_PUBLIC_PAGE'
  | 'EXPERIMENTAL_UI';

export const INSTITUTIONAL_FLAGS: readonly InstitutionalFeatureFlag[] = [
  'EVENTS_V2',
  'ADVANCED_REPORTS',
  'DIGITAL_DIPLOMA_PDF',
  'ACADEMY_PUBLIC_PAGE',
  'EXPERIMENTAL_UI',
] as const;

/** Resolved flag map — all flags default to false */
export type FeatureFlagMap = Record<InstitutionalFeatureFlag, boolean>;

/** Build a default (all-false) flag map */
export function buildDefaultFlagMap(): FeatureFlagMap {
  const map = {} as FeatureFlagMap;
  for (const flag of INSTITUTIONAL_FLAGS) {
    map[flag] = false;
  }
  return map;
}

/**
 * Merge raw flag records into a resolved map.
 * Global flags (tenant_id IS NULL) are applied first,
 * then tenant-specific overrides.
 */
export function resolveFlags(
  records: Array<{ flag: string; enabled: boolean; tenant_id: string | null }>,
  tenantId: string | undefined
): FeatureFlagMap {
  const map = buildDefaultFlagMap();

  // Apply globals first
  for (const rec of records) {
    if (rec.tenant_id === null && isValidFlag(rec.flag)) {
      map[rec.flag] = rec.enabled;
    }
  }

  // Apply tenant overrides
  if (tenantId) {
    for (const rec of records) {
      if (rec.tenant_id === tenantId && isValidFlag(rec.flag)) {
        map[rec.flag] = rec.enabled;
      }
    }
  }

  return map;
}

function isValidFlag(flag: string): flag is InstitutionalFeatureFlag {
  return INSTITUTIONAL_FLAGS.includes(flag as InstitutionalFeatureFlag);
}

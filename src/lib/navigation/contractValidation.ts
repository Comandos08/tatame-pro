/**
 * 🔍 Navigation Contract Validation — DEV ONLY
 * PI E1 — Contrato de Navegação Autorizada
 * 
 * Emits console.warn for route violations.
 * Never throws. Never blocks. Zero production impact.
 */

type Persona = 'SUPERADMIN_GLOBAL' | 'ADMIN_TENANT' | 'ATHLETE' | 'PUBLIC';

interface ContractEntry {
  pattern: RegExp;
  persona: Persona[];
  description: string;
}

const ROUTE_CONTRACT: ContractEntry[] = [
  // 1️⃣ Institutional (Global)
  { pattern: /^\/admin$/, persona: ['SUPERADMIN_GLOBAL'], description: 'Admin Dashboard' },
  { pattern: /^\/admin\/health/, persona: ['SUPERADMIN_GLOBAL'], description: 'System Health' },
  { pattern: /^\/admin\/audit/, persona: ['SUPERADMIN_GLOBAL'], description: 'Audit Log' },
  { pattern: /^\/admin\/diagnostics/, persona: ['SUPERADMIN_GLOBAL'], description: 'Admin Diagnostics' },
  { pattern: /^\/admin\/landing/, persona: ['SUPERADMIN_GLOBAL'], description: 'Landing Settings' },
  { pattern: /^\/admin\/tenants\//, persona: ['SUPERADMIN_GLOBAL'], description: 'Tenant Control' },

  // 2️⃣ Organizational (Tenant App)
  { pattern: /^\/[^/]+\/app(\/|$)/, persona: ['ADMIN_TENANT'], description: 'Tenant App' },

  // 3️⃣ Athlete
  { pattern: /^\/[^/]+\/portal(\/|$)/, persona: ['ATHLETE'], description: 'Athlete Portal (tenant)' },
  { pattern: /^\/portal(\/|$)/, persona: ['ATHLETE'], description: 'Portal Router' },

  // 4️⃣ Federation — DECLARED / INACTIVE (PI E1.1)
  // No federation routes are allowed without an explicit activation PI.

  // 5️⃣ Public (always allowed)
  { pattern: /^\/$/, persona: ['PUBLIC'], description: 'Landing' },
  { pattern: /^\/(login|signup|help|about|forgot-password|reset-password)$/, persona: ['PUBLIC'], description: 'Auth Pages' },
  { pattern: /^\/auth\/callback/, persona: ['PUBLIC'], description: 'Auth Callback' },
  { pattern: /^\/verify\//, persona: ['PUBLIC'], description: 'Public Verification' },
  { pattern: /^\/identity\/wizard/, persona: ['PUBLIC'], description: 'Identity Wizard' },
  { pattern: /^\/[^/]+\/(login|membership|verify|academies|rankings|events)/, persona: ['PUBLIC'], description: 'Tenant Public Pages' },
  { pattern: /^\/[^/]+$/, persona: ['PUBLIC'], description: 'Tenant Landing' },
];

/**
 * Validates if a route matches any entry in the navigation contract.
 * DEV-only: emits console.warn, never throws.
 */
export function validateRouteContract(pathname: string): void {
  if (import.meta.env.PROD) return;

  // PI E1.1: Federation Domain is DECLARED but INACTIVE
  if (pathname.startsWith('/federation')) {
    logger.warn(
      '[Navigation Contract] ⚠️ Federation Domain is DECLARED but INACTIVE (PI E1.1). ' +
      'No federation routes are allowed without an explicit activation PI.'
    );
    return;
  }

  const matched = ROUTE_CONTRACT.some((entry) => entry.pattern.test(pathname));

  if (!matched) {
    logger.warn(
      `[Navigation Contract] ⚠️ Route "${pathname}" is not declared in the navigation contract (PI E1). ` +
      `If this route is intentional, add it to docs/NAVIGATION-CONTRACT.md and src/lib/navigation/contractValidation.ts.`
    );
  }
}

/**
 * Validates persona × route alignment.
 * DEV-only: emits console.warn for cross-persona access.
 */
export function validatePersonaAccess(
  pathname: string,
  currentPersona: Persona | null,
): void {
  if (import.meta.env.PROD) return;
  if (!currentPersona) return;

  for (const entry of ROUTE_CONTRACT) {
    if (entry.pattern.test(pathname)) {
      // PUBLIC routes are accessible to all
      if (entry.persona.includes('PUBLIC')) return;

      if (!entry.persona.includes(currentPersona)) {
        logger.warn(
          `[Navigation Contract] ⚠️ Persona "${currentPersona}" accessing "${pathname}" (${entry.description}). ` +
          `Expected persona: ${entry.persona.join(' | ')}. ` +
          `This may indicate a guard misconfiguration.`
        );
      }
      return;
    }
  }
}

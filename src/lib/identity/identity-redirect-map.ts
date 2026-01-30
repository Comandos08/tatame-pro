/**
 * 🔐 IDENTITY REDIRECT MAP — Navegação Declarativa
 *
 * Este mapa define TODOS os redirects possíveis por estado de identidade.
 * Nenhum componente pode inventar redirects fora deste mapa.
 */

import type { IdentityState } from './identity-state-machine';

export interface RedirectContext {
  tenantSlug?: string | null;
  currentPath: string;
  redirectPath?: string | null;
  isImpersonating?: boolean;
  impersonationTenantSlug?: string | null;
}

export interface RedirectDecision {
  shouldRedirect: boolean;
  destination: string | null;
  reason: string;
}

/**
 * Resolve o redirect para um dado estado de identidade.
 * FUNÇÃO PURA — determinística e testável.
 */
export function resolveIdentityRedirect(
  state: IdentityState,
  context: RedirectContext
): RedirectDecision {
  const { currentPath, redirectPath, isImpersonating, impersonationTenantSlug } = context;

  switch (state) {
    case 'UNAUTHENTICATED':
      return {
        shouldRedirect: true,
        destination: '/login',
        reason: 'User not authenticated',
      };

    case 'LOADING':
      return {
        shouldRedirect: false,
        destination: null,
        reason: 'Waiting for auth/identity resolution — show spinner',
      };

    case 'WIZARD_REQUIRED':
      return {
        shouldRedirect: true,
        destination: '/identity/wizard',
        reason: 'Identity wizard not completed',
      };

    case 'SUPERADMIN':
      if (currentPath.startsWith('/admin')) {
        return { shouldRedirect: false, destination: null, reason: 'Superadmin on /admin' };
      }

      if (isImpersonating && impersonationTenantSlug) {
        const tenantPrefix = `/${impersonationTenantSlug}`;
        if (currentPath === tenantPrefix || currentPath.startsWith(`${tenantPrefix}/`)) {
          return { shouldRedirect: false, destination: null, reason: 'Superadmin impersonating tenant' };
        }
      }

      return {
        shouldRedirect: true,
        destination: '/admin',
        reason: 'Superadmin must access via /admin or impersonation',
      };

    case 'RESOLVED':
      if (currentPath === '/portal' && redirectPath && redirectPath !== '/portal') {
        return {
          shouldRedirect: true,
          destination: redirectPath,
          reason: 'Backend provided redirect path',
        };
      }

      return {
        shouldRedirect: false,
        destination: null,
        reason: 'Identity resolved, access granted',
      };

    case 'ERROR':
      // ERROR nunca redireciona — deve renderizar UI de escape
      return {
        shouldRedirect: false,
        destination: null,
        reason: 'Error state — render escape hatch UI',
      };

    default: {
      const _exhaustive: never = state;
      return {
        shouldRedirect: false,
        destination: null,
        reason: `Unknown state: ${_exhaustive}`,
      };
    }
  }
}

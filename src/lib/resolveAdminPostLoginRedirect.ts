/**
 * SAFE GOLD — P2
 * Função única de redirect pós-login de ADMIN / STAFF
 * 
 * DECISÃO TÉCNICA:
 * - NÃO existe rota /blocked dedicada
 * - TenantLayout já bloqueia rotas /app/* quando tenant.isActive = false
 * - Por isso, isBlocked → retorna /app (TenantLayout bloqueia)
 */

import type { TenantBillingState } from '@/lib/billing';

export function resolveAdminPostLoginRedirect(
  tenantSlug: string,
  billingState: TenantBillingState
): string {
  const base = `/${tenantSlug}`;

  // isBlocked = true → TenantLayout irá renderizar TenantBlockedScreen
  // Não precisa de rota especial
  if (billingState.isBlocked) {
    return `${base}/app`;
  }

  // isReadOnly = true → Pode acessar mas com sinal visual
  if (billingState.isReadOnly) {
    return `${base}/app?billing=issue`;
  }

  // Tudo OK
  return `${base}/app`;
}

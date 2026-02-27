/**
 * 🔐 IDENTITY STATE MACHINE — Single Point of Decision
 *
 * REGRA ABSOLUTA: Nenhum componente pode replicar esta lógica.
 * Se precisa saber o estado de identidade, chame resolveIdentityState().
 */

/**
 * Estados fechados de identidade.
 *
 * SEMÂNTICA:
 * - UNAUTHENTICATED: Usuário sem sessão ativa
 * - LOADING: Estado transitório durante resolução (NUNCA permanente)
 * - WIZARD_REQUIRED: Usuário autenticado sem contexto de tenant/role
 * - SUPERADMIN: Superadmin global (acesso via /admin ou impersonation)
 * - RESOLVED: Identidade resolvida com tenant e role
 * - ERROR: Falha recuperável (requer escape hatch)
 */
export type IdentityState =
  | 'UNAUTHENTICATED'
  | 'LOADING'
  | 'WIZARD_REQUIRED'
  | 'SUPERADMIN'
  | 'RESOLVED'
  | 'ERROR';

/**
 * Inputs explícitos para resolução.
 * TODOS os dados vêm deste objeto — sem dependências externas.
 */
export interface IdentityResolutionInput {
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  backendStatus: IdentityState | null;
  hasError: boolean;
}

/**
 * Resolve o estado de identidade de forma determinística.
 * FUNÇÃO PURA — sem side effects.
 *
 * ORDEM DE AVALIAÇÃO (prioritária):
 * R1: Auth loading → LOADING
 * R2: Não autenticado → UNAUTHENTICATED
 * R3: Identity loading → LOADING
 * R4: Erro → ERROR
 * R5: Wizard required → WIZARD_REQUIRED
 * R6: Superadmin → SUPERADMIN
 * R7: Resolved → RESOLVED
 * R8: Fallback → ERROR (defensivo)
 */
export function resolveIdentityState(input: IdentityResolutionInput): IdentityState {
  // R1: Auth ainda carregando
  if (input.isAuthLoading) return 'LOADING';

  // R2: Não autenticado
  if (!input.isAuthenticated) return 'UNAUTHENTICATED';

  // R3: Autenticado mas identity ainda carregando
  if (input.backendStatus === 'LOADING' || input.backendStatus === null) return 'LOADING';

  // R4: Erro
  if (input.backendStatus === 'ERROR' || input.hasError) return 'ERROR';

  // R5: Wizard required
  if (input.backendStatus === 'WIZARD_REQUIRED') return 'WIZARD_REQUIRED';

  // R6: Superadmin
  if (input.backendStatus === 'SUPERADMIN') return 'SUPERADMIN';

  // R7: Resolved
  if (input.backendStatus === 'RESOLVED') return 'RESOLVED';

  // R8: Fallback defensivo (estado desconhecido = erro)
  return 'ERROR';
}

/**
 * LOADING STATE CONTRACT
 *
 * O estado LOADING é transitório e protegido por:
 * 1. Timeout de 12s no IdentityContext (IDENTITY_TIMEOUT_MS)
 * 2. AbortController para cancelar requests pendentes
 * 3. Finally block garantindo transição para ERROR em caso de falha
 *
 * GARANTIA: LOADING nunca é estado terminal.
 */
export const LOADING_STATE_CONTRACT = {
  timeoutMs: 12_000,
  transitionsTo: ['UNAUTHENTICATED', 'WIZARD_REQUIRED', 'SUPERADMIN', 'RESOLVED', 'ERROR'] as const,
  neverTerminal: true,
} as const;

/**
 * Mapeamento de transições válidas.
 */
export const VALID_IDENTITY_TRANSITIONS: Record<IdentityState, readonly IdentityState[]> = {
  UNAUTHENTICATED: ['LOADING'],
  LOADING: ['UNAUTHENTICATED', 'WIZARD_REQUIRED', 'SUPERADMIN', 'RESOLVED', 'ERROR'],
  WIZARD_REQUIRED: ['LOADING', 'RESOLVED', 'SUPERADMIN', 'UNAUTHENTICATED'],
  SUPERADMIN: ['UNAUTHENTICATED', 'LOADING'],
  RESOLVED: ['UNAUTHENTICATED', 'LOADING', 'ERROR'],
  ERROR: ['LOADING', 'UNAUTHENTICATED'],
};

export function isValidIdentityTransition(from: IdentityState, to: IdentityState): boolean {
  if (from === to) return true;
  return VALID_IDENTITY_TRANSITIONS[from]?.includes(to) ?? false;
}

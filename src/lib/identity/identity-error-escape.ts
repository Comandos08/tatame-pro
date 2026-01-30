/**
 * 🔐 ERROR ESCAPE HATCH — Ações explícitas para sair do estado ERROR
 *
 * Garante que o usuário NUNCA fica preso em estado de erro.
 */

import type { IdentityError } from '@/contexts/IdentityContext';

export interface ErrorEscapeOptions {
  /** Ação primária: tentar novamente */
  canRetry: boolean;
  retryLabel: string;

  /** Ação secundária: logout */
  canLogout: boolean;
  logoutLabel: string;

  /** Mensagem para o usuário */
  userMessage: string;

  /** Sugestão de ação */
  suggestion: string;
}

/**
 * Resolve as opções de escape para um dado erro.
 * FUNÇÃO PURA — determinística e testável.
 */
export function resolveErrorEscapeHatch(error: IdentityError | null): ErrorEscapeOptions {
  const code = error?.code ?? 'UNKNOWN';

  switch (code) {
    case 'PERMISSION_DENIED':
      return {
        canRetry: false,
        retryLabel: '',
        canLogout: true,
        logoutLabel: 'Fazer login com outra conta',
        userMessage: error?.message || 'Você não tem permissão para acessar este recurso.',
        suggestion: 'Tente fazer login com uma conta diferente.',
      };

    case 'TENANT_NOT_FOUND':
      return {
        canRetry: true,
        retryLabel: 'Tentar novamente',
        canLogout: true,
        logoutLabel: 'Sair',
        userMessage: error?.message || 'Organização não encontrada.',
        suggestion: 'Verifique se o link está correto ou entre em contato com o administrador.',
      };

    case 'IMPERSONATION_INVALID':
      return {
        canRetry: true,
        retryLabel: 'Tentar novamente',
        canLogout: true,
        logoutLabel: 'Encerrar sessão',
        userMessage: error?.message || 'Sessão de impersonation inválida.',
        suggestion: 'Sua sessão de administrador pode ter expirado.',
      };

    case 'UNKNOWN':
    default:
      return {
        canRetry: true,
        retryLabel: 'Tentar novamente',
        canLogout: true,
        logoutLabel: 'Sair',
        userMessage: error?.message || 'Ocorreu um erro inesperado.',
        suggestion: 'Se o problema persistir, tente sair e entrar novamente.',
      };
  }
}

/**
 * Valida que o estado ERROR sempre tem escape.
 * Usado em testes para garantir que nenhum erro fica sem saída.
 */
export function assertErrorHasEscape(error: IdentityError | null): void {
  const options = resolveErrorEscapeHatch(error);

  if (!options.canRetry && !options.canLogout) {
    throw new Error(
      `[IDENTITY ERROR] No escape hatch for error code: ${error?.code}. ` +
        `User would be stuck. This is a bug.`
    );
  }
}

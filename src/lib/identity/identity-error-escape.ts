/**
 * 🔐 ERROR ESCAPE HATCH — i18n KEY-BASED (Pure Function)
 *
 * Returns i18n KEYS, not translated strings.
 * Translation happens ONLY in UI components.
 * This keeps the function PURE and TESTABLE.
 *
 * Garante que o usuário NUNCA fica preso em estado de erro.
 */

import type { IdentityError } from '@/contexts/IdentityContext';

export interface ErrorEscapeOptions {
  /** Ação primária: tentar novamente */
  canRetry: boolean;
  retryLabelKey: string;

  /** Ação secundária: logout */
  canLogout: boolean;
  logoutLabelKey: string;

  /** i18n key for user message */
  userMessageKey: string;

  /** i18n key for suggestion */
  suggestionKey: string;
  
  /** Fallback message if key not found (for error.message passthrough) */
  fallbackMessage?: string;
}

/**
 * Resolve as opções de escape para um dado erro.
 * FUNÇÃO PURA — determinística e testável.
 * Returns i18n KEYS — translation happens in UI components.
 */
export function resolveErrorEscapeHatch(error: IdentityError | null): ErrorEscapeOptions {
  const code = error?.code ?? 'UNKNOWN';

  switch (code) {
    case 'PERMISSION_DENIED':
      return {
        canRetry: false,
        retryLabelKey: '',
        canLogout: true,
        logoutLabelKey: 'identityError.permissionDenied.logout',
        userMessageKey: 'identityError.permissionDenied.message',
        suggestionKey: 'identityError.permissionDenied.suggestion',
        fallbackMessage: error?.message,
      };

    case 'TENANT_NOT_FOUND':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.tenantNotFound.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.tenantNotFound.logout',
        userMessageKey: 'identityError.tenantNotFound.message',
        suggestionKey: 'identityError.tenantNotFound.suggestion',
        fallbackMessage: error?.message,
      };

    case 'IMPERSONATION_INVALID':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.impersonationInvalid.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.impersonationInvalid.logout',
        userMessageKey: 'identityError.impersonationInvalid.message',
        suggestionKey: 'identityError.impersonationInvalid.suggestion',
        fallbackMessage: error?.message,
      };

    case 'PROFILE_NOT_FOUND':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.profileNotFound.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.profileNotFound.logout',
        userMessageKey: 'identityError.profileNotFound.message',
        suggestionKey: 'identityError.profileNotFound.suggestion',
        fallbackMessage: error?.message,
      };

    case 'NO_ROLES_ASSIGNED':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.noRolesAssigned.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.noRolesAssigned.logout',
        userMessageKey: 'identityError.noRolesAssigned.message',
        suggestionKey: 'identityError.noRolesAssigned.suggestion',
        fallbackMessage: error?.message,
      };

    case 'BILLING_BLOCKED':
      return {
        canRetry: false,
        retryLabelKey: '',
        canLogout: true,
        logoutLabelKey: 'identityError.billingBlocked.logout',
        userMessageKey: 'identityError.billingBlocked.message',
        suggestionKey: 'identityError.billingBlocked.suggestion',
        fallbackMessage: error?.message,
      };

    case 'IDENTITY_TIMEOUT':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.timeout.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.timeout.logout',
        userMessageKey: 'identityError.timeout.message',
        suggestionKey: 'identityError.timeout.suggestion',
        fallbackMessage: error?.message,
      };

    case 'INVITE_INVALID':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.inviteInvalid.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.inviteInvalid.logout',
        userMessageKey: 'identityError.inviteInvalid.message',
        suggestionKey: 'identityError.inviteInvalid.suggestion',
        fallbackMessage: error?.message,
      };

    case 'SLUG_TAKEN':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.slugTaken.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.slugTaken.logout',
        userMessageKey: 'identityError.slugTaken.message',
        suggestionKey: 'identityError.slugTaken.suggestion',
        fallbackMessage: error?.message,
      };

    case 'VALIDATION_ERROR':
      return {
        canRetry: true,
        retryLabelKey: 'identityError.validationError.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.validationError.logout',
        userMessageKey: 'identityError.validationError.message',
        suggestionKey: 'identityError.validationError.suggestion',
        fallbackMessage: error?.message,
      };

    case 'UNKNOWN':
    default:
      return {
        canRetry: true,
        retryLabelKey: 'identityError.unknown.retry',
        canLogout: true,
        logoutLabelKey: 'identityError.unknown.logout',
        userMessageKey: 'identityError.unknown.message',
        suggestionKey: 'identityError.unknown.suggestion',
        fallbackMessage: error?.message,
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

/**
 * EVENTS SAFE GOLD — v1.0
 *
 * Este arquivo define o CONTRATO MÍNIMO e ESTÁVEL
 * usado por testes E2E e instrumentação de UI.
 *
 * ⚠️ IMPORTANTE:
 * - Este NÃO é o domínio completo.
 * - É um SUBSET deliberadamente reduzido.
 * - Nenhum novo estado pode ser adicionado aqui sem novo PI SAFE GOLD.
 */

/**
 * EventState SAFE GOLD (SUBSET)
 */
export type EventState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ONGOING'
  | 'FINISHED'
  | 'CANCELED';

/**
 * RegistrationState SAFE GOLD (SUBSET)
 */
export type RegistrationState =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELED';

/**
 * Política de conexão (somente para testes)
 */
export type ConnectionPolicy =
  | 'REALTIME'
  | 'POLLING'
  | 'OFFLINE';

/**
 * Listas canônicas para asserts
 */
export const SAFE_EVENT_STATES: readonly EventState[] = [
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'FINISHED',
  'CANCELED',
] as const;

export const SAFE_REGISTRATION_STATES: readonly RegistrationState[] = [
  'PENDING',
  'CONFIRMED',
  'CANCELED',
] as const;

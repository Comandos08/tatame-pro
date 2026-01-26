/**
 * Notification Engine — Central Export
 * 
 * Pure decision layer for membership email notifications.
 * Zero side effects, fully deterministic.
 */

export {
  resolveMembershipNotification,
  shouldSend,
  shouldNotSend,
} from './resolveMembershipNotification';

export type {
  MembershipStatus,
  SpecialState,
  NotificationTemplateId,
  SupportedLocale,
  NotificationDecision,
  NoNotificationDecision,
  SendNotificationDecision,
  NotificationPayload,
  ApprovedPayload,
  RejectedPayload,
  ExpiredPayload,
  CancelledPayload,
  RenewedPayload,
  NotificationInput,
} from './resolveMembershipNotification';

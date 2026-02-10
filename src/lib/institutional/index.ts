/**
 * Institutional Document Validation Module
 * 
 * Exports the Golden Rule for document validity.
 */

export {
  isInstitutionalDocumentValid,
  isDocumentValid,
  type DocumentValidityInput,
  type DocumentValidityResult,
  type DocumentInvalidReason,
  type TenantLifecycleStatus,
  type DocumentStatus,
  type BillingStatus,
} from './isDocumentValid';

export {
  type InstitutionalEventDomain,
  type InstitutionalEventType,
  type InstitutionalEvent,
} from './institutionalTimeline';

export { emitInstitutionalEvent } from './emitInstitutionalEvent';

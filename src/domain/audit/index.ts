/**
 * 🔐 AUDIT2.0 — Barrel Export (SAFE GOLD)
 * 
 * Centralized audit domain exports.
 * 
 * FROZEN: Do not modify without constitutional review.
 */

// Types
export type {
  AuditEntryInput,
  NormalizedAuditEntry,
  AuditLogRecord,
  SafeAuditAction,
  SafeAuditEntity,
  SafeAuditLevel,
  SafeAuditViewState,
} from '@/types/audit-state';

export {
  SAFE_AUDIT_ACTIONS,
  SAFE_AUDIT_ENTITIES,
  SAFE_AUDIT_LEVELS,
  SAFE_AUDIT_VIEW_STATES,
  AUDIT_PROTECTED_TABLES,
  isValidAuditAction,
  isValidAuditEntity,
  isValidAuditLevel,
  isValidAuditViewState,
} from '@/types/audit-state';

// Normalization
export {
  normalizeAuditEntry,
  computeAuditHash,
  computeAuditHashSync,
  normalizeAuditViewState,
  countByAction,
  countByEntity,
  countByLevel,
} from './normalize';

// Write Boundary
export {
  writeAuditLog,
  writeAuditLogBatch,
  createAuditEntry,
} from './write';
export type { WriteAuditResult, BatchWriteResult } from './write';

// Read API
export {
  fetchAuditLogs,
  fetchAuditLogById,
  fetchAuditLogsForEntity,
  getAuditCountsByAction,
  getAuditCountsByCategory,
} from './read';
export type {
  AuditLogQueryParams,
  AuditLogReadResult,
  AuditLogRow,
} from './read';

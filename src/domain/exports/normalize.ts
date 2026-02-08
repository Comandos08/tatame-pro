/**
 * EXPORTS SAFE GOLD — Normalizers v1.0
 *
 * Pure functions for mapping runtime values to SAFE GOLD states.
 * No Date, Math, UUID, or IO dependencies.
 */

import type {
  SafeExportType,
  SafeExportViewState,
} from '@/types/export-state';

import {
  SAFE_EXPORT_TYPES,
  SAFE_EXPORT_VIEW_STATES,
  PRODUCTION_TO_SAFE_EXPORT_TYPE,
} from '@/types/export-state';

/**
 * Assert export type belongs to SAFE GOLD subset.
 * Falls back to 'CSV' for unknown values.
 */
export function assertExportType(v: string | null | undefined): SafeExportType {
  const raw = (v ?? '').trim();
  if (!raw) return 'CSV';

  const upper = raw.toUpperCase();
  
  // Direct match in SAFE subset
  if (SAFE_EXPORT_TYPES.includes(upper as SafeExportType)) {
    return upper as SafeExportType;
  }
  
  // Production mapping
  const mapped = PRODUCTION_TO_SAFE_EXPORT_TYPE[raw];
  if (mapped) return mapped;

  return 'CSV';
}

/**
 * Normalize export view state from raw input.
 * Pure function — NO side effects, NO Date, NO exceptions.
 * 
 * @param input - Raw state from API/UI
 * @returns Deterministic SafeExportViewState
 */
export function normalizeExportViewState(input: unknown): SafeExportViewState {
  if (typeof input !== 'string') return 'READY';
  
  const upper = input.toUpperCase().trim();
  
  if (SAFE_EXPORT_VIEW_STATES.includes(upper as SafeExportViewState)) {
    return upper as SafeExportViewState;
  }
  
  // Map common variations
  if (upper === 'LOADING' || upper === 'PROCESSING' || upper === 'PENDING') {
    return 'GENERATING';
  }
  
  if (upper === 'COMPLETE' || upper === 'SUCCESS' || upper === 'FINISHED') {
    return 'DONE';
  }
  
  if (upper === 'FAILED' || upper === 'FAILURE') {
    return 'ERROR';
  }

  return 'READY';
}

/**
 * Derive export view state from export status object.
 * Pure function for E2E instrumentation.
 */
export function deriveExportViewState(
  isGenerating: boolean,
  isComplete: boolean,
  hasError: boolean
): SafeExportViewState {
  if (hasError) return 'ERROR';
  if (isComplete) return 'DONE';
  if (isGenerating) return 'GENERATING';
  return 'READY';
}

/**
 * Check if current route is an export route.
 * Pure function for DOM instrumentation.
 */
export function isExportRoute(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return (
    lower.includes('/export') ||
    lower.includes('/download') ||
    lower.includes('/csv') ||
    lower.includes('/pdf')
  );
}

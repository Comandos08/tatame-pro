/**
 * ============================================================================
 * PI B1 — normalizeAsyncState
 * ============================================================================
 *
 * Canonical helper that converts React Query shape into AsyncState<T>.
 *
 * Mapping:
 *   isLoading === true          → LOADING
 *   isError === true            → ERROR
 *   data null/undefined/empty[] → EMPTY
 *   data valid                  → OK
 * ============================================================================
 */

import type { AsyncState } from '@/types/async';

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function normalizeAsyncState<T>(query: QueryLike<T>): AsyncState<T> {
  if (query.isLoading) {
    return { state: 'LOADING', data: null, error: null };
  }

  if (query.isError) {
    return {
      state: 'ERROR',
      data: null,
      error:
        query.error instanceof Error
          ? query.error
          : new Error(String(query.error ?? 'Unknown error')),
    };
  }

  const d = query.data;
  if (d === null || d === undefined || (Array.isArray(d) && d.length === 0)) {
    return { state: 'EMPTY', data: null, error: null };
  }

  return { state: 'OK', data: d, error: null };
}

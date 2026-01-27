/**
 * 🔐 HTTP Client — Network Hardening
 * 
 * Fetch wrapper with:
 * - Automatic timeout (default 15s)
 * - AbortController support
 * - Safe JSON parsing
 * - Standardized error handling
 * - Retry for transient errors (GET only)
 * 
 * @module src/lib/http/http
 */

import { networkLogger } from '@/lib/observability/logger';
import { reportNetworkError } from '@/lib/observability/error-report';

// Constants
const DEFAULT_TIMEOUT = 15000; // 15 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_BASE = 500; // 500ms base delay
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Standardized HTTP error with status and code.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * HTTP request options.
 */
export interface HttpOptions extends Omit<RequestInit, 'signal'> {
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Number of retries for transient errors (default: 0 for non-GET, 2 for GET) */
  retries?: number;
  /** External AbortSignal to combine with timeout */
  signal?: AbortSignal;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * HTTP response wrapper.
 */
export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  correlationId?: string;
}

/**
 * Create a timeout signal that aborts after specified ms.
 */
function createTimeoutSignal(timeout: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

/**
 * Combine multiple AbortSignals into one.
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  
  for (const signal of signals) {
    if (!signal) continue;
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort());
  }
  
  return controller.signal;
}

/**
 * Calculate retry delay with exponential backoff and jitter.
 */
function getRetryDelay(attempt: number): number {
  const exponential = RETRY_DELAY_BASE * Math.pow(2, attempt);
  const jitter = Math.random() * 200;
  return exponential + jitter;
}

/**
 * Check if error is retryable.
 */
function isRetryable(error: unknown, status?: number): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return false;
  }
  if (status && RETRYABLE_STATUS_CODES.includes(status)) {
    return true;
  }
  if (error instanceof TypeError) {
    // Network errors like "Failed to fetch"
    return true;
  }
  return false;
}

/**
 * Parse response body safely.
 */
async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      throw new HttpError(
        'Failed to parse JSON response',
        response.status,
        'PARSE_ERROR'
      );
    }
  }
  
  // For non-JSON, return text as unknown type
  const text = await response.text();
  return text as unknown as T;
}

/**
 * Perform HTTP request with hardening features.
 * 
 * @example
 * // Simple GET
 * const { data } = await http<User[]>('/api/users');
 * 
 * // POST with body
 * const { data } = await http<User>('/api/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' }),
 * });
 * 
 * // With timeout and retries
 * const { data } = await http<Data>('/api/slow', {
 *   timeout: 30000,
 *   retries: 3,
 * });
 */
export async function http<T>(
  url: string,
  options: HttpOptions = {}
): Promise<HttpResponse<T>> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = options.method && options.method !== 'GET' ? 0 : MAX_RETRIES,
    signal: externalSignal,
    correlationId = generateCorrelationId(),
    ...fetchOptions
  } = options;

  const method = fetchOptions.method || 'GET';
  let lastError: Error | null = null;
  let lastStatus: number | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Create combined signal with timeout
      const timeoutSignal = createTimeoutSignal(timeout);
      const combinedSignal = combineSignals(timeoutSignal, externalSignal);

      // Add default headers
      const headers = new Headers(fetchOptions.headers);
      if (!headers.has('Content-Type') && fetchOptions.body) {
        headers.set('Content-Type', 'application/json');
      }
      headers.set('X-Correlation-ID', correlationId);

      networkLogger.debug(`${method} ${url}`, {
        correlationId,
        attempt: attempt + 1,
      });

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: combinedSignal,
      });

      lastStatus = response.status;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new HttpError(
          errorBody || `HTTP ${response.status}`,
          response.status,
          `HTTP_${response.status}`,
          correlationId
        );
      }

      const data = await parseResponse<T>(response);

      return {
        data,
        status: response.status,
        headers: response.headers,
        correlationId,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if retryable
      if (attempt < retries && isRetryable(error, lastStatus)) {
        const delay = getRetryDelay(attempt);
        networkLogger.warn(`Retrying ${method} ${url} in ${delay}ms`, {
          correlationId,
          attempt: attempt + 1,
          error: lastError.message,
        });
        await sleep(delay);
        continue;
      }

      // Not retryable or max retries reached
      break;
    }
  }

  // Report and throw
  if (lastError) {
    reportNetworkError(lastError, url, {
      method,
      status: lastStatus,
      correlationId,
    });
    
    if (lastError instanceof HttpError) {
      throw lastError;
    }
    
    if (lastError.name === 'AbortError') {
      throw new HttpError('Request timeout', 0, 'TIMEOUT', correlationId);
    }
    
    throw new HttpError(
      lastError.message,
      0,
      'NETWORK_ERROR',
      correlationId
    );
  }

  // Should never reach here
  throw new HttpError('Unknown error', 0, 'UNKNOWN', correlationId);
}

/**
 * Sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a correlation ID for request tracing.
 */
function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convenience methods.
 */
export const httpGet = <T>(url: string, options?: HttpOptions) =>
  http<T>(url, { ...options, method: 'GET' });

export const httpPost = <T>(url: string, body: unknown, options?: HttpOptions) =>
  http<T>(url, { ...options, method: 'POST', body: JSON.stringify(body) });

export const httpPut = <T>(url: string, body: unknown, options?: HttpOptions) =>
  http<T>(url, { ...options, method: 'PUT', body: JSON.stringify(body) });

export const httpDelete = <T>(url: string, options?: HttpOptions) =>
  http<T>(url, { ...options, method: 'DELETE' });

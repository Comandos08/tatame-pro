/**
 * 🔐 Security Event Logger
 * 
 * Logs security-related events to the security_events table.
 * Used for rate limiting violations, anomaly detection, and audit trails.
 * 
 * IMPORTANT: Only call from Edge Functions with service role client.
 * 
 * A02: All console.* calls migrated to createBackendLogger.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createBackendLogger } from "./backend-logger.ts";

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityEventData {
  event_type: string;
  severity?: SecuritySeverity;
  user_id?: string | null;
  tenant_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  operation?: string | null;
  metadata?: Record<string, unknown>;
}

// Pre-defined security event types
export const SECURITY_EVENTS = {
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_WARNING: 'RATE_LIMIT_WARNING',
  
  // Authentication anomalies
  REPEATED_AUTH_FAILURES: 'REPEATED_AUTH_FAILURES',
  SUSPICIOUS_LOGIN_PATTERN: 'SUSPICIOUS_LOGIN_PATTERN',
  
  // Authorization violations
  CROSS_TENANT_ATTEMPT: 'CROSS_TENANT_ATTEMPT',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  IMPERSONATION_INVALID: 'IMPERSONATION_INVALID',
  
  // Anomaly detection
  BURST_ACTIVITY: 'BURST_ACTIVITY',
  UNUSUAL_PATTERN: 'UNUSUAL_PATTERN',
} as const;

/**
 * Log a security event to the database
 */
export async function logSecurityEvent(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  event: SecurityEventData
): Promise<void> {
  const log = createBackendLogger("security-logger", crypto.randomUUID());
  log.setTenant(event.tenant_id ?? null);
  log.setUser(event.user_id ?? null);

  try {
    const { error } = await supabaseAdmin
      .from('security_events')
      .insert({
        event_type: event.event_type,
        severity: event.severity || 'MEDIUM',
        user_id: event.user_id || null,
        tenant_id: event.tenant_id || null,
        ip_address: event.ip_address || null,
        user_agent: event.user_agent || null,
        operation: event.operation || null,
        metadata: event.metadata || {},
      });

    if (error) {
      log.error('Failed to log security event', error, { event_type: event.event_type });
    } else {
      log.info('Security event logged', { event_type: event.event_type, severity: event.severity || 'MEDIUM' });
    }
  } catch (err) {
    log.error('Unexpected error logging security event', err, { event_type: event.event_type });
  }
}

/**
 * Extract request context for security logging
 */
export function extractRequestContext(req: Request): {
  ip_address: string;
  user_agent: string;
} {
  return {
    ip_address: 
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown',
    user_agent: req.headers.get('user-agent') || 'unknown',
  };
}

/**
 * Check for anomalous patterns in recent events
 * Returns true if an anomaly is detected
 */
export async function detectAnomaly(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  options: {
    user_id?: string;
    ip_address?: string;
    event_type: string;
    threshold: number;
    windowMinutes: number;
  }
): Promise<{ detected: boolean; count: number }> {
  const log = createBackendLogger("security-logger", crypto.randomUUID());
  const windowStart = new Date(Date.now() - options.windowMinutes * 60 * 1000);
  
  let query = supabaseAdmin
    .from('security_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', options.event_type)
    .gte('created_at', windowStart.toISOString());

  if (options.user_id) {
    query = query.eq('user_id', options.user_id);
  }
  if (options.ip_address) {
    query = query.eq('ip_address', options.ip_address);
  }

  const { count, error } = await query;
  
  if (error) {
    log.error('Anomaly detection query failed', error, { event_type: options.event_type });
    return { detected: false, count: 0 };
  }

  const eventCount = count ?? 0;
  return {
    detected: eventCount >= options.threshold,
    count: eventCount,
  };
}

/**
 * Check for consecutive 403 responses indicating brute force attempt
 */
export async function detectRepeatedFailures(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string | null,
  ipAddress: string,
  threshold = 5,
  windowMinutes = 15
): Promise<boolean> {
  const result = await detectAnomaly(supabaseAdmin, {
    user_id: userId || undefined,
    ip_address: userId ? undefined : ipAddress, // Use IP if no user
    event_type: SECURITY_EVENTS.INSUFFICIENT_PERMISSIONS,
    threshold,
    windowMinutes,
  });

  return result.detected;
}

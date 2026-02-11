/**
 * 🔔 Observability Realtime Adapter — P4.2.A
 * 
 * Subscribes to real-time observability events from Supabase.
 * Uses idempotency cache to prevent duplicates.
 * Returns unsubscribe callback for cleanup.
 * 
 * SAFE GOLD: Fallback polling continues if realtime fails.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Alert, EventSeverity } from '@/types/observability';
import { realtimeLogger } from './logger';

// LRU-style cache for seen event IDs (1h TTL)
const SEEN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const seenEventsCache = new Map<string, number>();

/**
 * Cleanup old entries from the seen cache periodically
 */
function cleanupSeenCache(): void {
  const now = Date.now();
  for (const [id, timestamp] of seenEventsCache) {
    if (now - timestamp > SEEN_CACHE_TTL_MS) {
      seenEventsCache.delete(id);
    }
  }
}

/**
 * Check if event was already seen (idempotency)
 */
function wasEventSeen(id: string): boolean {
  return seenEventsCache.has(id);
}

/**
 * Mark event as seen
 */
function markEventSeen(id: string): void {
  seenEventsCache.set(id, Date.now());
}

/**
 * Determine severity from audit log event
 */
function determineSeverity(eventType: string, metadata: Record<string, unknown>): EventSeverity {
  // Critical events
  if (eventType.includes('PAYMENT_FAILED') || eventType === 'TENANT_BLOCKED') {
    return 'CRITICAL';
  }
  // High severity
  if (eventType.includes('_FAILED') || eventType.includes('_ERROR')) {
    return 'HIGH';
  }
  // Medium severity
  if (eventType.includes('_WARNING') || eventType.includes('_DELAYED')) {
    return 'MEDIUM';
  }
  // Check metadata status
  if (metadata?.status === 'FAILED') {
    return 'HIGH';
  }
  return 'LOW';
}

/**
 * Transform raw audit_logs event to Alert format (pure function)
 */
function toAlert(event: Record<string, unknown>): Alert | null {
  try {
    const id = event.id as string;
    const eventType = event.event_type as string;
    void (event.category as string); // kept for future use
    const metadata = (event.metadata as Record<string, unknown>) || {};
    const createdAt = event.created_at as string;
    const tenantId = event.tenant_id as string | null;

    if (!id || !eventType) {
      return null;
    }

    const severity = determineSeverity(eventType, metadata);
    
    // Build alert
    return {
      id,
      type: mapEventTypeToAlertType(eventType),
      severity,
      title: formatAlertTitle(eventType),
      description: formatAlertDescription(eventType, metadata),
      timestamp: createdAt,
      dismissed: false,
      tenant_id: tenantId ?? undefined,
    };
  } catch (error) {
    realtimeLogger.warn('Transform failed', { action: 'toAlert' });
    return null;
  }
}

/**
 * Map event type to alert type
 */
function mapEventTypeToAlertType(eventType: string): Alert['type'] {
  if (eventType.includes('JOB_')) return 'JOB_FAILURE';
  if (eventType.includes('BILLING_') || eventType.includes('PAYMENT_')) return 'BILLING_ISSUE';
  if (eventType.includes('SECURITY_') || eventType.includes('IMPERSONATION_')) return 'SECURITY_BREACH';
  if (eventType.includes('MEMBERSHIP_')) return 'MEMBERSHIP_SPIKE';
  return 'JOB_FAILURE';
}

/**
 * Format alert title from event type
 */
function formatAlertTitle(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format alert description from event type and metadata
 */
function formatAlertDescription(eventType: string, metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  
  if (metadata.error) {
    parts.push(String(metadata.error));
  }
  if (metadata.reason) {
    parts.push(String(metadata.reason));
  }
  if (metadata.message) {
    parts.push(String(metadata.message));
  }
  
  return parts.join(' - ') || eventType;
}

// Severity filter (HIGH/CRITICAL only for realtime alerts)
const REALTIME_SEVERITIES: EventSeverity[] = ['HIGH', 'CRITICAL'];

export interface RealtimeSubscription {
  unsubscribe: () => void;
  isConnected: () => boolean;
}

export interface RealtimeOptions {
  onEvent: (alert: Alert) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Subscribe to observability realtime events
 * 
 * @param options - Callbacks for events, connection changes, and errors
 * @returns Subscription object with unsubscribe() and isConnected()
 */
export function subscribeObservabilityRealtime(
  options: RealtimeOptions
): RealtimeSubscription {
  let isConnected = false;
  
  const channel = supabase
    .channel('observability-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'audit_logs',
      },
      (payload) => {
        try {
          const event = payload.new as Record<string, unknown>;
          const eventId = event.id as string;
          
          // Idempotency check
          if (wasEventSeen(eventId)) {
            return;
          }
          markEventSeen(eventId);
          
          // Transform and filter
          const alert = toAlert(event);
          if (alert && REALTIME_SEVERITIES.includes(alert.severity)) {
            options.onEvent(alert);
          }
        } catch (error) {
          realtimeLogger.error('Event processing error', { action: 'onPayload' }, error instanceof Error ? error : new Error(String(error)));
          options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    )
    .subscribe((status, err) => {
      const connected = status === 'SUBSCRIBED';
      if (connected !== isConnected) {
        isConnected = connected;
        options.onConnectionChange?.(connected);
      }
      
      if (err) {
        realtimeLogger.error('Subscription error', { action: 'subscribe' }, err);
        options.onError?.(err);
      }
    });
  
  // Cleanup cache periodically (every minute)
  const cacheCleanupInterval = setInterval(cleanupSeenCache, 60000);
  
  return {
    unsubscribe: () => {
      clearInterval(cacheCleanupInterval);
      supabase.removeChannel(channel);
    },
    isConnected: () => isConnected,
  };
}

/**
 * Mark an event ID as seen (for coordination with polling)
 */
export function markAlertAsSeen(id: string): void {
  markEventSeen(id);
}

/**
 * Check if an alert was already seen via realtime
 */
export function wasAlertSeen(id: string): boolean {
  return wasEventSeen(id);
}

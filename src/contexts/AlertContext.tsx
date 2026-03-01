/**
 * 🔔 AlertContext — P4.1.D / P4.2.B
 * 
 * Manages platform alerts with realtime support.
 * - Polling fallback (5 min)
 * - Realtime subscription (instant)
 * - Dismissed state persistence (localStorage)
 * - Idempotent merge logic
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { logger } from '@/lib/logger';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, EventSeverity } from '@/types/observability';
import { subscribeObservabilityRealtime, markAlertAsSeen } from '@/lib/observability/realtime';
import { useCurrentUser } from '@/contexts/AuthContext';

const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REALTIME_ALERTS = 50;

export interface AlertContextValue {
  alerts: Alert[];
  activeCount: number;
  criticalCount: number;
  isLoading: boolean;
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;
  clearDismissed: () => void;
  
  // P4.2: Realtime state
  isRealtimeConnected: boolean;
  lastRealtimeEventAt: string | null;
  newEventsCount: number;
  markNewEventsAsSeen: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

/**
 * Hook to access alert context (throws if not in provider)
 */
export function useAlerts(): AlertContextValue {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
}

/**
 * Optional hook for components that may be outside AlertProvider
 */
export function useAlertsOptional(): AlertContextValue | null {
  return useContext(AlertContext);
}

/**
 * Fetch dismissed alert IDs from DB (scoped by user)
 */
async function fetchDismissedIds(userId: string): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('observability_dismissed_alerts')
      .select('alert_id')
      .eq('user_id', userId);

    return new Set((data || []).map(d => d.alert_id));
  } catch {
    return new Set();
  }
}

/**
 * Persist a dismissed alert to DB (fire-and-forget)
 */
async function persistDismissToDb(alertId: string, userId: string): Promise<void> {
  try {
    await supabase
      .from('observability_dismissed_alerts')
      .upsert(
        { alert_id: alertId, user_id: userId },
        { onConflict: 'alert_id,user_id', ignoreDuplicates: true }
      );
  } catch {
    // Silent fail — degrade gracefully
  }
}

/**
 * Clear all dismissed alerts for a user in DB (fire-and-forget)
 */
async function clearDismissedInDb(userId: string): Promise<void> {
  try {
    await supabase
      .from('observability_dismissed_alerts')
      .delete()
      .eq('user_id', userId);
  } catch {
    // Silent fail
  }
}

function getAlertType(eventType: string): Alert['type'] {
  if (eventType.includes('PAYMENT') || eventType.includes('BILLING')) return 'BILLING_ISSUE';
  if (eventType.startsWith('JOB_') && eventType.includes('FAIL')) return 'JOB_FAILURE';
  if (eventType.includes('SECURITY') || eventType.includes('IMPERSONATION')) return 'SECURITY_BREACH';
  if (eventType.includes('MEMBERSHIP')) return 'MEMBERSHIP_SPIKE';
  return 'JOB_FAILURE';
}

function getAlertTitle(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getAlertDescription(_eventType: string, severity: string, metadata?: Record<string, unknown>): string {
  const parts: string[] = [];
  if (metadata?.error) parts.push(String(metadata.error));
  if (metadata?.reason) parts.push(String(metadata.reason));
  if (metadata?.message) parts.push(String(metadata.message));
  
  if (parts.length > 0) return parts.join(' - ');
  
  if (severity === 'CRITICAL') return 'Immediate action required';
  if (severity === 'HIGH') return 'Review recommended';
  return 'Monitor for changes';
}

/**
 * Transform raw database event to Alert
 */
function toAlertFromDb(event: Record<string, unknown>, dismissedIds: Set<string>): Alert {
  const id = event.id as string;
  const eventType = event.event_type as string;
  const severity = (event.severity as EventSeverity) || 'LOW';
  const metadata = (event.metadata as Record<string, unknown>) || {};
  const createdAt = event.created_at as string;
  const tenantId = event.tenant_id as string | null;
  
  return {
    id,
    type: getAlertType(eventType),
    severity,
    title: getAlertTitle(eventType),
    description: getAlertDescription(eventType, severity, metadata),
    timestamp: createdAt,
    dismissed: dismissedIds.has(id),
    tenant_id: tenantId ?? undefined,
  };
}

/**
 * Merge polling and realtime alerts, respecting dismissed state
 */
function mergeAlerts(
  pollingAlerts: Alert[],
  realtimeAlerts: Alert[],
  dismissedIds: Set<string>
): Alert[] {
  const merged = new Map<string, Alert>();
  
  // Add polling alerts first
  for (const alert of pollingAlerts) {
    merged.set(alert.id, { ...alert, dismissed: dismissedIds.has(alert.id) });
  }
  
  // Add realtime alerts (may add new ones)
  for (const alert of realtimeAlerts) {
    if (!merged.has(alert.id)) {
      merged.set(alert.id, { ...alert, dismissed: dismissedIds.has(alert.id) });
    }
  }
  
  // Sort by severity then timestamp
  return Array.from(merged.values())
    .sort((a, b) => {
      const severityOrder: Record<EventSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const diff = (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
      if (diff !== 0) return diff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useCurrentUser();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [realtimeAlerts, setRealtimeAlerts] = useState<Alert[]>([]);
  
  // P4.2: Realtime state
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(null);
  const [newEventsCount, setNewEventsCount] = useState(0);
  
  // Track seen alert IDs to prevent counting same event twice
  const seenNewEventIds = useRef<Set<string>>(new Set());
  
  // Load dismissed alerts from DB when user is available
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchDismissedIds(currentUser.id).then(ids => {
      setDismissedIds(ids);
    });
  }, [currentUser?.id]);
  
  // Polling query for critical events
  const { data: pollingAlerts = [], isLoading, refetch } = useQuery({
    queryKey: ['alerts-context'],
    queryFn: async (): Promise<Alert[]> => {
      const { data, error } = await supabase
        .from('observability_critical_events')
        .select('id, source, event_type, category, tenant_id, created_at, severity, metadata')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        logger.error('[AlertContext] Query error:', error.message);
        return [];
      }
      
      return (data || []).map(event => toAlertFromDb(event as Record<string, unknown>, dismissedIds));
    },
    refetchInterval: POLLING_INTERVAL_MS,
    staleTime: POLLING_INTERVAL_MS / 2,
  });
  
  // Realtime subscription
  useEffect(() => {
    const subscription = subscribeObservabilityRealtime({
      onEvent: (alert) => {
        // Skip if already dismissed
        if (dismissedIds.has(alert.id)) {
          return;
        }
        
        // Add to realtime alerts
        setRealtimeAlerts(prev => {
          // Avoid duplicates
          if (prev.some(a => a.id === alert.id)) return prev;
          return [alert, ...prev].slice(0, MAX_REALTIME_ALERTS);
        });
        
        // Increment new events count (only once per event)
        if (!seenNewEventIds.current.has(alert.id)) {
          seenNewEventIds.current.add(alert.id);
          setNewEventsCount(prev => prev + 1);
        }
        
        setLastRealtimeEventAt(new Date().toISOString());
        
        // Mark as seen in realtime cache
        markAlertAsSeen(alert.id);
      },
      onConnectionChange: (connected) => {
        setIsRealtimeConnected(connected);
      },
      onError: (error) => {
        logger.error('[AlertContext] Realtime error:', error);
      },
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [dismissedIds]);
  
  // Merge polling + realtime alerts
  const alerts = useMemo(() => {
    return mergeAlerts(pollingAlerts, realtimeAlerts, dismissedIds);
  }, [pollingAlerts, realtimeAlerts, dismissedIds]);
  
  // Counts
  const activeCount = useMemo(() => 
    alerts.filter(a => !a.dismissed).length, 
    [alerts]
  );
  
  const criticalCount = useMemo(() => 
    alerts.filter(a => !a.dismissed && (a.severity === 'CRITICAL' || a.severity === 'HIGH')).length,
    [alerts]
  );
  
  // Actions
  const dismissAlert = useCallback((id: string) => {
    if (!currentUser?.id) return;
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    persistDismissToDb(id, currentUser.id); // fire-and-forget
  }, [currentUser?.id]);
  
  const clearDismissed = useCallback(() => {
    if (!currentUser?.id) return;
    setDismissedIds(new Set());
    clearDismissedInDb(currentUser.id); // fire-and-forget
  }, [currentUser?.id]);
  
  const refreshAlerts = useCallback(() => {
    refetch();
    // Also clear realtime buffer on manual refresh
    setRealtimeAlerts([]);
    seenNewEventIds.current.clear();
    setNewEventsCount(0);
  }, [refetch]);
  
  const markNewEventsAsSeen = useCallback(() => {
    setNewEventsCount(0);
  }, []);
  
  const value: AlertContextValue = {
    alerts,
    activeCount,
    criticalCount,
    isLoading,
    dismissAlert,
    refreshAlerts,
    clearDismissed,
    isRealtimeConnected,
    lastRealtimeEventAt,
    newEventsCount,
    markNewEventsAsSeen,
  };
  
  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
}

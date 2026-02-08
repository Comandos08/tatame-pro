/**
 * 🔔 AlertContext — P4.1.D
 * 
 * Context for managing platform alerts derived from critical events.
 * Prepares infrastructure for future realtime notifications.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, EventSeverity } from '@/types/observability';

const DISMISSED_ALERTS_KEY = 'tatame_dismissed_alerts';

interface AlertContextValue {
  alerts: Alert[];
  activeCount: number;
  criticalCount: number;
  isLoading: boolean;
  dismissAlert: (id: string) => void;
  refreshAlerts: () => void;
  clearDismissed: () => void;
}

const AlertContext = createContext<AlertContextValue | undefined>(undefined);

function getAlertType(eventType: string): Alert['type'] {
  if (eventType.includes('PAYMENT') || eventType.includes('BILLING')) return 'BILLING_ISSUE';
  if (eventType.startsWith('JOB_') && eventType.includes('FAIL')) return 'JOB_FAILURE';
  if (eventType.includes('SECURITY') || eventType.includes('IMPERSONATION')) return 'SECURITY_BREACH';
  if (eventType.includes('MEMBERSHIP')) return 'MEMBERSHIP_SPIKE';
  return 'SYSTEM_ERROR';
}

function getAlertTitle(eventType: string): string {
  const formatted = eventType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
  return formatted;
}

function getAlertDescription(eventType: string, severity: string): string {
  if (severity === 'CRITICAL') {
    return 'Immediate action required';
  }
  if (severity === 'HIGH') {
    return 'Review recommended';
  }
  return 'Monitor for changes';
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist dismissed alerts to localStorage
  useEffect(() => {
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...dismissedIds]));
  }, [dismissedIds]);

  // Fetch critical events and transform to alerts
  const { data: rawAlerts = [], isLoading, refetch } = useQuery({
    queryKey: ['alerts-context'],
    queryFn: async (): Promise<Alert[]> => {
      const { data, error } = await supabase
        .from('observability_critical_events')
        .select('id, source, event_type, category, tenant_id, created_at, severity, metadata')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('[AlertContext] Query error:', error.message);
        return [];
      }

      // Transform to Alert format
      return (data || []).map((event): Alert => ({
        id: event.id,
        type: getAlertType(event.event_type),
        severity: (event.severity as EventSeverity) || 'MEDIUM',
        title: getAlertTitle(event.event_type),
        description: getAlertDescription(event.event_type, event.severity),
        timestamp: event.created_at,
        dismissed: false,
        tenant_id: event.tenant_id || undefined,
        event_type: event.event_type,
        metadata: event.metadata as Record<string, unknown>,
      }));
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Apply dismissed filter
  const alerts = rawAlerts.map(alert => ({
    ...alert,
    dismissed: dismissedIds.has(alert.id),
  }));

  const activeAlerts = alerts.filter(a => !a.dismissed);
  const activeCount = activeAlerts.length;
  const criticalCount = activeAlerts.filter(a => 
    a.severity === 'CRITICAL' || a.severity === 'HIGH'
  ).length;

  const dismissAlert = useCallback((id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  }, []);

  const refreshAlerts = useCallback(() => {
    refetch();
  }, [refetch]);

  const clearDismissed = useCallback(() => {
    setDismissedIds(new Set());
  }, []);

  return (
    <AlertContext.Provider value={{
      alerts,
      activeCount,
      criticalCount,
      isLoading,
      dismissAlert,
      refreshAlerts,
      clearDismissed,
    }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within AlertProvider');
  }
  return context;
}

// Optional hook for components that might be outside AlertProvider
export function useAlertsOptional() {
  return useContext(AlertContext);
}

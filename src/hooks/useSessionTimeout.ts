/**
 * Session Timeout Hook (P1-15)
 *
 * Logs out the user after a configurable period of inactivity.
 * Tracks mouse, keyboard, scroll, and touch events as activity.
 *
 * Default: 30 minutes of inactivity.
 *
 * Usage:
 *   useSessionTimeout({ timeoutMs: 30 * 60 * 1000 });
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
const WARNING_BEFORE_MS = 2 * 60 * 1000; // Warn 2 minutes before logout

interface SessionTimeoutOptions {
  /** Inactivity timeout in milliseconds (default: 30 min) */
  timeoutMs?: number;
  /** Called when warning period starts (2 min before logout) */
  onWarning?: () => void;
  /** Called when session expires */
  onTimeout?: () => void;
  /** Disable timeout (e.g. for superadmin) */
  disabled?: boolean;
}

export function useSessionTimeout(options: SessionTimeoutOptions = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onWarning,
    onTimeout,
    disabled = false,
  } = options;

  const { signOut, session } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const lastActivityRef = useRef(Date.now());

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Warning timer
    if (onWarning && timeoutMs > WARNING_BEFORE_MS) {
      warningRef.current = setTimeout(() => {
        onWarning();
      }, timeoutMs - WARNING_BEFORE_MS);
    }

    // Logout timer
    timeoutRef.current = setTimeout(() => {
      if (onTimeout) onTimeout();
      signOut();
    }, timeoutMs);
  }, [timeoutMs, onWarning, onTimeout, signOut]);

  useEffect(() => {
    if (disabled || !session) return;

    // Set initial timers
    resetTimers();

    // Listen for user activity
    const handleActivity = () => {
      // Throttle: only reset if at least 30s since last reset
      if (Date.now() - lastActivityRef.current > 30_000) {
        resetTimers();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Reset on tab visibility change (user returns to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetTimers();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [disabled, session, resetTimers]);
}

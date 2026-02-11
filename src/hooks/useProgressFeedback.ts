/**
 * PI U11 — useProgressFeedback (Thin Aggregator Hook)
 *
 * SRP CONTRACT:
 * - This hook DOES NOT decide rules
 * - All derivation lives in lib/ux/progressFeedback.ts
 * - This hook manages sessionStorage-based dismiss state
 */

import { useState, useMemo, useCallback } from 'react';
import { deriveProgressFeedback, type ProgressFeedback, type ProgressEvent } from '@/lib/ux/progressFeedback';
import { failSafeAccess } from '@/lib/safety/failSafe';
import { useAccessContract } from '@/hooks/useAccessContract';
import { useTenant } from '@/contexts/TenantContext';

const DISMISSED_KEY = 'u11_dismissed_events';

function getDismissedEvents(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistDismiss(event: string): void {
  try {
    const dismissed = getDismissedEvents();
    dismissed.add(event);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
  } catch {
    // sessionStorage unavailable — fail silently
  }
}

export function useProgressFeedback(lastEvent?: ProgressEvent | null): {
  feedback: ProgressFeedback | null;
  dismiss: () => void;
} {
  const { tenant } = useTenant();
  const { isLoading, isError } = useAccessContract(tenant?.id);
  const canAccess = failSafeAccess(!isError && !isLoading, isLoading, isError);

  const [dismissedEvents, setDismissedEvents] = useState(() => getDismissedEvents());

  const feedback = useMemo(() => {
    if (lastEvent && dismissedEvents.has(lastEvent)) return null;

    return deriveProgressFeedback({
      lastEvent: lastEvent ?? null,
      canAccess,
      isLoading,
      isError,
    });
  }, [lastEvent, canAccess, isLoading, isError, dismissedEvents]);

  const dismiss = useCallback(() => {
    if (feedback?.event) {
      persistDismiss(feedback.event);
      setDismissedEvents((prev) => new Set([...prev, feedback.event]));
    }
  }, [feedback]);

  return { feedback, dismiss };
}

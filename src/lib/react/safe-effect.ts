/**
 * 🔐 Safe Effect Utilities — React Hardening
 * 
 * Prevents common React bugs:
 * - setState after unmount
 * - Stale closures
 * - Double-run in StrictMode
 * - Missing AbortController cleanup
 * 
 * @module src/lib/react/safe-effect
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook that returns whether the component is currently mounted.
 * Use to prevent setState after unmount.
 * 
 * @example
 * const isMounted = useIsMounted();
 * useEffect(() => {
 *   fetchData().then(data => {
 *     if (isMounted()) setData(data);
 *   });
 * }, []);
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

/**
 * Hook to prevent effect from running twice in StrictMode.
 * Returns a ref that's true only on first run per dependency change.
 * 
 * @example
 * const hasRun = useOnceGuard([userId]);
 * useEffect(() => {
 *   if (hasRun.current) return;
 *   hasRun.current = true;
 *   // one-time initialization
 * }, [userId]);
 */
export function useOnceGuard(deps: unknown[]): React.MutableRefObject<boolean> {
  const hasRunRef = useRef(false);
  const depsRef = useRef<unknown[]>(deps);

  // Reset guard when deps change
  if (!shallowEqual(depsRef.current, deps)) {
    depsRef.current = deps;
    hasRunRef.current = false;
  }

  return hasRunRef;
}

/**
 * Hook that provides an AbortController that automatically aborts on unmount.
 * Use for fetch requests and other cancellable operations.
 * 
 * @example
 * const { signal, abort } = useAbortController();
 * useEffect(() => {
 *   fetch('/api/data', { signal }).then(...)
 * }, [signal]);
 */
export function useAbortController() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    controllerRef.current = new AbortController();
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const getSignal = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new AbortController();
    }
    return controllerRef.current.signal;
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
  }, []);

  return { signal: getSignal(), getSignal, abort };
}

/**
 * Safe setState wrapper that only updates if component is mounted.
 * 
 * @example
 * const [data, setData] = useState(null);
 * const safeSetData = useSafeState(setData);
 * useEffect(() => {
 *   fetchData().then(safeSetData);
 * }, [safeSetData]);
 */
export function useSafeState<T>(
  setState: React.Dispatch<React.SetStateAction<T>>
): React.Dispatch<React.SetStateAction<T>> {
  const isMounted = useIsMounted();

  return useCallback(
    (value: React.SetStateAction<T>) => {
      if (isMounted()) {
        setState(value);
      }
    },
    [setState, isMounted]
  );
}

/**
 * Hook for deterministic loading state management.
 * Handles multiple concurrent requests without race conditions.
 * 
 * @example
 * const { isLoading, startLoading, stopLoading, reset } = useLoadingCounter();
 * 
 * async function fetchAll() {
 *   startLoading();
 *   try {
 *     await Promise.all([fetch1(), fetch2()]);
 *   } finally {
 *     stopLoading();
 *   }
 * }
 */
export function useLoadingCounter() {
  const countRef = useRef(0);
  const isMounted = useIsMounted();
  const forceUpdate = useForceUpdate();

  const startLoading = useCallback(() => {
    countRef.current += 1;
    if (isMounted()) forceUpdate();
  }, [isMounted, forceUpdate]);

  const stopLoading = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (isMounted()) forceUpdate();
  }, [isMounted, forceUpdate]);

  const reset = useCallback(() => {
    countRef.current = 0;
    if (isMounted()) forceUpdate();
  }, [isMounted, forceUpdate]);

  return {
    isLoading: countRef.current > 0,
    loadingCount: countRef.current,
    startLoading,
    stopLoading,
    reset,
  };
}

/**
 * Force re-render hook (use sparingly).
 */
function useForceUpdate() {
  const [, setTick] = useStateRef(0);
  return useCallback(() => setTick((t) => t + 1), [setTick]);
}

/**
 * useState with ref to avoid stale closures.
 */
function useStateRef<T>(initial: T) {
  const ref = useRef(initial);
  const [state, setState] = [ref.current, (value: T | ((prev: T) => T)) => {
    if (typeof value === 'function') {
      ref.current = (value as (prev: T) => T)(ref.current);
    } else {
      ref.current = value;
    }
  }];
  return [state, setState] as const;
}

/**
 * Shallow equality check for arrays.
 */
function shallowEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Type-safe async effect with automatic cleanup.
 * Handles AbortController, loading state, and error handling.
 * 
 * @example
 * useAsyncEffect(
 *   async (signal) => {
 *     const data = await fetch('/api', { signal });
 *     setData(data);
 *   },
 *   [dependency],
 *   { onError: (e) => console.error(e) }
 * );
 */
export function useAsyncEffect(
  effect: (signal: AbortSignal) => Promise<void>,
  deps: React.DependencyList,
  options?: {
    onError?: (error: Error) => void;
    onAbort?: () => void;
  }
) {
  const isMounted = useIsMounted();

  useEffect(() => {
    const controller = new AbortController();

    effect(controller.signal).catch((error) => {
      if (error.name === 'AbortError') {
        options?.onAbort?.();
        return;
      }
      if (isMounted()) {
        options?.onError?.(error);
      }
    });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

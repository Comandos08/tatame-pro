import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Subscribe to the mobile-width media query. Returns an unsubscribe fn so
 * useSyncExternalStore can wire up and tear down the listener deterministically.
 */
function subscribeMobile(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getMobileSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getMobileServerSnapshot(): boolean {
  return false;
}

/**
 * Read the current mobile-viewport state. Backed by useSyncExternalStore so
 * render never reads `window.innerWidth` directly, and React concurrent
 * features stay consistent across tearing boundaries.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribeMobile,
    getMobileSnapshot,
    getMobileServerSnapshot,
  );
}

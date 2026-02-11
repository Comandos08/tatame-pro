/**
 * U03.1 — Route Focus Reset (SAFE GOLD)
 *
 * Resets focus to <main> on route change so screen readers
 * announce the new page and keyboard users start from the top.
 * No mutations, no side effects beyond focus management.
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useRouteFocusReset() {
  const location = useLocation();

  useEffect(() => {
    const main = document.querySelector('main');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
    }
  }, [location.pathname]);
}

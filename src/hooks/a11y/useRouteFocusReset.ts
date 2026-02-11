import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SAFE GOLD — Route Focus Reset (WCAG compliant)
 *
 * Moves focus to main landmark on route change
 * without leaving permanent tabIndex pollution.
 */
export function useRouteFocusReset() {
  const location = useLocation();

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;

    // Make temporarily focusable
    main.setAttribute('tabIndex', '-1');

    // Move focus
    main.focus();

    // Remove tabIndex after blur (prevents permanent focus trap)
    const cleanup = () => main.removeAttribute('tabIndex');
    main.addEventListener('blur', cleanup, { once: true });

    return () => {
      main.removeEventListener('blur', cleanup);
    };
  }, [location.pathname]);
}

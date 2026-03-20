import { QueryClient } from '@tanstack/react-query';

const APP_STORAGE_PREFIX = 'tatame_';

/**
 * hardResetAuthClientState — Clears all app-scoped client caches.
 * 
 * Use after impersonation start/end to force deterministic state reload.
 * Does NOT touch auth session (Supabase manages that).
 */
export function hardResetAuthClientState(queryClient?: QueryClient): void {
  // 1) Clear sessionStorage keys
  sessionStorage.removeItem('tatame_impersonation_session');
  sessionStorage.removeItem('tatame_identity_cache');

  // 2) Clear localStorage app keys only
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(APP_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // 3) Invalidate react-query caches if client provided
  if (queryClient) {
    const keysToInvalidate = [
      'identity',
      'tenant',
      'user-roles',
      'memberships',
      'tenant-admins',
      'current-user',
      // P1-FIX: also clear tenant-scoped caches so gates and sidebar
      // reflect the correct state immediately after impersonation start/end.
      'tenant-flags-contract',
      'onboarding-status',
      'access-contract',
    ];
    keysToInvalidate.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  }
}

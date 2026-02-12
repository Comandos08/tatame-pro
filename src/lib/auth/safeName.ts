/**
 * safeName — Deterministic display name resolver.
 * 
 * Treats null, undefined, empty string, and whitespace-only as invalid.
 * Returns trimmed name or null (caller decides fallback).
 */
export function safeName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * safeDisplayName — Returns a display-ready name, falling back to email prefix.
 */
export function safeDisplayName(name?: string | null, email?: string | null): string {
  const resolved = safeName(name);
  if (resolved) return resolved;
  if (email) return email.split('@')[0];
  return '—';
}

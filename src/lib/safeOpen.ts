/**
 * safeOpen — thin wrapper around window.open that always includes
 * `noopener,noreferrer` so the opened page cannot use `window.opener` to
 * navigate us or leak the Referer header.
 *
 * Equivalent to `<a target="_blank" rel="noopener noreferrer">`.
 *
 * Returns the Window reference or null (same contract as window.open). Do not
 * rely on the returned Window being usable — `noopener` nulls it out in
 * modern browsers, which is the intended behavior.
 */
export function safeOpen(url: string | URL | null | undefined): Window | null {
  if (!url) return null;
  return window.open(url, "_blank", "noopener,noreferrer");
}

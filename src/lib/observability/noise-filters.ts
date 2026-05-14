/**
 * Browser/extension noise filters for the observability layer.
 *
 * These are errors that:
 *   - originate from browser extensions injecting content scripts,
 *   - are known-benign React/Recharts reconciliation warnings, or
 *   - are unactionable transient races during navigation,
 *
 * but show up in the user's console (and, when SENTRY_DSN is set, in
 * Sentry) as if they were product bugs. They flood the issue list and
 * make real regressions harder to spot.
 *
 * We filter EXTREMELY conservatively. The cost of a false positive
 * (silencing a real bug) is much higher than the cost of a false
 * negative (a few extra noise events in Sentry). Every pattern below
 * has a documented origin so a future engineer can validate it before
 * removing or extending the list.
 */

const NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  // Chrome extension content scripts register chrome.runtime.onMessage
  // listeners that return `true` to signal "an async response is coming",
  // then the extension's popup/background closes before the response is
  // sent. The runtime fires the rejection on the page's window, attributed
  // to the page URL — even though the listener lives in the extension's
  // own frame. Known sources: Google Translate, Grammarly, LastPass,
  // 1Password, Honey, every form-detecting extension. Cannot be fixed in
  // page code.
  /A listener indicated an asynchronous response by returning true, but the message channel closed/i,

  // Recharts' ResponsiveContainer logs this warning during the brief
  // window between mount and ResizeObserver firing the first measurement,
  // when its parent reports clientWidth/clientHeight as -1. The
  // MeasuredChart wrapper added in PR #163 suppresses it for dashboard
  // charts, but transient -1 captures still leak through during fast
  // navigation. The chart renders correctly the moment dimensions are
  // available — the warning is cosmetic.
  /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/i,

  // React 19 reconciliation: an async update (typically a setState in a
  // useEffect cleanup or a delayed network response) tries to commit on
  // a DOM node that already unmounted during navigation. The DOM
  // operation is a no-op; the warning is informational. We treat it as
  // noise because it is not actionable from the user's perspective and
  // does not affect any visible state.
  /Node cannot be found in the current page/i,
];

/**
 * True when the error's message matches one of the documented noise
 * patterns. False for any other error — including unknown errors, which
 * must surface to error tracking.
 */
export function isKnownNoiseError(err: unknown): boolean {
  const message = extractMessage(err);
  if (!message) return false;
  return NOISE_PATTERNS.some((pattern) => pattern.test(message));
}

function extractMessage(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || err.toString();
  if (typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    return typeof m === "string" ? m : String(m);
  }
  return String(err);
}

/**
 * Attach a window-level listener that silences known-noise errors at the
 * console level (preventDefault on the unhandledrejection event stops the
 * "Uncaught (in promise)" log line). Real errors are left untouched so
 * the ErrorBoundary and Sentry both still see them.
 *
 * Safe to call multiple times — the listener is idempotent because the
 * predicate has no side effects.
 */
export function installNoiseSilencer(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (event) => {
    if (isKnownNoiseError(event.reason)) {
      event.preventDefault();
    }
  });
}

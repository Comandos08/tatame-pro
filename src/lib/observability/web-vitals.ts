/**
 * Web Vitals Tracking (P1-20)
 *
 * Tracks Core Web Vitals (LCP, FID/INP, CLS) using the browser
 * PerformanceObserver API. No external dependency required.
 *
 * Metrics are reported to the observability logger and optionally
 * to Sentry (if configured) via custom performance events.
 *
 * Usage:
 *   import { initWebVitals } from '@/lib/observability/web-vitals';
 *   initWebVitals(); // Call once in main.tsx
 */

import { logger } from './logger';

interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

// Thresholds per Google Web Vitals standards
const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
} as const;

function rate(name: string, value: number): WebVitalMetric['rating'] {
  const t = THRESHOLDS[name as keyof typeof THRESHOLDS];
  if (!t) return 'good';
  if (value <= t.good) return 'good';
  if (value >= t.poor) return 'poor';
  return 'needs-improvement';
}

function reportMetric(metric: WebVitalMetric): void {
  const level = metric.rating === 'poor' ? 'warn' : 'info';
  logger[level](`[WebVital] ${metric.name}: ${metric.value.toFixed(1)}ms (${metric.rating})`, {
    component: 'web-vitals',
    action: metric.name,
  });

  // Report to Sentry if available
  if (typeof window !== 'undefined' && (window as Record<string, unknown>)['Sentry']) {
    const Sentry = (window as Record<string, unknown>)['Sentry'] as {
      addBreadcrumb?: (b: Record<string, unknown>) => void;
    };
    Sentry.addBreadcrumb?.({
      category: 'web-vital',
      message: `${metric.name}: ${metric.value.toFixed(1)}`,
      level: metric.rating === 'poor' ? 'warning' : 'info',
      data: { value: metric.value, rating: metric.rating },
    });
  }
}

function observePaint(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          reportMetric({
            name: 'FCP',
            value: entry.startTime,
            rating: rate('FCP', entry.startTime),
          });
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // PerformanceObserver not supported
  }
}

function observeLCP(): void {
  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        reportMetric({
          name: 'LCP',
          value: last.startTime,
          rating: rate('LCP', last.startTime),
        });
      }
    });
    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Not supported
  }
}

function observeCLS(): void {
  try {
    let clsValue = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          clsValue += layoutShift.value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });

    // Report CLS on page hide
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportMetric({
          name: 'CLS',
          value: clsValue,
          rating: rate('CLS', clsValue),
        });
      }
    }, { once: true });
  } catch {
    // Not supported
  }
}

function observeINP(): void {
  try {
    let maxINP = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration;
        if (duration > maxINP) maxINP = duration;
      }
    });
    observer.observe({ type: 'event', buffered: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && maxINP > 0) {
        reportMetric({
          name: 'INP',
          value: maxINP,
          rating: rate('INP', maxINP),
        });
      }
    }, { once: true });
  } catch {
    // Not supported
  }
}

function observeTTFB(): void {
  try {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (nav) {
      const ttfb = nav.responseStart - nav.requestStart;
      reportMetric({
        name: 'TTFB',
        value: ttfb,
        rating: rate('TTFB', ttfb),
      });
    }
  } catch {
    // Not supported
  }
}

/**
 * Initialize Web Vitals tracking. Call once at app startup.
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined') return;
  if (typeof PerformanceObserver === 'undefined') return;

  // Defer to avoid blocking initial render
  requestIdleCallback?.(() => {
    observePaint();
    observeLCP();
    observeCLS();
    observeINP();
    observeTTFB();
  }) ?? setTimeout(() => {
    observePaint();
    observeLCP();
    observeCLS();
    observeINP();
    observeTTFB();
  }, 3000);
}

/**
 * ErrorBoundary Component Tests
 *
 * Tests that the ErrorBoundary correctly catches render errors,
 * shows the fallback UI, and calls the optional onError callback.
 *
 * Pattern: Data attribute assertions (no UI text — resilient to i18n changes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── Mock observability ───────────────────────────────────────────────────────

vi.mock('@/lib/observability/error-report', () => ({
  reportErrorBoundary: vi.fn(() => 'TEST-ERROR-ID-001'),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Component that throws on render when `shouldThrow` is true.
 */
function ThrowOnRender({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <div data-testid="child-ok">Child rendered</div>;
}

/**
 * Suppress console.error for expected error boundary noise.
 */
function suppressConsoleError() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => spy.mockRestore();
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  describe('Happy path', () => {
    it('renders children when no error is thrown', () => {
      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={false} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId('child-ok')).toBeDefined();
    });

    it('children are accessible via the DOM', () => {
      render(
        <ErrorBoundary>
          <div data-testid="inner">content</div>
        </ErrorBoundary>,
      );

      expect(screen.getByTestId('inner').textContent).toBe('content');
    });
  });

  describe('Error capture', () => {
    it('shows fallback UI when child throws', () => {
      const restore = suppressConsoleError();

      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>,
      );

      // Child should NOT be in the DOM
      expect(screen.queryByTestId('child-ok')).toBeNull();

      restore();
    });

    it('does not render children after error', () => {
      const restore = suppressConsoleError();

      render(
        <ErrorBoundary>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.queryByTestId('child-ok')).toBeNull();
      restore();
    });
  });

  describe('Custom fallback', () => {
    it('renders custom fallback when provided', () => {
      const restore = suppressConsoleError();

      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error UI</div>}>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId('custom-fallback')).toBeDefined();
      restore();
    });

    it('does not show custom fallback when no error', () => {
      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error UI</div>}>
          <ThrowOnRender shouldThrow={false} />
        </ErrorBoundary>,
      );

      expect(screen.queryByTestId('custom-fallback')).toBeNull();
    });
  });

  describe('onError callback', () => {
    it('calls onError callback when child throws', () => {
      const restore = suppressConsoleError();
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowOnRender shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ componentStack: expect.any(String) }),
      );
      restore();
    });

    it('does not call onError when no error', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ThrowOnRender shouldThrow={false} />
        </ErrorBoundary>,
      );

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('componentName prop', () => {
    it('accepts componentName without throwing', () => {
      const restore = suppressConsoleError();

      expect(() => {
        render(
          <ErrorBoundary componentName="TestComponent">
            <ThrowOnRender shouldThrow={true} />
          </ErrorBoundary>,
        );
      }).not.toThrow();

      restore();
    });
  });
});

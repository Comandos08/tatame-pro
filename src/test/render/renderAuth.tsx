/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.A)
 *
 * Canonical render helper for Auth tests.
 * Wraps AuthProvider with frozen time and mock Supabase.
 *
 * No business logic. No Identity. No Tenant.
 * Auth isolation only.
 */

import React, { ReactNode } from 'react';
import { render, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useCurrentUser } from '@/contexts/AuthContext';
import { freezeTestTime, unfreezeTestTime } from '@/test/test-utils/mock-time';

// ── Query client factory (isolated per test) ──

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

// ── Auth test wrapper ──

function AuthTestWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Consumer component for testing auth state ──

interface AuthStateDisplayProps {
  onState?: (state: ReturnType<typeof useCurrentUser>) => void;
}

export function AuthStateConsumer({ onState }: AuthStateDisplayProps) {
  const authState = useCurrentUser();

  if (onState) {
    onState(authState);
  }

  return (
    <div
      data-testid="auth-state"
      data-authenticated={String(authState.isAuthenticated)}
      data-loading={String(authState.isLoading)}
      data-has-session={String(!!authState.session)}
      data-has-user={String(!!authState.currentUser)}
      data-superadmin={String(authState.isGlobalSuperadmin)}
    >
      <span data-testid="auth-authenticated">{String(authState.isAuthenticated)}</span>
      <span data-testid="auth-loading">{String(authState.isLoading)}</span>
    </div>
  );
}

// ── Render function ──

export interface RenderAuthOptions {
  /** Freeze time before render. Default: true */
  freezeTime?: boolean;
}

/**
 * Renders a component within AuthProvider with frozen time.
 * Use AuthStateConsumer as child to inspect auth state.
 */
export function renderWithAuth(
  ui?: ReactNode,
  options: RenderAuthOptions = {}
): RenderResult {
  const { freezeTime = true } = options;

  if (freezeTime) {
    freezeTestTime();
  }

  const result = render(
    <AuthTestWrapper>
      {ui ?? <AuthStateConsumer />}
    </AuthTestWrapper>
  );

  return result;
}

/**
 * Cleanup helper — restores real timers.
 */
export function cleanupAuth(): void {
  unfreezeTestTime();
}

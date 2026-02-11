/**
 * ⚠️ FROZEN TEST CONTRACT (PI U8.B)
 *
 * Canonical render helper for Identity tests.
 * Wraps AuthProvider + IdentityProvider with deterministic mocks.
 *
 * Does NOT include routing (IdentityGate uses useLocation).
 * For IdentityGate integration tests, use a MemoryRouter wrapper.
 */

import { ReactNode } from 'react';
import { render, RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { IdentityProvider, useIdentity } from '@/contexts/IdentityContext';

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

// ── Identity test wrapper ──

function IdentityTestWrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <IdentityProvider>
          {children}
        </IdentityProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// ── Consumer component for testing identity state ──

export function IdentityStateConsumer() {
  const state = useIdentity();

  return (
    <div
      data-testid="identity-state"
      data-identity-state={state.identityState}
      data-has-error={String(!!state.error)}
      data-error-code={state.error?.code ?? ''}
      data-has-tenant={String(!!state.tenant)}
      data-tenant-id={state.tenant?.id ?? ''}
      data-tenant-slug={state.tenant?.slug ?? ''}
      data-role={state.role ?? ''}
      data-wizard-completed={String(state.wizardCompleted)}
      data-redirect-path={state.redirectPath ?? ''}
    />
  );
}

// ── Render function ──

/**
 * Renders a component within AuthProvider + IdentityProvider.
 * Use IdentityStateConsumer as child to inspect identity state.
 *
 * IMPORTANT: Before calling this, you must:
 * 1. vi.mock('@/integrations/supabase/client') with auth mock
 * 2. installIdentityFetchMock() for edge function responses
 * 3. setupIdentityMocks({ fetchResponse: ... }) for scenario data
 */
export function renderWithIdentity(ui?: ReactNode): RenderResult {
  return render(
    <IdentityTestWrapper>
      {ui ?? <IdentityStateConsumer />}
    </IdentityTestWrapper>
  );
}

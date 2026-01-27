import React, { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { AuthProvider } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { I18nProvider } from './I18nContext';
import { JoinProvider } from './JoinContext';
import { ImpersonationProvider } from './ImpersonationContext';
import { IdentityProvider } from './IdentityContext';
import { ImpersonationBanner, ImpersonationBannerSpacer } from '@/components/impersonation/ImpersonationBanner';
import { IdentityGuard } from '@/components/identity/IdentityGuard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <IdentityProvider>
              <ImpersonationProvider>
                <JoinProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    <ImpersonationBanner />
                    <ImpersonationBannerSpacer />
                    <IdentityGuard>
                      {children}
                    </IdentityGuard>
                  </TooltipProvider>
                </JoinProvider>
              </ImpersonationProvider>
            </IdentityProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

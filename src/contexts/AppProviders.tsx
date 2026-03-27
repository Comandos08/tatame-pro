import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "./AuthContext";
import { ThemeProvider } from "./ThemeContext";
import { I18nProvider } from "./I18nContext";
import { JoinProvider } from "./JoinContext";
import { ImpersonationProvider } from "./ImpersonationContext";
import { IdentityProvider } from "./IdentityContext";
import { AlertProvider } from "./AlertContext";
import { ImpersonationBanner, ImpersonationBannerSpacer } from "@/components/impersonation/ImpersonationBanner";

interface AppProvidersProps {
  children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <ImpersonationProvider>
              <IdentityProvider>
                <AlertProvider>
                  <JoinProvider>
                    <TooltipProvider>
                      <Sonner />
                      <ImpersonationBanner />
                      <ImpersonationBannerSpacer />
                      {children}
                    </TooltipProvider>
                  </JoinProvider>
                </AlertProvider>
              </IdentityProvider>
            </ImpersonationProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

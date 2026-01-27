import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { reportErrorBoundary } from '@/lib/observability/error-report';

interface Props {
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** Component name for error reporting */
  componentName?: string;
  /** Callback when error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

/**
 * 🔐 ErrorBoundary — Global Error Catcher
 * 
 * Catches React render errors and displays a user-friendly fallback.
 * Reports errors to the observability layer for debugging.
 * 
 * @example
 * <ErrorBoundary componentName="Dashboard">
 *   <DashboardContent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorId: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to observability layer
    const errorId = reportErrorBoundary(error, errorInfo, this.props.componentName);
    this.setState({ errorId });

    // Call optional callback
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    // Use /portal as the decision hub
    window.location.href = '/portal';
  };

  private handleGoToLanding = () => {
    window.location.href = '/';
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto bg-destructive/10 rounded-full p-4 w-fit mb-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Algo deu errado</CardTitle>
              <CardDescription className="text-base">
                Ocorreu um erro inesperado. Tente recarregar a página ou voltar ao início.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error ID for support */}
              {this.state.errorId && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Código do erro</p>
                  <code className="text-sm font-mono">{this.state.errorId}</code>
                </div>
              )}
              
              {/* Dev-only error details */}
              {isDev && this.state.error && (
                <div className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-32">
                  <p className="text-destructive font-semibold mb-1">{this.state.error.name}</p>
                  <p className="text-muted-foreground">{this.state.error.message}</p>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button onClick={this.handleRetry} variant="outline" className="w-full">
                Tentar Novamente
              </Button>
              <Button onClick={this.handleReload} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Recarregar Página
              </Button>
              <Button variant="ghost" onClick={this.handleGoHome} className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Voltar ao Portal
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook-friendly error boundary wrapper.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { componentName?: string; fallback?: ReactNode }
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary componentName={options?.componentName || displayName} fallback={options?.fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

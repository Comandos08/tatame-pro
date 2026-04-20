import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { reportErrorBoundary } from "@/lib/observability/error-report";
import { useI18n } from "@/contexts/I18nContext";

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
    // Keep signature compatible with current reportErrorBoundary(componentName?: string)
    const route = window.location.pathname;
    const env = import.meta.env.MODE;

    const baseName = this.props.componentName ?? "UnknownComponent";

    // Encode minimal context into a string (no type changes required)
    const contextName = `${baseName} | route=${route} | env=${env}`;

    const errorId = reportErrorBoundary(error, errorInfo, contextName);
    this.setState({ errorId });

    // Call optional callback
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/login";
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

      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error | null;
  errorId: string | null;
  onRetry: () => void;
  onReload: () => void;
  onGoHome: () => void;
}

function DefaultErrorFallback({ error, errorId, onRetry, onReload, onGoHome }: DefaultErrorFallbackProps) {
  const { t } = useI18n();
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="error-boundary-fallback">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto bg-destructive/10 rounded-full p-4 w-fit mb-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-2xl">{t("errorBoundary.title")}</CardTitle>
          <CardDescription className="text-base">{t("errorBoundary.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorId && (
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t("errorBoundary.errorIdLabel")}</p>
              <code className="text-sm font-mono">{errorId}</code>
            </div>
          )}

          {isDev && error && (
            <div className="bg-muted rounded-lg p-3 text-xs font-mono overflow-auto max-h-32">
              <p className="text-destructive font-semibold mb-1">{error.name}</p>
              <p className="text-muted-foreground">{error.message}</p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <Button onClick={onRetry} variant="outline" className="w-full">
            {t("errorBoundary.retry")}
          </Button>

          <Button onClick={onReload} className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("errorBoundary.reload")}
          </Button>

          <Button variant="ghost" onClick={onGoHome} className="w-full">
            <Home className="mr-2 h-4 w-4" />
            {t("errorBoundary.goHome")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Hook-friendly error boundary wrapper.
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { componentName?: string; fallback?: ReactNode },
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WithErrorBoundary = (props: P) => (
    <ErrorBoundary componentName={options?.componentName || displayName} fallback={options?.fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

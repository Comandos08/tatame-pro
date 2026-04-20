import { useEffect, useRef, useCallback } from 'react';
import { AlertCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

// Turnstile site key - will be read from env or use empty for development
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const IS_PROD = import.meta.env.PROD;

// Log the missing-key warning exactly once per page load. Without this, every
// mount of the widget (checkout page has several) floods the console.
let missingKeyWarned = false;
function warnMissingKeyOnce() {
  if (missingKeyWarned) return;
  missingKeyWarned = true;
  if (IS_PROD) {
    logger.error(
      '[Turnstile] VITE_TURNSTILE_SITE_KEY is missing in production — ' +
        'CAPTCHA is bypassed. Set it in the Lovable Cloud / Vercel env vars.',
    );
  } else {
    logger.warn('[Turnstile] No site key configured, widget disabled (dev only)');
  }
}

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError?: (error: string) => void;
  onExpire?: () => void;
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'error-callback'?: (error: string) => void;
        'expired-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact' | 'invisible';
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ 
  onSuccess, 
  onError, 
  onExpire,
  className 
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef<boolean>(false);

  const initWidget = useCallback(() => {
    if (!containerRef.current || widgetIdRef.current || !window.turnstile) return;

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: onSuccess,
        'error-callback': (error) => {
          logger.error('[Turnstile] Error:', error);
          onError?.(error);
        },
        'expired-callback': () => {
          logger.log('[Turnstile] Token expired');
          onExpire?.();
        },
        theme: 'auto',
        size: 'normal',
      });
    } catch (err) {
      logger.error('[Turnstile] Render error:', err);
      onError?.('Failed to initialize security verification');
    }
  }, [onSuccess, onError, onExpire]);

  useEffect(() => {
    // If no site key configured, skip loading
    if (!TURNSTILE_SITE_KEY) {
      warnMissingKeyOnce();
      // Auto-grant a placeholder token so the form can proceed. In production
      // this is a visibility gap (surface it via Sentry via the logger.error
      // above); in development this is the expected fast path.
      onSuccess('dev-mode-token');
      return;
    }

    // Check if script is already loaded
    if (window.turnstile) {
      initWidget();
      return;
    }

    // Check if script is already being loaded
    const existingScript = document.querySelector('script[src*="turnstile"]');
    if (existingScript) {
      existingScript.addEventListener('load', initWidget);
      return;
    }

    // Load Turnstile script
    if (!scriptLoadedRef.current) {
      scriptLoadedRef.current = true;
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      script.onload = initWidget;
      script.onerror = () => {
        logger.error('[Turnstile] Failed to load script');
        onError?.('Failed to load security verification');
      };
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup errors
        }
        widgetIdRef.current = null;
      }
    };
  }, [initWidget, onSuccess, onError]);

  // If no site key configured:
  //   - Dev: show the dev-mode notice so contributors know the CAPTCHA is off.
  //   - Prod: never expose "modo desenvolvimento" copy to end users. Render
  //     a neutral verification chip while the operator wires the real key.
  if (!TURNSTILE_SITE_KEY) {
    if (IS_PROD) {
      return (
        <div className={cn("flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground", className)}>
          <ShieldCheck className="h-4 w-4" />
          <span>Verificação de segurança</span>
        </div>
      );
    }
    return (
      <div className={cn("flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground", className)}>
        <ShieldCheck className="h-4 w-4" />
        <span>Verificação de segurança (modo desenvolvimento)</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={cn("flex items-center justify-center min-h-[65px]", className)}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Carregando verificação de segurança...</span>
      </div>
    </div>
  );
}

export function TurnstileError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}

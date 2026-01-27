/**
 * 🔐 IDENTITY GUARD — Global Enforcement
 * 
 * Blocks access to protected routes until identity is resolved.
 * Redirects to wizard if wizard_completed = false.
 * 
 * RULES:
 * - Loading → show loader
 * - wizard_required → redirect to /identity/wizard
 * - error → show IdentityErrorScreen
 * - resolved/superadmin → render children
 */
import React, { ReactNode, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useIdentity } from '@/contexts/IdentityContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { IdentityErrorScreen } from './IdentityErrorScreen';

interface IdentityGuardProps {
  children: ReactNode;
}

// Routes that bypass identity check
const BYPASS_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/help',
  '/auth/callback',
  '/identity/wizard',
  '/identity/error',
  '/',
];

// Public tenant routes that don't require identity
const PUBLIC_TENANT_PATTERNS = [
  /^\/[^/]+\/verify\//,           // /:tenant/verify/*
  /^\/[^/]+\/membership\/new$/,   // /:tenant/membership/new
  /^\/[^/]+\/membership\/adult$/, // /:tenant/membership/adult
  /^\/[^/]+\/membership\/youth$/, // /:tenant/membership/youth
  /^\/[^/]+\/membership\/success$/,// /:tenant/membership/success
  /^\/[^/]+\/academies$/,         // /:tenant/academies
  /^\/[^/]+\/rankings$/,          // /:tenant/rankings
  /^\/[^/]+\/events$/,            // /:tenant/events (public list)
  /^\/[^/]+\/events\/[^/]+$/,     // /:tenant/events/:id (public detail)
  /^\/[^/]+\/login$/,             // /:tenant/login
  /^\/[^/]+$/,                    // /:tenant (landing)
];

export function IdentityGuard({ children }: IdentityGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { identityState, error } = useIdentity();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  
  const hasRedirectedRef = useRef(false);

  // Check if current route should bypass identity check
  const shouldBypass = () => {
    const pathname = location.pathname;
    
    // Check exact bypass routes
    if (BYPASS_ROUTES.some(route => pathname === route)) {
      return true;
    }

    // Check public tenant patterns
    if (PUBLIC_TENANT_PATTERNS.some(pattern => pattern.test(pathname))) {
      return true;
    }

    return false;
  };

  useEffect(() => {
    // Reset redirect guard on route change
    hasRedirectedRef.current = false;
  }, [location.pathname]);

  useEffect(() => {
    // Don't enforce on bypass routes
    if (shouldBypass()) return;

    // Wait for auth to load
    if (authLoading) return;

    // Not authenticated - let other guards handle
    if (!isAuthenticated) return;

    // Already redirecting
    if (hasRedirectedRef.current) return;

    // Wizard required - redirect to wizard
    if (identityState === 'wizard_required') {
      hasRedirectedRef.current = true;
      navigate('/identity/wizard', { replace: true });
    }
  }, [identityState, authLoading, isAuthenticated, navigate, location.pathname]);

  // Bypass routes - render children directly
  if (shouldBypass()) {
    return <>{children}</>;
  }

  // Not authenticated - render children (auth guards will handle)
  if (!isAuthenticated && !authLoading) {
    return <>{children}</>;
  }

  // Loading state
  if (authLoading || identityState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando identidade...</p>
        </div>
      </div>
    );
  }

  // Error state - show error screen
  if (identityState === 'error' && error) {
    return <IdentityErrorScreen error={error} />;
  }

  // Wizard required - show loading while redirecting
  if (identityState === 'wizard_required') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Redirecionando para configuração...</p>
        </div>
      </div>
    );
  }

  // Resolved or superadmin - render children
  return <>{children}</>;
}

/**
 * 🔐 IDENTITY GUARD — Wrapper for IdentityGate
 * 
 * F0.2 CONTRACT: This guard uses ONLY backend state.
 * Kept for backward compatibility with existing route structure.
 * 
 * BYPASS ROUTES: Public routes that don't require identity resolution.
 * All other routes go through IdentityGate logic.
 */
import React, { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useIdentity } from '@/contexts/IdentityContext';
import { Loader2 } from 'lucide-react';

interface IdentityGuardProps {
  children: ReactNode;
}

// Routes that bypass identity check completely
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

/**
 * Check if a route should bypass identity checks
 */
function shouldBypassRoute(pathname: string): boolean {
  // Check exact bypass routes
  if (BYPASS_ROUTES.some(route => pathname === route)) {
    return true;
  }

  // Check public tenant patterns
  if (PUBLIC_TENANT_PATTERNS.some(pattern => pattern.test(pathname))) {
    return true;
  }

  return false;
}

export function IdentityGuard({ children }: IdentityGuardProps) {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { identityState } = useIdentity();

  const pathname = location.pathname;

  // Bypass routes - render children directly
  if (shouldBypassRoute(pathname)) {
    return <>{children}</>;
  }

  // Not authenticated and done loading - let route handle it
  if (!authLoading && !isAuthenticated) {
    return <>{children}</>;
  }

  // Loading state for identity
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

  // All other states - render children, IdentityGate in routes handles redirects
  return <>{children}</>;
}

export default IdentityGuard;

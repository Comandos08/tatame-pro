/**
 * AuthCallback — Delegação completa ao backend
 * 
 * REGRAS IMUTÁVEIS:
 * - next NUNCA usado diretamente em navigate()
 * - Backend (POST_AUTH_REDIRECT) é autoridade da decisão
 * - catch SEMPRE redireciona para /
 * - Atleta NUNCA acessa /app
 * - Redirect NUNCA sai do tenant
 */
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { detectMembershipResume } from '@/lib/membership/membershipSessionPersistence';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

/**
 * Sanitizador de tenant slug
 * LOCAL: Não exportar
 */
function extractTenantSlug(path: string | null): string | null {
  if (!path) return null;

  const match = path.match(/^\/([^/]+)/);
  if (!match || !match[1]) return null;

  const slug = match[1];

  // Bloquear rotas globais explicitamente
  const blockedRoots = ['admin', 'auth', 'login', 'help'];
  if (blockedRoots.includes(slug)) {
    return null;
  }

  return slug;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser, isAuthenticated, isLoading } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);
  
  // 🔐 HARDENING: Prevent double execution and handle unmount
  const hasProcessedRef = useRef(false);
  const isMountedRef = useRef(true);

  const nextRaw = searchParams.get('next');

  useEffect(() => {
    isMountedRef.current = true;
    // Garante que o Supabase finalize a sessão do magic link
    supabase.auth.getSession();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    const handleRedirect = async () => {
      if (hasProcessedRef.current) return;
      if (isLoading || !isAuthenticated || !currentUser?.id || redirecting) return;

      hasProcessedRef.current = true;
      if (isMountedRef.current) setRedirecting(true);

      // FX-01A: Check membership resume
      const tenantSlug = extractTenantSlug(nextRaw);

      if (!tenantSlug) {
        const resumeInfo = detectMembershipResume();
        if (resumeInfo) {
          logger.info('[AuthCallback] Membership resume detected', {
            type: resumeInfo.type,
            tenantSlug: resumeInfo.tenantSlug
          });

          navigate(`/${resumeInfo.tenantSlug}/membership/${resumeInfo.type}`, {
            replace: true
          });
          return;
        }
      }

      try {
        if (abortController.signal.aborted) return;

        const { data, error } = await supabase.functions.invoke(
          'resolve-identity-wizard',
          {
            body: {
              action: 'POST_AUTH_REDIRECT',
              payload: {
                tenantSlug: tenantSlug || null,
                nextPath: nextRaw || null,
              },
            },
          }
        );

        if (abortController.signal.aborted || !isMountedRef.current) return;

        if (error) {
          logger.error('[AuthCallback] POST_AUTH_REDIRECT error:', error);
          navigate('/', { replace: true });
          return;
        }

        const result = data?.data ?? data;

        // P1-FIX: Handle WIZARD_REQUIRED returned by POST_AUTH_REDIRECT.
        // This happens for new users who verified email but haven't completed
        // the identity wizard yet (e.g. joined via /join but has no role/membership).
        // Without this check, result.redirectPath is undefined → destination = '/'
        // and the user lands on the homepage instead of the wizard.
        if (result?.status === 'WIZARD_REQUIRED') {
          navigate('/identity/wizard', { replace: true });
          return;
        }

        const destination = result?.redirectPath || '/';

        // 🔐 Validação defensiva de path
        if (
          typeof destination !== 'string' ||
          !destination.startsWith('/') ||
          destination.startsWith('//') ||
          destination.includes('..')
        ) {
          logger.warn('[AuthCallback] Invalid redirectPath received', { destination });
          navigate('/', { replace: true });
          return;
        }

        // 🔐 Se tenantSlug presente, impedir sair do tenant
        if (tenantSlug && !destination.startsWith(`/${tenantSlug}`)) {
          navigate(`/${tenantSlug}/portal`, { replace: true });
          return;
        }

        // 🔐 Atleta nunca acessa /app
        if (destination.includes('/app') && result?.role === 'ATLETA') {
          const safeDest = destination.replace('/app', '/portal');
          navigate(safeDest, { replace: true });
          return;
        }

        // P2-FIX: Invalidate tenant-scoped caches before navigating.
        // A previous login session may have left stale 'tenant-flags-contract'
        // or 'access-contract' entries that would cause gates to read stale data
        // on the first render after the callback redirect.
        queryClient.invalidateQueries({ queryKey: ['tenant-flags-contract'] });
        queryClient.invalidateQueries({ queryKey: ['access-contract'] });
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });

        navigate(destination, { replace: true });
        return;

      } catch (err) {
        if (abortController.signal.aborted || !isMountedRef.current) return;

        logger.error('[AuthCallback] Redirect error:', err);
        navigate('/', { replace: true });
      }
    };

    handleRedirect();

    return () => {
      abortController.abort();
    };
  }, [
    isLoading,
    isAuthenticated,
    currentUser,
    nextRaw,
    navigate,
    queryClient,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Finalizando acesso...</p>
      </div>
    </div>
  );
}

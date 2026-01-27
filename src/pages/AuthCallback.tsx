/**
 * P3 — ATHLETE AUTHCALLBACK HARDENING (FINAL)
 * AuthCallback com redirect blindado baseado em membership status
 * 
 * REGRAS IMUTÁVEIS:
 * - next NUNCA usado diretamente em navigate()
 * - TODO redirect passa pela função pura
 * - catch SEMPRE redireciona para /login
 * - Atleta NUNCA acessa /app
 * - Redirect NUNCA sai do tenant
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { resolveAthletePostLoginRedirect, MembershipStatus } from '@/lib/resolveAthletePostLoginRedirect';
import { Loader2 } from 'lucide-react';

/**
 * P3 — Sanitizador de tenant slug
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

/**
 * P3 — Validador de redirect pós-auth
 * LOCAL: Não exportar
 * 
 * REGRAS IMUTÁVEIS:
 * 1. No tenantSlug → '/'
 * 2. next válido (starts /${tenantSlug}, no /app) → next
 * 3. next inválido → /${tenantSlug}/portal
 */
function resolveAthletePostAuthRedirect(
  tenantSlug: string | null,
  next: string | null
): string {
  if (!tenantSlug) {
    return '/';
  }

  const tenantBase = `/${tenantSlug}`;
  const defaultDestination = `${tenantBase}/portal`;

  if (next) {
    const startsWithTenant = next.startsWith(tenantBase);
    const containsApp = next.includes('/app');

    if (startsWithTenant && !containsApp) {
      return next;
    }
  }

  return defaultDestination;
}

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isLoading } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);

  // P3: Não usar default - validação será feita pela função pura
  const nextRaw = searchParams.get('next');

  useEffect(() => {
    // Garante que o Supabase finalize a sessão do magic link
    supabase.auth.getSession();
  }, []);

  useEffect(() => {
    const handleRedirect = async () => {
      if (isLoading || !isAuthenticated || !currentUser?.id || redirecting) {
        return;
      }

      setRedirecting(true);

      const tenantSlug = extractTenantSlug(nextRaw);

      // Se não há tenant slug, usar função pura para decidir
      if (!tenantSlug) {
        const destination = resolveAthletePostAuthRedirect(null, nextRaw);
        navigate(destination, { replace: true });
        return;
      }

      try {
        // Buscar o tenant para obter o ID
        const tenantResult = await (supabase.from('tenants') as any)
          .select('id')
          .eq('slug', tenantSlug)
          .maybeSingle();

        const tenantData = tenantResult?.data as { id: string } | null;

        if (!tenantData?.id) {
          // Tenant não encontrado - usar função pura
          const destination = resolveAthletePostAuthRedirect(null, nextRaw);
          navigate(destination, { replace: true });
          return;
        }

        // Buscar athlete vinculado ao usuário neste tenant
        const athleteResult = await (supabase.from('athletes') as any)
          .select('id')
          .eq('tenant_id', tenantData.id)
          .eq('user_id', currentUser.id)
          .maybeSingle();

        const athleteData = athleteResult?.data as { id: string } | null;

        let membershipStatus: MembershipStatus = null;

        if (athleteData?.id) {
          // Buscar membership mais recente do atleta
          const membershipResult = await (supabase.from('memberships') as any)
            .select('status')
            .eq('tenant_id', tenantData.id)
            .eq('athlete_id', athleteData.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const membershipData = membershipResult?.data as { status: string } | null;
          membershipStatus = (membershipData?.status?.toUpperCase() as MembershipStatus) || null;
        } else {
          // Buscar por applicant_profile_id (caso seja aplicante ainda não aprovado)
          const membershipResult = await (supabase.from('memberships') as any)
            .select('status')
            .eq('tenant_id', tenantData.id)
            .eq('applicant_profile_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const membershipData = membershipResult?.data as { status: string } | null;
          membershipStatus = (membershipData?.status?.toUpperCase() as MembershipStatus) || null;
        }

        // Resolver o redirect baseado no status
        const redirectPath = resolveAthletePostLoginRedirect({
          tenantSlug,
          membershipStatus,
        });

        // Se o next era uma rota de formulário de membership, honrar apenas se não tiver membership
        const isMembershipFormRoute = nextRaw?.includes('/membership/new') || 
                                       nextRaw?.includes('/membership/adult') || 
                                       nextRaw?.includes('/membership/youth');
        
        // P3: Decidir targetPath SEM non-null assertion
        let targetPath: string;
        if (isMembershipFormRoute && !membershipStatus && nextRaw) {
          targetPath = nextRaw;
        } else {
          targetPath = redirectPath;
        }

        // P3: SEMPRE validar antes de navegar
        const destination = resolveAthletePostAuthRedirect(tenantSlug, targetPath);
        navigate(destination, { replace: true });

      } catch (error) {
        console.error('AuthCallback redirect error:', error);
        // 🔐 HARDENED: Catch goes to /portal (decision hub)
        // /portal will decide correct destination or redirect to /login if needed
        navigate('/portal', { replace: true });
      }
    };

    handleRedirect();
  }, [isLoading, isAuthenticated, currentUser, nextRaw, navigate, redirecting]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Finalizando acesso...</p>
      </div>
    </div>
  );
}

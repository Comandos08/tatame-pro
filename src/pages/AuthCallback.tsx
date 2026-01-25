/**
 * SAFE GOLD — ETAPA 3
 * AuthCallback com redirect inteligente baseado em membership status
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { resolveAthletePostLoginRedirect, MembershipStatus } from '@/lib/resolveAthletePostLoginRedirect';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isLoading } = useCurrentUser();
  const [redirecting, setRedirecting] = useState(false);

  const next = searchParams.get('next') || '/';

  // Extrai o tenant slug do parâmetro next
  const extractTenantSlug = (path: string): string | null => {
    // Pattern: /{tenantSlug}/... 
    const match = path.match(/^\/([^/]+)/);
    if (match && match[1] && !['admin', 'auth', 'login', 'help'].includes(match[1])) {
      return match[1];
    }
    return null;
  };

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

      const tenantSlug = extractTenantSlug(next);

      // Se não há tenant slug ou é uma rota admin, usar o next original
      if (!tenantSlug) {
        navigate(next, { replace: true });
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
          // Tenant não encontrado, ir para o next original
          navigate(next, { replace: true });
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
        const isMembershipFormRoute = next.includes('/membership/new') || 
                                       next.includes('/membership/adult') || 
                                       next.includes('/membership/youth');
        
        if (isMembershipFormRoute && !membershipStatus) {
          navigate(next, { replace: true });
        } else {
          navigate(redirectPath, { replace: true });
        }
      } catch (error) {
        console.error('AuthCallback redirect error:', error);
        // Em caso de erro, ir para o next original
        navigate(next, { replace: true });
      }
    };

    handleRedirect();
  }, [isLoading, isAuthenticated, currentUser, next, navigate, redirecting]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Finalizando acesso...</p>
      </div>
    </div>
  );
}

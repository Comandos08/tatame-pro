import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { resolveTenantBillingState } from '@/lib/billing';
import { resolveAdminPostLoginRedirect } from '@/lib/resolveAdminPostLoginRedirect';
import logoLight from '@/assets/logoTatameLight.png';
import logoDark from '@/assets/logoTatameDark.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser, isAuthenticated, isGlobalSuperadmin, isLoading: authLoading, signIn } = useCurrentUser();

  // Redirect after authentication
  useEffect(() => {
    async function redirectUser() {
      if (authLoading || !isAuthenticated || !currentUser) {
        return;
      }

      // Superadmin global → /admin (unchanged)
      if (isGlobalSuperadmin) {
        navigate('/admin', { replace: true });
        return;
      }

      // Check for admin/staff roles
      try {
        const { data: adminRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select(`
            role,
            tenant_id,
            tenants:tenant_id (
              id,
              slug,
              is_active
            )
          `)
          .eq('user_id', currentUser.id)
          .in('role', ['ADMIN_TENANT', 'STAFF_ORGANIZACAO']);

        if (rolesError) {
          console.error('Error fetching admin roles:', rolesError);
          navigate('/', { replace: true });
          return;
        }

        if (adminRoles && adminRoles.length > 0) {
          const tenantId = adminRoles[0].tenant_id;
          const tenantData = (adminRoles[0] as any).tenants;
          const tenantSlug = tenantData?.slug;

          if (tenantSlug && tenantId) {
            try {
              // P2: Fetch billing data before redirect
              const { data: billingData } = await supabase
                .from('tenant_billing')
                .select('status, is_manual_override, override_reason, override_at')
                .eq('tenant_id', tenantId)
                .maybeSingle();

              // Resolve billing state using CORE resolver
              const billingState = resolveTenantBillingState(
                billingData ? {
                  status: billingData.status,
                  is_manual_override: billingData.is_manual_override,
                  override_reason: billingData.override_reason,
                  override_at: billingData.override_at,
                } : null,
                tenantData ? { is_active: tenantData.is_active } : null
              );

              // P2: Use pure function to determine destination
              const destination = resolveAdminPostLoginRedirect(tenantSlug, billingState);
              navigate(destination, { replace: true });
            } catch (error) {
              // FALLBACK RESTRITIVO: error → go to app (TenantLayout will block if needed)
              console.error('Admin post-login redirect failed:', error);
              navigate(`/${tenantSlug}/app`, { replace: true });
            }
            return;
          }
        }

        // No admin role found, go to landing
        navigate('/', { replace: true });
      } catch (error) {
        console.error('Error in redirect logic:', error);
        navigate('/', { replace: true });
      }
    }

    redirectUser();
  }, [currentUser, isAuthenticated, isGlobalSuperadmin, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signIn(email, password);
      toast({
        title: 'Login realizado com sucesso',
        description: 'Redirecionando...',
      });
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        title: 'Erro ao fazer login',
        description: error.message || 'Verifique suas credenciais e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // If already authenticated, show redirecting message
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Redirecionando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src={logoLight}
              alt="Tatame Pro"
              className="h-12 dark:hidden"
            />
            <img
              src={logoDark}
              alt="Tatame Pro"
              className="h-12 hidden dark:block"
            />
          </div>
          <div>
            <CardTitle className="text-2xl">Login Administrativo</CardTitle>
            <CardDescription>
              Acesso para administradores e equipe
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link
              to="/forgot-password"
              className="text-primary hover:underline"
            >
              Esqueceu sua senha?
            </Link>
          </div>
          <div className="mt-2 text-center text-sm text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← Voltar ao início
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

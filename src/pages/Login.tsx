import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  
  const { signIn, signUp, isGlobalSuperadmin, currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already logged in
  React.useEffect(() => {
    const redirectUser = async () => {
      if (!currentUser) return;
      
      if (isGlobalSuperadmin) {
        navigate('/admin');
        return;
      }

      // Check if user has any tenant admin role
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('tenant_id, tenants!inner(slug)')
        .eq('user_id', currentUser.id)
        .in('role', ['ADMIN_TENANT', 'STAFF_ORGANIZACAO', 'COACH_PRINCIPAL'])
        .limit(1);

      if (adminRoles && adminRoles.length > 0) {
        const tenantSlug = (adminRoles[0] as any).tenants?.slug;
        if (tenantSlug) {
          navigate(`/${tenantSlug}/app`);
          return;
        }
      }

      // Fallback to landing
      if (currentUser.tenantId) {
        navigate('/');
      }
    };

    redirectUser();
  }, [currentUser, isGlobalSuperadmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, name);
        toast({
          title: 'Conta criada!',
          description: 'Sua conta foi criada com sucesso. Você já pode fazer login.',
        });
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso.',
        });
      }
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-8">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold">IPPON</span>
            </Link>
            <h1 className="font-display text-3xl font-bold mb-2">
              {isSignUp ? 'Criar conta' : 'Entrar'}
            </h1>
            <p className="text-muted-foreground">
              {isSignUp
                ? 'Preencha os dados para criar sua conta'
                : 'Entre com suas credenciais para acessar'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSignUp ? (
                'Criar conta'
              ) : (
                'Entrar'
              )}
            </Button>
          </form>

          {!isSignUp && (
            <div className="mt-4 text-center">
              <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                Esqueceu sua senha?
              </Link>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </motion.div>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-30" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 text-center p-8"
        >
          <div className="h-24 w-24 rounded-2xl bg-primary mx-auto flex items-center justify-center mb-8 glow-primary">
            <Shield className="h-12 w-12 text-primary-foreground" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">
            Gerencie sua federação
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Sistema completo para organizações de esportes de combate. 
            BJJ, Judô, Wrestling, Muay Thai e muito mais.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * PI-ONB-ENDTOEND-HARDEN-001
 * JoinTenant — Explicit tenant selection before signup.
 * User enters org slug/code, then navigates to /signup?mode=join&tenantCode=<slug>
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, ArrowRight, Loader2 } from 'lucide-react';
import iconLogo from '@/assets/iconLogo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { isValidTenantSlug } from '@/lib/onboarding-storage';
import { logger } from '@/lib/logger';

export default function JoinTenant() {
  const [tenantCode, setTenantCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const navigate = useNavigate();
  useI18n();

  const handleContinue = async () => {
    const code = tenantCode.trim().toLowerCase();

    if (!code) {
      toast.error('Código obrigatório', { description: 'Digite o código da organização para continuar.' });
      return;
    }

    if (!isValidTenantSlug(code)) {
      toast.error('Código inválido', { description: 'O código deve conter entre 3 e 64 caracteres (letras minúsculas, números e hífens).' });
      return;
    }

    setIsValidating(true);

    try {
      // Validate tenant exists and is active
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('id, slug, name, is_active')
        .eq('slug', code)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!tenant) {
        toast.error('Organização não encontrada', { description: 'Verifique o código e tente novamente. A organização pode estar inativa.' });
        setIsValidating(false);
        return;
      }

      logger.info('[JoinTenant] Tenant validated, navigating to signup', { slug: code });
      navigate(`/signup?mode=join&tenantCode=${encodeURIComponent(code)}`);
    } catch (err) {
      logger.error('[JoinTenant] Validation error:', err);
      toast.error('Erro', { description: 'Não foi possível verificar a organização. Tente novamente.' });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-8">
              <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain" />
              <span className="font-display text-xl font-bold">TATAME</span>
            </Link>
            <h1 className="font-display text-3xl font-bold mb-2">
              Entrar em uma organização
            </h1>
            <p className="text-muted-foreground">
              Digite o código da organização que você deseja se filiar
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="tenantCode">Código da organização</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="tenantCode"
                  type="text"
                  placeholder="Ex: demo-bjj"
                  className="pl-10"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toLowerCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Você recebeu este código do administrador da sua organização
              </p>
            </div>

            <Button
              className="w-full h-11"
              onClick={handleContinue}
              disabled={isValidating || !tenantCode.trim()}
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <Button variant="outline" className="w-full h-11" asChild>
              <Link to="/signup?mode=create">
                Criar uma nova organização
              </Link>
            </Button>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Fazer login
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-30" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 text-center p-8 max-w-md"
        >
          <div className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary overflow-hidden">
            <img src={iconLogo} alt="TATAME" className="max-h-full max-w-full rounded-2xl object-contain" />
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
            Junte-se à sua organização
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Conecte-se à sua federação ou academia para acessar filiação digital, eventos e muito mais.
          </p>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Filiação digital com QR Code</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Inscrição em eventos e competições</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Histórico de graduações</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * 🔐 IDENTITY ERROR SCREEN — Explicit Error Display
 * 
 * Shows clear, actionable error messages for identity issues.
 * No silent errors, no console-only logging.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Key, Shield, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useIdentity, IdentityError } from '@/contexts/IdentityContext';
import { useI18n } from '@/contexts/I18nContext';

interface IdentityErrorScreenProps {
  error: IdentityError;
}

interface ErrorConfig {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actions: Array<{
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
  }>;
}

export function IdentityErrorScreen({ error }: IdentityErrorScreenProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { signOut } = useCurrentUser();
  const { clearError } = useIdentity();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleRetry = () => {
    clearError();
  };

  const handleGoToWizard = () => {
    clearError();
    navigate('/identity/wizard', { replace: true });
  };

  const handleGoHome = () => {
    navigate('/', { replace: true });
  };

  const handleContactSupport = () => {
    navigate('/help', { replace: true });
  };

  const getErrorConfig = (): ErrorConfig => {
    switch (error.code) {
      case 'TENANT_NOT_FOUND':
        return {
          icon: Building2,
          title: 'Organização não encontrada',
          description: 'A organização que você está tentando acessar não existe ou foi desativada. Verifique o código ou selecione outra organização.',
          actions: [
            { label: 'Selecionar Organização', onClick: handleGoToWizard, variant: 'default' },
            { label: 'Voltar ao Início', onClick: handleGoHome, variant: 'outline' },
            { label: 'Sair', onClick: handleLogout, variant: 'ghost' },
          ],
        };

      case 'INVITE_INVALID':
        return {
          icon: Key,
          title: 'Convite inválido',
          description: 'O código de convite informado é inválido, expirou ou já foi utilizado. Solicite um novo convite ao administrador da organização.',
          actions: [
            { label: 'Tentar Novamente', onClick: handleGoToWizard, variant: 'default' },
            { label: 'Contatar Suporte', onClick: handleContactSupport, variant: 'outline' },
            { label: 'Sair', onClick: handleLogout, variant: 'ghost' },
          ],
        };

      case 'PERMISSION_DENIED':
        return {
          icon: Shield,
          title: 'Acesso negado',
          description: 'Você não tem permissão para acessar esta área. Entre em contato com o administrador da sua organização para solicitar acesso.',
          actions: [
            { label: 'Contatar Suporte', onClick: handleContactSupport, variant: 'default' },
            { label: 'Voltar ao Início', onClick: handleGoHome, variant: 'outline' },
            { label: 'Sair', onClick: handleLogout, variant: 'ghost' },
          ],
        };

      case 'IMPERSONATION_INVALID':
        return {
          icon: Shield,
          title: 'Sessão de impersonação inválida',
          description: 'A sessão de impersonação expirou ou foi invalidada. Inicie uma nova sessão de impersonação se necessário.',
          actions: [
            { label: 'Voltar ao Admin', onClick: () => navigate('/admin', { replace: true }), variant: 'default' },
            { label: 'Sair', onClick: handleLogout, variant: 'ghost' },
          ],
        };

      default:
        return {
          icon: HelpCircle,
          title: 'Erro de identidade',
          description: error.message || 'Ocorreu um erro ao verificar sua identidade. Por favor, tente novamente.',
          actions: [
            { label: 'Tentar Novamente', onClick: handleRetry, variant: 'default' },
            { label: 'Contatar Suporte', onClick: handleContactSupport, variant: 'outline' },
            { label: 'Sair', onClick: handleLogout, variant: 'ghost' },
          ],
        };
    }
  };

  const config = getErrorConfig();
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <IconComponent className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">{config.title}</CardTitle>
          <CardDescription className="text-base mt-2">
            {config.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {config.actions.map((action, index) => (
            <Button
              key={index}
              onClick={action.onClick}
              variant={action.variant || 'default'}
              className="w-full"
            >
              {action.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Standalone error page for direct navigation
 */
export function IdentityErrorPage() {
  const { error } = useIdentity();
  
  if (!error) {
    return (
      <IdentityErrorScreen 
        error={{ code: 'UNKNOWN', message: 'Erro desconhecido' }} 
      />
    );
  }

  return <IdentityErrorScreen error={error} />;
}

/**
 * SAFE GOLD — ETAPA 5
 * PortalAccessGate com estados cancelled e rejected + redirect automático
 */
import React, { ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Clock, AlertTriangle, XCircle, HelpCircle, Ban } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@/contexts/I18nContext';

interface AthleteData {
  id: string;
  full_name: string;
  tenant_id: string;
}

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  created_at: string;
}

interface PortalAccessGateProps {
  athlete: AthleteData | null;
  membership: MembershipData | null;
  isLoading: boolean;
  error: Error | null;
  children: ReactNode;
}

type GateState = 'loading' | 'error' | 'noAthlete' | 'pendingReview' | 'expired' | 'cancelled' | 'rejected' | 'unknown' | 'allowed';

export function PortalAccessGate({
  athlete,
  membership,
  isLoading,
  error,
  children,
}: PortalAccessGateProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  const getGateState = (): GateState => {
    if (isLoading) return 'loading';
    if (error) return 'error';
    if (!athlete) return 'noAthlete';
    
    if (!membership) return 'noAthlete';
    
    const status = membership.status?.toUpperCase();
    
    if (status === 'PENDING_REVIEW') return 'pendingReview';
    if (status === 'EXPIRED') return 'expired';
    if (status === 'CANCELLED') return 'cancelled';
    if (status === 'REJECTED') return 'rejected';
    if (status === 'APPROVED' || status === 'ACTIVE') return 'allowed';
    
    // Unknown status - show neutral message
    return 'unknown';
  };

  const gateState = getGateState();

  // SAFE GOLD: Redirect automático para estados bloqueados
  useEffect(() => {
    if (!tenantSlug || gateState === 'loading') return;
    
    const currentPath = window.location.pathname;
    
    if (gateState === 'expired') {
      const target = `/${tenantSlug}/membership/renew`;
      if (currentPath !== target) {
        navigate(target, { replace: true });
      }
    }
    
    if (gateState === 'cancelled' || gateState === 'rejected' || gateState === 'noAthlete') {
      const target = `/${tenantSlug}/membership/new`;
      if (currentPath !== target) {
        navigate(target, { replace: true });
      }
    }
  }, [gateState, tenantSlug, navigate]);

  if (gateState === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </motion.div>
      </div>
    );
  }

  if (gateState === 'allowed') {
    return <>{children}</>;
  }

  const handleNewMembership = () => {
    navigate(`/${tenantSlug}/membership/new`);
  };

  // Blocked states
  const stateConfig: Record<Exclude<GateState, 'loading' | 'allowed'>, {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
    showCTA?: boolean;
    ctaLabel?: string;
  }> = {
    error: {
      icon: XCircle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: 'Erro ao carregar',
      description: 'Não foi possível carregar suas informações. Tente novamente mais tarde.',
    },
    noAthlete: {
      icon: AlertTriangle,
      iconColor: 'text-warning',
      iconBg: 'bg-warning/10',
      title: t('portal.noAthlete'),
      description: t('portal.noAthleteDesc'),
      showCTA: true,
      ctaLabel: t('portal.startMembership') || 'Iniciar Filiação',
    },
    pendingReview: {
      icon: Clock,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-500/10',
      title: t('portal.pendingReview'),
      description: t('portal.pendingReviewDesc'),
    },
    expired: {
      icon: AlertTriangle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: t('portal.expired'),
      description: t('portal.expiredDesc'),
    },
    cancelled: {
      icon: Ban,
      iconColor: 'text-muted-foreground',
      iconBg: 'bg-muted',
      title: t('portal.cancelled') || 'Filiação Cancelada',
      description: t('portal.cancelledDesc') || 'Sua filiação foi cancelada. Para voltar a participar, inicie uma nova filiação.',
      showCTA: true,
      ctaLabel: t('portal.startNewMembership') || 'Nova Filiação',
    },
    rejected: {
      icon: XCircle,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      title: t('portal.rejected') || 'Filiação Recusada',
      description: t('portal.rejectedDesc') || 'Sua solicitação de filiação foi recusada. Entre em contato com a organização para mais informações.',
      showCTA: true,
      ctaLabel: t('portal.tryAgain') || 'Tentar Novamente',
    },
    unknown: {
      icon: HelpCircle,
      iconColor: 'text-muted-foreground',
      iconBg: 'bg-muted',
      title: t('portal.unknownStatus'),
      description: t('portal.unknownStatusDesc'),
    },
  };

  const config = stateConfig[gateState];
  const IconComponent = config.icon;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-8 text-center">
            <div
              className={`h-16 w-16 rounded-full ${config.iconBg} flex items-center justify-center mx-auto mb-4`}
            >
              <IconComponent className={`h-8 w-8 ${config.iconColor}`} />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">{config.title}</h2>
            <p className="text-muted-foreground text-sm mb-6">{config.description}</p>
            
            {config.showCTA && (
              <Button onClick={handleNewMembership} className="w-full">
                {config.ctaLabel}
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

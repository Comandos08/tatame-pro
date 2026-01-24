import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Clock, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

type GateState = 'loading' | 'error' | 'noAthlete' | 'pendingReview' | 'expired' | 'unknown' | 'allowed';

export function PortalAccessGate({
  athlete,
  membership,
  isLoading,
  error,
  children,
}: PortalAccessGateProps) {
  const { t } = useI18n();

  const getGateState = (): GateState => {
    if (isLoading) return 'loading';
    if (error) return 'error';
    if (!athlete) return 'noAthlete';
    
    if (!membership) return 'noAthlete';
    
    const status = membership.status?.toUpperCase();
    
    if (status === 'PENDING_REVIEW') return 'pendingReview';
    if (status === 'EXPIRED') return 'expired';
    if (status === 'APPROVED' || status === 'ACTIVE') return 'allowed';
    
    // Unknown status - show neutral message
    return 'unknown';
  };

  const gateState = getGateState();

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

  // Blocked states
  const stateConfig: Record<Exclude<GateState, 'loading' | 'allowed'>, {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
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
            <p className="text-muted-foreground text-sm">{config.description}</p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

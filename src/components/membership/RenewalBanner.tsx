
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, CreditCard, ArrowRight, CheckCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';
import { useBillingOverride } from '@/hooks/useBillingOverride';
import { formatDate } from '@/lib/i18n/formatters';

interface RenewalBannerProps {
  membershipId: string;
  daysUntilExpiry: number;
  endDate: string;
  status: string;
}

export function RenewalBanner({ membershipId: _membershipId, daysUntilExpiry, endDate, status }: RenewalBannerProps) {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { t, locale } = useI18n();
  const { isManualOverride, isLoading: billingLoading } = useBillingOverride();

  // Don't show for memberships with more than 30 days remaining (unless expired)
  if (daysUntilExpiry > 30 && status !== 'EXPIRED') {
    return null;
  }

  const isExpired = status === 'EXPIRED' || daysUntilExpiry < 0;
  const isUrgent = daysUntilExpiry <= 7 && daysUntilExpiry >= 0;

  const formattedEndDate = formatDate(endDate, locale, { dateStyle: 'long' });

  const handleRenew = () => {
    // Bloquear navegação se billing override ativo
    if (isManualOverride) {
      return;
    }
    // Navegar para a página de renovação correta
    navigate(`/${tenantSlug}/membership/renew`);
  };

  const getTitle = () => {
    if (isExpired) return t('renewal.expired') || 'Sua filiação expirou';
    if (isUrgent) return (t('renewal.expiresInDays') || 'Sua filiação expira em {days} dias').replace('{days}', String(daysUntilExpiry));
    return (t('renewal.expiresInDays') || 'Sua filiação expira em {days} dias').replace('{days}', String(daysUntilExpiry));
  };

  const getDescription = () => {
    if (isManualOverride) {
      return t('billing.stripeDisabled') || 'Pagamentos automáticos estão desativados para esta organização.';
    }
    if (isExpired) {
      return t('renewal.expiredDesc') || 'Renove agora para continuar participando de eventos e manter sua carteira digital ativa.';
    }
    if (isUrgent) {
      return (t('renewal.urgentDesc') || 'Sua filiação vence em {date}. Renove com urgência para não perder acesso.').replace('{date}', formattedEndDate);
    }
    return (t('renewal.comfortableDesc') || 'Sua filiação vence em {date}. Renove com antecedência para continuar aproveitando os benefícios.').replace('{date}', formattedEndDate);
  };

  const getBgClass = () => {
    if (isExpired) return 'border-destructive bg-destructive/10';
    if (isUrgent) return 'border-warning bg-warning/10';
    return 'border-primary/30 bg-primary/5';
  };

  const getIconColor = () => {
    if (isExpired) return 'text-destructive';
    if (isUrgent) return 'text-warning';
    return 'text-primary';
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Alert className={`mb-6 ${getBgClass()}`}>
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 ${getIconColor()}`}>
            {isExpired ? <AlertTriangle className="h-5 w-5" /> : isUrgent ? <Clock className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <AlertTitle className={`text-base font-semibold ${isExpired ? 'text-destructive' : ''}`}>
              {getTitle()}
            </AlertTitle>
            <AlertDescription className="mt-1 text-sm text-muted-foreground">
              {getDescription()}
            </AlertDescription>
          </div>
          <Button 
            onClick={handleRenew} 
            variant={isExpired ? 'destructive' : isUrgent ? 'default' : 'outline'} 
            size="sm" 
            className="shrink-0"
            disabled={billingLoading || isManualOverride}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {t('renewal.renewNow') || 'Renovar Agora'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Alert>
    </motion.div>
  );
}

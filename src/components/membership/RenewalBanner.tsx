import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Clock, CreditCard, ArrowRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface RenewalBannerProps {
  membershipId: string;
  daysUntilExpiry: number;
  endDate: string;
  status: string;
}

export function RenewalBanner({ membershipId, daysUntilExpiry, endDate, status }: RenewalBannerProps) {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  if (daysUntilExpiry > 30 && status !== 'EXPIRED') {
    return null;
  }

  const isExpired = status === 'EXPIRED' || daysUntilExpiry < 0;
  const isUrgent = daysUntilExpiry <= 7 && daysUntilExpiry >= 0;

  const formattedEndDate = new Date(endDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handleRenew = () => {
    navigate(`/${tenantSlug}/filiacoes/nova`);
  };

  const getTitle = () => {
    if (isExpired) return 'Sua filiação expirou';
    if (isUrgent) return `Sua filiação expira em ${daysUntilExpiry} dias`;
    return `Sua filiação expira em ${daysUntilExpiry} dias`;
  };

  const getDescription = () => {
    if (isExpired) {
      return 'Renove agora para continuar participando de eventos e manter sua carteira digital ativa.';
    }
    return `Sua filiação vence em ${formattedEndDate}. Renove com antecedência para não perder acesso.`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
      <Alert className={`mb-6 ${isExpired ? 'border-destructive bg-destructive/10' : isUrgent ? 'border-warning bg-warning/10' : 'border-primary/50 bg-primary/5'}`}>
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 ${isExpired ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-primary'}`}>
            {isExpired ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <AlertTitle className={`text-base font-semibold ${isExpired ? 'text-destructive' : ''}`}>
              {getTitle()}
            </AlertTitle>
            <AlertDescription className="mt-1 text-sm text-muted-foreground">
              {getDescription()}
            </AlertDescription>
          </div>
          <Button onClick={handleRenew} variant={isExpired ? 'destructive' : 'default'} size="sm" className="shrink-0">
            <CreditCard className="h-4 w-4 mr-2" />
            Renovar Agora
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Alert>
    </motion.div>
  );
}

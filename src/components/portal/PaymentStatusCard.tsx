import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

interface PaymentStatusCardProps {
  paymentStatus: string;
}

export function PaymentStatusCard({ paymentStatus }: PaymentStatusCardProps) {
  const { t } = useI18n();

  const getPaymentDisplay = () => {
    const upperStatus = paymentStatus?.toUpperCase() || '';
    
    switch (upperStatus) {
      case 'PAID':
        return {
          icon: CheckCircle,
          label: t('portal.paymentPaid'),
          badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20',
          iconClass: 'text-green-500',
        };
      case 'PENDING':
        return {
          icon: Clock,
          label: t('portal.paymentPending'),
          badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
          iconClass: 'text-amber-500',
        };
      case 'NOT_PAID':
        return {
          icon: AlertTriangle,
          label: t('portal.paymentNotPaid'),
          badgeClass: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
          iconClass: 'text-orange-500',
        };
      case 'FAILED':
        return {
          icon: XCircle,
          label: t('portal.paymentFailed'),
          badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
          iconClass: 'text-destructive',
        };
      default:
        return {
          icon: Clock,
          label: paymentStatus || '-',
          badgeClass: 'bg-muted text-muted-foreground',
          iconClass: 'text-muted-foreground',
        };
    }
  };

  const display = getPaymentDisplay();
  const IconComponent = display.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="h-5 w-5 text-primary" />
          {t('portal.paymentStatus')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconComponent className={`h-5 w-5 ${display.iconClass}`} />
            <span className="text-sm text-muted-foreground">Status do pagamento</span>
          </div>
          <Badge className={display.badgeClass}>{display.label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

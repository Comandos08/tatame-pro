import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CreditCard } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';

interface MembershipStatusCardProps {
  status: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
}

export function MembershipStatusCard({
  status,
  type,
  startDate,
  endDate,
}: MembershipStatusCardProps) {
  const { t, locale } = useI18n();

  const getDateLocale = () => {
    switch (locale) {
      case 'en':
        return enUS;
      case 'es':
        return es;
      default:
        return ptBR;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = () => {
    const upperStatus = status?.toUpperCase() || '';
    switch (upperStatus) {
      case 'ACTIVE':
      case 'APPROVED':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Ativo</Badge>;
      case 'PENDING_REVIEW':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pendente</Badge>;
      case 'EXPIRED':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Expirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = () => {
    const upperType = type?.toUpperCase() || '';
    switch (upperType) {
      case 'FIRST_MEMBERSHIP':
        return <Badge variant="outline" className="text-xs">Primeira Filiação</Badge>;
      case 'RENEWAL':
        return <Badge variant="outline" className="text-xs">Renovação</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5 text-primary" />
          {t('portal.membershipStatus')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          {getStatusBadge()}
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tipo</span>
          {getTypeBadge()}
        </div>

        <div className="border-t pt-4 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Início:</span>
            <span className="font-medium">{formatDate(startDate)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Validade:</span>
            <span className="font-medium">{formatDate(endDate)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

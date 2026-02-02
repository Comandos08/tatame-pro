import React, { useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { Share2, Download, CheckCircle, AlertCircle, Clock, Shield } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';

interface DigitalMembershipCardProps {
  athleteName: string;
  athletePhoto?: string | null;
  tenantName: string;
  tenantLogo?: string | null;
  tenantSlug: string;
  membershipId: string;
  membershipStatus: 'ACTIVE' | 'APPROVED' | 'EXPIRED' | 'PENDING_REVIEW' | string;
  validUntil: string | null;
  pdfUrl?: string | null;
  contentHash?: string | null;
}

export function DigitalMembershipCard({
  athleteName,
  athletePhoto,
  tenantName,
  tenantLogo,
  tenantSlug,
  membershipId,
  membershipStatus,
  validUntil,
  pdfUrl,
  contentHash,
}: DigitalMembershipCardProps) {
  const { t, locale } = useI18n();

  const getDateLocale = () => {
    switch (locale) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  };

  const verificationUrl = `${window.location.origin}/${tenantSlug}/verify/membership/${membershipId}`;

  const getStatusConfig = () => {
    const status = membershipStatus.toUpperCase();
    switch (status) {
      case 'ACTIVE':
      case 'APPROVED':
        return {
          label: t('portal.cardStatusActive'),
          color: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
          icon: CheckCircle,
          bgGradient: 'from-green-500/10 via-transparent to-transparent',
        };
      case 'EXPIRED':
        return {
          label: t('portal.cardStatusExpired'),
          color: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
          icon: AlertCircle,
          bgGradient: 'from-red-500/10 via-transparent to-transparent',
        };
      case 'PENDING_REVIEW':
        return {
          label: t('portal.cardStatusPending'),
          color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30',
          icon: Clock,
          bgGradient: 'from-yellow-500/10 via-transparent to-transparent',
        };
      default:
        return {
          label: membershipStatus,
          color: 'bg-muted text-muted-foreground',
          icon: Clock,
          bgGradient: 'from-muted/10 via-transparent to-transparent',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  const handleShare = useCallback(async () => {
    const shareData = {
      title: t('portal.myCard'),
      text: `${athleteName} - ${tenantName}`,
      url: verificationUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error
        if ((err as Error).name !== 'AbortError') {
          fallbackCopy();
        }
      }
    } else {
      fallbackCopy();
    }
  }, [verificationUrl, athleteName, tenantName, t]);

  const fallbackCopy = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <Card className="overflow-hidden max-w-sm mx-auto">
      {/* Top gradient based on status */}
      <div className={`h-2 bg-gradient-to-r ${statusConfig.bgGradient} from-primary to-primary/60`} />
      
      <CardContent className="p-6">
        {/* Tenant Logo/Name */}
        <div className="flex items-center justify-center mb-6">
          {tenantLogo ? (
            <img
              src={tenantLogo}
              alt={tenantName}
              className="h-12 object-contain"
            />
          ) : (
            <h3 className="text-lg font-bold text-center">{tenantName}</h3>
          )}
        </div>

        {/* Athlete Photo/Initials */}
        <div className="flex justify-center mb-4">
          {athletePhoto ? (
            <img
              src={athletePhoto}
              alt={t('portal.athletePhoto' as any) || athleteName}
              className="h-24 w-24 rounded-full object-cover border-4 border-primary/20"
            />
          ) : (
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-primary/20">
              <span className="text-2xl font-bold text-primary">
                {getInitials(athleteName)}
              </span>
            </div>
          )}
        </div>

        {/* Athlete Name */}
        <h2 className="text-xl font-bold text-center mb-2">{athleteName}</h2>

        {/* Status Badge */}
        <div className="flex justify-center mb-4">
          <Badge variant="outline" className={`${statusConfig.color} gap-1`}>
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>

        {/* Validity */}
        <div className="text-center text-sm text-muted-foreground mb-6">
          <span>{t('portal.cardValidUntil')}: </span>
          <span className="font-medium">{formatDate(validUntil)}</span>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-white rounded-xl shadow-sm">
            <QRCodeSVG
              value={verificationUrl}
              size={180}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>

        {/* Verification hint */}
        <p className="text-xs text-center text-muted-foreground mb-6">
          {t('portal.scanToVerify')}
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" />
            {t('portal.shareCard')}
          </Button>
          
          {pdfUrl && (
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4" />
              {t('portal.downloadCard')}
            </Button>
          )}
        </div>

        {/* Content Hash (authenticity) */}
        {contentHash && (
          <div className="mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" />
              <span>ID:</span>
              <code className="font-mono text-[10px] truncate flex-1">
                {contentHash}
              </code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, AlertCircle, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, StatusType } from '@/components/ui/status-badge';
import { useI18n } from '@/contexts/I18nContext';
import { formatDate } from '@/lib/i18n/formatters';

export interface ProvisionalCardProps {
  athleteName: string;
  tenantName: string;
  tenantSlug: string;
  membershipId: string;
  membershipStatus: string;
  paymentStatus: string;
  endDate?: string | null;
  sportTypes?: string[];
}

export function ProvisionalCard({
  athleteName,
  tenantName,
  tenantSlug,
  membershipId,
  membershipStatus,
  paymentStatus,
  endDate,
  sportTypes,
}: ProvisionalCardProps) {
  const { t, locale } = useI18n();
  
  // Build the verification URL
  const verificationUrl = `${window.location.origin}/${tenantSlug}/verify/membership/${membershipId}`;
  
  // Determine status message and icon based on payment and membership status
  const getStatusMessage = () => {
    if (paymentStatus === 'PENDING') {
      return {
        icon: <Clock className="h-4 w-4" />,
        message: t('athleteArea.provisionalAwaitingPayment'),
        type: 'warning' as const,
      };
    }
    if (membershipStatus === 'PENDING_REVIEW') {
      return {
        icon: <Clock className="h-4 w-4" />,
        message: t('athleteArea.provisionalAwaitingApproval'),
        type: 'info' as const,
      };
    }
    if (membershipStatus === 'APPROVED' || membershipStatus === 'ACTIVE') {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin" />,
        message: t('athleteArea.provisionalProcessing'),
        type: 'success' as const,
      };
    }
    return {
      icon: <AlertCircle className="h-4 w-4" />,
      message: t('athleteArea.provisionalCardDesc'),
      type: 'neutral' as const,
    };
  };

  const statusInfo = getStatusMessage();

  return (
    <Card className="h-full border-dashed border-2 border-muted-foreground/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-5 w-5" />
          {t('athleteArea.provisionalCard')}
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {statusInfo.icon}
          {statusInfo.message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* QR Code */}
          <div className="bg-muted/50 rounded-xl p-4 flex flex-col items-center justify-center">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <QRCodeSVG 
                value={verificationUrl}
                size={140}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {t('athleteArea.provisionalQrHint')}
            </p>
          </div>
          
          {/* Athlete Info */}
          <div className="space-y-2 text-center">
            <p className="font-semibold text-lg">{athleteName}</p>
            <p className="text-sm text-muted-foreground">{tenantName}</p>
            {sportTypes && sportTypes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {sportTypes.join(' • ')}
              </p>
            )}
          </div>
          
          {/* Status Badge */}
          <div className="flex justify-center">
            <StatusBadge 
              status={membershipStatus as StatusType} 
              size="default"
            />
          </div>
          
          {/* Validity */}
          {endDate && (
            <p className="text-sm text-muted-foreground text-center">
              {t('verification.validUntil')}: {formatDate(endDate, locale)}
            </p>
          )}
          
          {/* Notice */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200 text-center">
              {t('verification.provisionalNotice')}
            </p>
          </div>
          
          {/* Verify Button */}
          <Button 
            variant="outline"
            className="w-full"
            asChild
          >
            <Link to={`/${tenantSlug}/verify/membership/${membershipId}`}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {t('athleteArea.verifyMembership')}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

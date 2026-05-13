
import { QrCode, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  membershipStatus,
  paymentStatus,
  endDate,
  sportTypes,
}: ProvisionalCardProps) {
  const { t, locale } = useI18n();

  // No QR / verify button is shown until the digital_card is issued.
  // The /verify/membership endpoint relies on the membership_verification
  // view, whose RLS requires membership_has_digital_card(id)=true. Showing a
  // scannable QR before approval would always resolve to "not found", which
  // is misleading and the symptom the audit flagged.

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
          {/* Status placeholder (in place of the QR until the digital card is issued) */}
          <div className="bg-muted/50 rounded-xl p-6 flex flex-col items-center justify-center text-center">
            <div className="h-32 w-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 bg-background/40">
              <QrCode className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2">
                {t('athleteArea.provisionalCard')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-3 max-w-[220px]">
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
        </div>
      </CardContent>
    </Card>
  );
}

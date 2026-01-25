import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard, CheckCircle, LucideIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  end_date: string | null;
}

interface Notice {
  priority: number;
  variant: 'destructive' | 'default';
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: {
    link: string;
    label: string;
  };
}

interface InAppNoticeProps {
  membership: MembershipData | null;
  tenantSlug: string;
}

export function InAppNotice({ membership, tenantSlug }: InAppNoticeProps) {
  const { t } = useI18n();

  const notices = useMemo(() => {
    if (!membership) return [];

    const result: Notice[] = [];
    const status = membership.status?.toUpperCase();
    const paymentStatus = membership.payment_status?.toUpperCase();

    // Calculate days until expiry
    const endDate = membership.end_date ? new Date(membership.end_date) : null;
    const now = new Date();
    const daysUntilExpiry = endDate
      ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;

    // 1. EXPIRED - highest priority
    if (status === 'EXPIRED') {
      result.push({
        priority: 1,
        variant: 'destructive',
        icon: AlertTriangle,
        title: t('notices.expired'),
        description: t('notices.expiredDesc'),
        cta: {
          link: `/${tenantSlug}/membership/renew`,
          label: t('notices.renewNow'),
        },
      });
    }

    // 2. EXPIRING SOON - 7 days or less
    if (status === 'ACTIVE' && daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
      result.push({
        priority: 2,
        variant: 'default',
        icon: Clock,
        title: t('notices.expiringSoon').replace('{days}', String(daysUntilExpiry)),
        description: t('notices.expiringSoonDesc'),
        cta: {
          link: `/${tenantSlug}/membership/renew`,
          label: t('notices.renewNow'),
        },
      });
    }

    // 3. PAYMENT PENDING
    if (paymentStatus === 'PENDING' && status !== 'EXPIRED') {
      result.push({
        priority: 3,
        variant: 'default',
        icon: CreditCard,
        title: t('notices.paymentPending'),
        description: t('notices.paymentPendingDesc'),
      });
    }

    // Sort by priority
    return result.sort((a, b) => a.priority - b.priority);
  }, [membership, tenantSlug, t]);

  // Show only the highest priority notice
  if (notices.length === 0) return null;

  const notice = notices[0];
  const Icon = notice.icon;

  return (
    <Alert
      variant={notice.variant}
      className="mb-6"
    >
      <Icon className="h-4 w-4" />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
        <span>{notice.description}</span>
        {notice.cta && (
          <Button
            variant="link"
            size="sm"
            asChild
            className="p-0 h-auto font-semibold"
          >
            <Link to={notice.cta.link}>{notice.cta.label}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

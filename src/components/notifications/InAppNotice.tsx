import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard, XCircle, RefreshCw } from 'lucide-react';
import { differenceInDays } from 'date-fns';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  end_date: string | null;
}

interface InAppNoticeProps {
  membership: MembershipData | null | undefined;
  tenantSlug: string;
}

type NoticeType = 'expired' | 'expiring' | 'payment_pending' | null;

interface NoticeConfig {
  type: NoticeType;
  priority: number;
  variant: 'destructive' | 'default';
  icon: React.ReactNode;
  titleKey: string;
  descriptionKey: string;
  action?: {
    labelKey: string;
    href: string;
  };
}

function getNoticeConfig(membership: MembershipData | null | undefined, tenantSlug: string): NoticeConfig | null {
  if (!membership) return null;

  const status = membership.status?.toUpperCase();
  const paymentStatus = membership.payment_status?.toUpperCase();

  // Priority 1: Expired membership (highest priority, destructive)
  if (status === 'EXPIRED') {
    return {
      type: 'expired',
      priority: 1,
      variant: 'destructive',
      icon: <XCircle className="h-4 w-4" />,
      titleKey: 'notices.expired',
      descriptionKey: 'notices.expiredDesc',
      action: {
        labelKey: 'notices.renewNow',
        href: `/${tenantSlug}/membership/renew`,
      },
    };
  }

  // Priority 2: Expiring soon (within 30 days)
  if (status === 'ACTIVE' && membership.end_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(membership.end_date);
    expiry.setHours(0, 0, 0, 0);
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
      return {
        type: 'expiring',
        priority: 2,
        variant: 'default',
        icon: <Clock className="h-4 w-4 text-warning" />,
        titleKey: 'notices.expiringSoon',
        descriptionKey: 'notices.expiringSoonDesc',
        action: {
          labelKey: 'notices.renewNow',
          href: `/${tenantSlug}/membership/renew`,
        },
      };
    }
  }

  // Priority 3: Payment pending
  if (paymentStatus === 'NOT_PAID' && status === 'PENDING_PAYMENT') {
    return {
      type: 'payment_pending',
      priority: 3,
      variant: 'default',
      icon: <CreditCard className="h-4 w-4 text-warning" />,
      titleKey: 'notices.paymentPending',
      descriptionKey: 'notices.paymentPendingDesc',
    };
  }

  return null;
}

export function InAppNotice({ membership, tenantSlug }: InAppNoticeProps) {
  const { t } = useI18n();

  const config = getNoticeConfig(membership, tenantSlug);

  if (!config) return null;

  const isDestructive = config.variant === 'destructive';

  return (
    <Alert 
      variant={config.variant}
      className={`mb-6 ${isDestructive ? '' : 'border-warning/30 bg-warning/5'}`}
    >
      {config.icon}
      <AlertTitle className={isDestructive ? '' : 'text-warning'}>
        {t(config.titleKey)}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{t(config.descriptionKey)}</span>
        {config.action && (
          <Link to={config.action.href}>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t(config.action.labelKey)}
            </Button>
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

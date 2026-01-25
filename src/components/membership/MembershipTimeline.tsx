import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import {
  FileText,
  CheckCircle,
  CreditCard,
  Calendar,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';

interface MembershipData {
  id: string;
  status: string;
  payment_status: string;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  type: string;
  reviewed_at?: string | null;
  rejected_at?: string | null;
  webhook_processed_at?: string | null;
}

interface TimelineEvent {
  id: string;
  type: 'CREATED' | 'APPROVED' | 'PAID' | 'ACTIVE' | 'EXPIRED' | 'REJECTED' | 'CANCELLED' | 'RENEWAL';
  date: string;
  details?: string;
}

interface MembershipTimelineProps {
  membership: MembershipData | null;
}

export function MembershipTimeline({ membership }: MembershipTimelineProps) {
  const { t, locale } = useI18n();

  const getDateLocale = () => {
    switch (locale) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  };

  const timelineEvents = useMemo(() => {
    if (!membership) return [];

    const events: TimelineEvent[] = [];
    const status = membership.status?.toUpperCase();

    // 1. CREATED - always exists
    events.push({
      id: 'created',
      type: membership.type === 'RENEWAL' ? 'RENEWAL' : 'CREATED',
      date: membership.created_at,
    });

    // 2. PAID - if payment_status = PAID
    if (membership.payment_status === 'PAID') {
      events.push({
        id: 'paid',
        type: 'PAID',
        date: membership.webhook_processed_at || membership.created_at,
      });
    }

    // 3. APPROVED - if status is APPROVED or ACTIVE
    if (['APPROVED', 'ACTIVE'].includes(status)) {
      events.push({
        id: 'approved',
        type: 'APPROVED',
        date: membership.reviewed_at || membership.start_date || membership.created_at,
      });
    }

    // 4. ACTIVE - if start_date exists and status is ACTIVE
    if (status === 'ACTIVE' && membership.start_date) {
      // Only add if different from approved date
      const approvedDate = membership.reviewed_at || membership.start_date;
      if (membership.start_date !== approvedDate) {
        events.push({
          id: 'active',
          type: 'ACTIVE',
          date: membership.start_date,
        });
      }
    }

    // 5. EXPIRED - if status = EXPIRED and has end_date
    if (status === 'EXPIRED' && membership.end_date) {
      events.push({
        id: 'expired',
        type: 'EXPIRED',
        date: membership.end_date,
      });
    }

    // 6. REJECTED
    if (status === 'REJECTED') {
      events.push({
        id: 'rejected',
        type: 'REJECTED',
        date: membership.rejected_at || membership.created_at,
      });
    }

    // 7. CANCELLED
    if (status === 'CANCELLED') {
      events.push({
        id: 'cancelled',
        type: 'CANCELLED',
        date: membership.created_at, // fallback, no specific field
      });
    }

    // Sort by date descending (most recent first)
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [membership]);

  const getEventConfig = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'CREATED':
        return {
          icon: FileText,
          label: t('timeline.created'),
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
        };
      case 'RENEWAL':
        return {
          icon: Calendar,
          label: t('timeline.renewed'),
          color: 'text-purple-500',
          bgColor: 'bg-purple-500/10',
        };
      case 'PAID':
        return {
          icon: CreditCard,
          label: t('timeline.paid'),
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
        };
      case 'APPROVED':
        return {
          icon: CheckCircle,
          label: t('timeline.approved'),
          color: 'text-green-600',
          bgColor: 'bg-green-600/10',
        };
      case 'ACTIVE':
        return {
          icon: CheckCircle,
          label: t('timeline.active'),
          color: 'text-emerald-500',
          bgColor: 'bg-emerald-500/10',
        };
      case 'EXPIRED':
        return {
          icon: AlertCircle,
          label: t('timeline.expired'),
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
        };
      case 'REJECTED':
        return {
          icon: XCircle,
          label: t('timeline.rejected'),
          color: 'text-red-600',
          bgColor: 'bg-red-600/10',
        };
      case 'CANCELLED':
        return {
          icon: XCircle,
          label: t('timeline.cancelled'),
          color: 'text-gray-500',
          bgColor: 'bg-gray-500/10',
        };
      default:
        return {
          icon: Clock,
          label: type,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
        };
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd MMM yyyy", { locale: getDateLocale() });
    } catch {
      return dateStr;
    }
  };

  if (!membership || timelineEvents.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          {t('timeline.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {/* Events */}
          <div className="space-y-4">
            {timelineEvents.map((event, index) => {
              const config = getEventConfig(event.type);
              const Icon = config.icon;
              const isLast = index === timelineEvents.length - 1;

              return (
                <div key={event.id} className="relative flex items-start gap-4 pl-0">
                  {/* Icon */}
                  <div
                    className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.bgColor} ${config.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className={`flex-1 pb-4 ${isLast ? 'pb-0' : ''}`}>
                    <p className="font-medium text-sm">{config.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.date)}
                    </p>
                    {event.details && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {event.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

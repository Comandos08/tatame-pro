import React from 'react';
import { Calendar, MapPin, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

type EventChangeType = 'DATE_CHANGED' | 'LOCATION_CHANGED' | 'CANCELED';

interface EventChangeNoticeCardProps {
  type: EventChangeType;
  previousValue?: string;
  currentValue?: string;
  className?: string;
}

const CHANGE_CONFIG: Record<EventChangeType, {
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  iconClassName: string;
  bgClassName: string;
}> = {
  DATE_CHANGED: {
    icon: Calendar,
    titleKey: 'events.change.dateChanged.title',
    descKey: 'events.change.dateChanged.desc',
    iconClassName: 'text-amber-600 dark:text-amber-400',
    bgClassName: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  },
  LOCATION_CHANGED: {
    icon: MapPin,
    titleKey: 'events.change.locationChanged.title',
    descKey: 'events.change.locationChanged.desc',
    iconClassName: 'text-blue-600 dark:text-blue-400',
    bgClassName: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  },
  CANCELED: {
    icon: AlertTriangle,
    titleKey: 'events.change.canceled.title',
    descKey: 'events.change.canceled.desc',
    iconClassName: 'text-destructive',
    bgClassName: 'bg-destructive/5 border-destructive/20',
  },
};

export function EventChangeNoticeCard({
  type,
  previousValue,
  currentValue,
  className,
}: EventChangeNoticeCardProps) {
  const { t } = useI18n();

  const config = CHANGE_CONFIG[type];

  // Unknown type → do not render
  if (!config) {
    return null;
  }

  const Icon = config.icon;

  const getDescription = (): string => {
    if (type === 'CANCELED') {
      return t(config.descKey);
    }

    return t(config.descKey, {
      from: previousValue || '—',
      to: currentValue || '—',
    });
  };

  return (
    <Card className={cn('border', config.bgClassName, className)}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5', config.iconClassName)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {t(config.titleKey)}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {getDescription()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

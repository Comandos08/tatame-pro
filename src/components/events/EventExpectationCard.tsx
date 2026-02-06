import React from 'react';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EventRegistrationStatus } from '@/types/event';
import { useI18n } from '@/contexts/I18nContext';

interface EventExpectationCardProps {
  registrationStatus: EventRegistrationStatus;
  className?: string;
}

interface ExpectationConfig {
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  borderClass: string;
  titleKey: string;
  descKey: string;
  reassuranceKey: string; // P2.3.1 — Microcopy de reforço
}

const expectationConfigs: Record<EventRegistrationStatus, ExpectationConfig> = {
  PENDING: {
    icon: Clock,
    iconClass: 'text-yellow-600 dark:text-yellow-400',
    bgClass: 'bg-yellow-500/5',
    borderClass: 'border-yellow-500/20',
    titleKey: 'events.expectation.pending.title',
    descKey: 'events.expectation.pending.desc',
    reassuranceKey: 'events.expectation.pending.reassurance',
  },
  CONFIRMED: {
    icon: CheckCircle,
    iconClass: 'text-green-600 dark:text-green-400',
    bgClass: 'bg-green-500/5',
    borderClass: 'border-green-500/20',
    titleKey: 'events.expectation.confirmed.title',
    descKey: 'events.expectation.confirmed.desc',
    reassuranceKey: 'events.expectation.confirmed.reassurance',
  },
  CANCELED: {
    icon: XCircle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/30',
    borderClass: 'border-muted',
    titleKey: 'events.expectation.canceled.title',
    descKey: 'events.expectation.canceled.desc',
    reassuranceKey: 'events.expectation.canceled.reassurance',
  },
};

/**
 * EventExpectationCard
 * 
 * Componente UX puro que responde a pergunta do atleta:
 * "Ok, e agora... o que acontece?"
 * 
 * REGRAS P2.3 + P2.3.1:
 * - SEM side effects
 * - SEM ações/botões
 * - Status desconhecido → return null
 * - Usa SOMENTE i18n
 * - P2.3.1: Microcopy de reforço para reduzir ansiedade
 */
export function EventExpectationCard({ 
  registrationStatus, 
  className 
}: EventExpectationCardProps) {
  const { t } = useI18n();
  const config = expectationConfigs[registrationStatus];

  // Status desconhecido: não renderizar
  if (!config) return null;

  const Icon = config.icon;
  
  // P2.3.1: Microcopy de reforço (só mostra se a key existir)
  const reassuranceText = t(config.reassuranceKey as any);
  const hasReassurance = reassuranceText && reassuranceText !== config.reassuranceKey;

  return (
    <Card className={cn(
      'border',
      config.bgClass,
      config.borderClass,
      className
    )}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
            config.bgClass
          )}>
            <Icon className={cn('h-5 w-5', config.iconClass)} />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="font-medium text-sm">
              {t(config.titleKey as any)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(config.descKey as any)}
            </p>
            {hasReassurance && (
              <p className="text-xs text-muted-foreground/80 mt-2 italic">
                {reassuranceText}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

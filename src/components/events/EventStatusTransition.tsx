import React, { useState } from 'react';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EventStatusBadge } from './EventStatusBadge';
import { EventStatus, EVENT_STATUS_CONFIG, getValidTransitions } from '@/types/event';
import { useI18n } from '@/contexts/I18nContext';

interface EventStatusTransitionProps {
  currentStatus: EventStatus;
  onTransition: (newStatus: EventStatus) => Promise<void>;
  disabled?: boolean;
}

export function EventStatusTransition({ 
  currentStatus, 
  onTransition,
  disabled = false 
}: EventStatusTransitionProps) {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<EventStatus | null>(null);
  
  const validTransitions = getValidTransitions(currentStatus);
  
  if (validTransitions.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <EventStatusBadge status={currentStatus} />
        <span className="text-xs text-muted-foreground">
          ({t('events.noTransitionsAvailable' as any) || 'Estado final'})
        </span>
      </div>
    );
  }

  const handleTransition = async (newStatus: EventStatus) => {
    setIsLoading(true);
    try {
      await onTransition(newStatus);
    } finally {
      setIsLoading(false);
      setConfirmDialog(null);
    }
  };

  const getTransitionLabel = (status: EventStatus) => {
    const config = EVENT_STATUS_CONFIG[status];
    const translatedLabel = t(config.labelKey as any);
    return translatedLabel !== config.labelKey ? translatedLabel : config.label;
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <EventStatusBadge status={currentStatus} />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              disabled={disabled || isLoading}
              className="gap-1"
            >
              {t('events.changeStatus' as any) || 'Alterar'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {validTransitions.map((status) => (
              <DropdownMenuItem
                key={status}
                onClick={() => setConfirmDialog(status)}
              >
                <span className="flex items-center gap-2">
                  → {getTransitionLabel(status)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              {t('events.confirmStatusChange' as any) || 'Confirmar Alteração de Status'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('events.statusChangeWarning' as any) || 
                'Esta ação não pode ser desfeita. O status do evento será alterado de'}{' '}
              <strong>{getTransitionLabel(currentStatus)}</strong>{' '}
              {t('common.to' as any) || 'para'}{' '}
              <strong>{confirmDialog && getTransitionLabel(confirmDialog)}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog && handleTransition(confirmDialog)}
              disabled={isLoading}
            >
              {isLoading ? t('common.loading') : t('common.confirm' as any) || 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

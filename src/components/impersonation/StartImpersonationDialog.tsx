/**
 * 🔐 StartImpersonationDialog — Modal to start impersonation session
 * 
 * Displays a confirmation dialog for superadmins to start
 * impersonating a specific tenant. Includes:
 * - Tenant info
 * - Optional reason input
 * - Clear security warning
 */

import React, { useState } from 'react';
import { Shield, AlertTriangle, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useI18n } from '@/contexts/I18nContext';
import { useNavigate } from 'react-router-dom';

interface StartImpersonationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

export function StartImpersonationDialog({
  open,
  onOpenChange,
  tenant,
}: StartImpersonationDialogProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { startImpersonation, isLoading } = useImpersonation();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = async () => {
    setIsSubmitting(true);
    try {
      const success = await startImpersonation(tenant.id, reason || undefined);
      if (success) {
        onOpenChange(false);
        setReason('');
        // Navigate to the tenant's app
        navigate(`/${tenant.slug}/app`, { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-warning" />
            {t('impersonation.confirmStart')}
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{tenant.name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning-foreground mb-1">
                {t('impersonation.confirmStartDesc')}
              </p>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>60 min TTL</span>
              </div>
            </div>
          </div>

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="reason">{t('impersonation.reasonLabel')}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('impersonation.reasonPlaceholder')}
              className="resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleStart}
            disabled={isSubmitting || isLoading}
            className="bg-warning hover:bg-warning/90 text-warning-foreground"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <Shield className="h-4 w-4 mr-2" />
                {t('impersonation.confirm')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export function MembershipSuccess() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { t } = useI18n();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const membershipId = searchParams.get('membership_id');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const confirmPayment = async () => {
      if (!membershipId || !sessionId) {
        setStatus('error');
        setMessage(t('membershipSuccess.invalidParams'));
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('confirm-membership-payment', {
          body: { sessionId, membershipId },
        });

        if (error) throw error;

        if (data?.success) {
          setStatus('success');
          setMessage(t('membershipSuccess.successMessage'));
        } else {
          setStatus('error');
          setMessage(data?.message || t('membershipSuccess.confirmError'));
        }
      } catch (error) {
        logger.error('Error confirming payment:', error);
        setStatus('error');
        setMessage(t('membershipSuccess.processError'));
      }
    };

    confirmPayment();
  }, [membershipId, sessionId, t]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AuthenticatedHeader
        tenantName={tenant?.name}
        tenantLogo={tenant?.logoUrl}
        tenantSlug={tenantSlug}
      />
      <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            {status === 'loading' && (
              <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
            )}
            {status === 'success' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
              </motion.div>
            )}
            {status === 'error' && (
              <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            )}
            
            <CardTitle className="text-2xl">
              {status === 'loading' && t('membershipSuccess.processing')}
              {status === 'success' && t('membershipSuccess.paymentConfirmed')}
              {status === 'error' && t('membershipSuccess.oops')}
            </CardTitle>
            <CardDescription className="text-base">
              {status === 'loading' && t('membershipSuccess.waitingPayment')}
              {status === 'success' && message}
              {status === 'error' && message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'success' && (
              <>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t('membershipSuccess.membershipStatus')}</p>
                  <p className="font-medium text-warning">{t('membershipSuccess.pendingApproval')}</p>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {t('membershipSuccess.pendingApprovalDesc').replace('{tenant}', tenant?.name || '')}
                </p>
                
                {/* Magic Link Info Section */}
                <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="font-medium mb-2">{t('membershipSuccess.accountCreated')}</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('membershipSuccess.accessViaEmail')}
                    <br />
                    <span className="font-medium">{t('membershipSuccess.noPasswordNeeded')}</span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/${tenantSlug}/login`)}
                  >
                    {t('membershipSuccess.requestAccessLink')}
                  </Button>
                </div>
              </>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => navigate(`/${tenantSlug}`)}
                variant={status === 'success' ? 'default' : 'outline'}
              >
                {t('membershipSuccess.backTo').replace('{tenant}', tenant?.name || '')}
              </Button>
              
              {status === 'error' && (
                <Button
                  onClick={() => navigate(`/${tenantSlug}/membership/new`)}
                  variant="default"
                >
                  {t('membershipSuccess.tryAgain')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </div>
    </div>
  );
}

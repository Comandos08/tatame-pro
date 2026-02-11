/**
 * 🔐 JOIN CONFIRM — Step 3: Confirm Affiliation Request
 * 
 * RULES:
 * - Creates membership with status PENDING
 * - NO roles are created here
 * - Redirects to /{tenantSlug}/membership/status
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, User, CheckCircle2, Loader2, ArrowLeft, AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';

import { useJoin } from '@/contexts/JoinContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import iconLogo from '@/assets/iconLogo.png';

export default function JoinConfirm() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const { selectedTenant, clearWizardState } = useJoin();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingMembership, setExistingMembership] = useState<{ id: string; status: string } | null>(null);
  const [checkingMembership, setCheckingMembership] = useState(true);

  // 🔐 Guard: Redirect if no tenant or not authenticated
  useEffect(() => {
    if (!selectedTenant) {
      navigate('/join/org', { replace: true });
      return;
    }
    
    if (!authLoading && !isAuthenticated) {
      navigate('/join/account', { replace: true });
    }
  }, [selectedTenant, isAuthenticated, authLoading, navigate]);

  // Check for existing membership
  useEffect(() => {
    const checkExisting = async () => {
      if (!currentUser?.id || !selectedTenant?.id) {
        setCheckingMembership(false);
        return;
      }

      try {
        // Check if user already has a membership with this tenant
        const { data, error } = await supabase
          .from('memberships')
          .select('id, status')
          .eq('tenant_id', selectedTenant.id)
          .eq('applicant_profile_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        setExistingMembership(data);
      } catch (error) {
        logger.error('Error checking existing membership:', error);
      } finally {
        setCheckingMembership(false);
      }
    };

    if (isAuthenticated) {
      checkExisting();
    }
  }, [currentUser?.id, selectedTenant?.id, isAuthenticated]);

  const handleSubmit = async () => {
    if (!confirmed || !selectedTenant || !currentUser) return;
    
    setIsSubmitting(true);

    try {
      // 🔐 Create membership with PENDING status
      const { error } = await supabase
        .from('memberships')
        .insert({
          tenant_id: selectedTenant.id,
          applicant_profile_id: currentUser.id,
          status: 'PENDING_REVIEW',
          type: 'FIRST_MEMBERSHIP',
          applicant_data: {
            name: currentUser.name,
            email: currentUser.email,
            created_via: 'join_wizard',
            requested_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single();

      if (error) throw error;

      toast({
        title: t('join.requestSubmitted'),
        description: t('join.requestSubmittedDesc'),
      });

      // Clear wizard state
      clearWizardState();

      // Redirect to status page
      navigate(`/${selectedTenant.slug}/membership/status`, { replace: true });
    } catch (error) {
      logger.error('Error creating membership:', error);
      toast({
        title: t('common.error'),
        description: t('join.submitError'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToExistingStatus = () => {
    if (selectedTenant) {
      clearWizardState();
      navigate(`/${selectedTenant.slug}/membership/status`, { replace: true });
    }
  };

  // Don't render until checks are complete
  if (!selectedTenant || authLoading || checkingMembership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user already has a membership
  if (existingMembership) {
    const statusLabel = t(`status.${existingMembership.status.toLowerCase().replace('_', '')}`);
    
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-md mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link to="/" className="inline-flex items-center gap-2 mb-6">
              <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
              <span className="font-display text-lg font-bold">TATAME</span>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <CardTitle>{t('join.existingMembershipTitle')}</CardTitle>
                <CardDescription>
                  {t('join.existingMembershipDesc').replace('{org}', selectedTenant.name)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground">{t('common.status')}</p>
                  <p className="font-medium">{statusLabel}</p>
                </div>
                
                <Button className="w-full" onClick={handleGoToExistingStatus}>
                  {t('join.viewMembershipStatus')}
                </Button>
                
                <Button variant="outline" className="w-full" onClick={() => navigate('/join/org')}>
                  {t('join.selectAnotherOrg')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AuthenticatedHeader tenantSlug={selectedTenant.slug} />
      <div className="container max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-display text-lg font-bold">TATAME</span>
          </Link>
          
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="h-2 w-8 rounded-full bg-primary" />
            <div className="h-2 w-8 rounded-full bg-primary" />
            <div className="h-2 w-8 rounded-full bg-primary" />
          </div>
          
          <h1 className="font-display text-2xl font-bold mb-2">
            {t('join.confirmTitle')}
          </h1>
          <p className="text-muted-foreground">
            {t('join.confirmDesc')}
          </p>
        </motion.div>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('join.summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* User info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('join.applicant')}</p>
                  <p className="font-medium">{currentUser?.name || currentUser?.email}</p>
                  <p className="text-xs text-muted-foreground">{currentUser?.email}</p>
                </div>
              </div>

              {/* Tenant info */}
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                  {selectedTenant.logoUrl ? (
                    <img
                      src={selectedTenant.logoUrl}
                      alt={selectedTenant.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('common.organization')}</p>
                  <p className="font-medium">{selectedTenant.name}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Confirmation checkbox */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <div className="flex items-start space-x-3 p-4 bg-muted/30 rounded-lg border">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked as boolean)}
            />
            <Label htmlFor="confirm" className="text-sm leading-relaxed cursor-pointer">
              {t('join.confirmCheckbox').replace('{org}', selectedTenant.name)}
            </Label>
          </div>
        </motion.div>

        {/* Submit button */}
        <div className="space-y-3">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={!confirmed || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('join.submitRequest')}
              </>
            )}
          </Button>
          
          <Button variant="ghost" className="w-full" onClick={() => navigate('/join/account')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>

        {/* Info note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('join.pendingNote')}
            </AlertDescription>
          </Alert>
        </motion.div>
      </div>
    </div>
  );
}

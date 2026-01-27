/**
 * 🚀 TENANT ONBOARDING — First Run Wizard
 * 
 * Guides new tenant admins through initial setup.
 * Required steps: Academy, Grading Scheme
 * Optional: Coaches, Staff
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Users, Award, Settings, 
  CheckCircle2, Circle, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, PartyPopper
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OnboardingStatus {
  hasAcademy: boolean;
  hasCoach: boolean;
  hasGradingScheme: boolean;
  academyCount: number;
  coachCount: number;
  gradingSchemeCount: number;
}

type Step = 'welcome' | 'academies' | 'coaches' | 'grading' | 'review';

const STEPS: Step[] = ['welcome', 'academies', 'coaches', 'grading', 'review'];

export default function TenantOnboarding() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tenant } = useTenant();
  const { session } = useImpersonation();
  const impersonationId = session?.impersonationId;
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<Step>('welcome');

  // Fetch onboarding status
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['onboarding-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const [academyResult, coachResult, gradingResult] = await Promise.all([
        supabase.from('academies').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('coaches').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('grading_schemes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
      ]);

      return {
        hasAcademy: (academyResult.count ?? 0) >= 1,
        hasCoach: (coachResult.count ?? 0) >= 1,
        hasGradingScheme: (gradingResult.count ?? 0) >= 1,
        academyCount: academyResult.count ?? 0,
        coachCount: coachResult.count ?? 0,
        gradingSchemeCount: gradingResult.count ?? 0,
      } as OnboardingStatus;
    },
    enabled: !!tenant?.id,
    refetchInterval: 5000, // Refresh every 5s to catch changes from other tabs
  });

  // Complete onboarding mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('complete-tenant-onboarding', {
        body: { 
          tenantId: tenant?.id,
          impersonationId,
        },
        headers: {
          ...(impersonationId && { 'x-impersonation-id': impersonationId }),
        },
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.ok) throw new Error(response.data?.error || 'Failed to complete onboarding');

      return response.data;
    },
    onSuccess: () => {
      toast.success(t('onboarding.completedSuccess'));
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      navigate(`/${tenant?.slug}/app`, { replace: true });
    },
    onError: (error) => {
      toast.error(error.message || t('onboarding.completedError'));
    },
  });

  const canComplete = status?.hasAcademy && status?.hasGradingScheme;
  const stepIndex = STEPS.indexOf(currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex]);
    }
  };

  const handlePrev = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex]);
    }
  };

  const handleNavigateToSetup = (path: string) => {
    // Navigate to setup pages, they'll handle creating items
    navigate(`/${tenant?.slug}/app/${path}`);
  };

  if (!tenant) return null;

  if (isLoading) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const stepConfig = {
    welcome: {
      icon: Settings,
      title: t('onboarding.welcomeTitle'),
      description: t('onboarding.welcomeDesc').replace('{name}', tenant.name),
    },
    academies: {
      icon: Building2,
      title: t('onboarding.academiesTitle'),
      description: t('onboarding.academiesDesc'),
      required: true,
      complete: status?.hasAcademy,
      count: status?.academyCount,
      setupPath: 'academies',
    },
    coaches: {
      icon: Users,
      title: t('onboarding.coachesTitle'),
      description: t('onboarding.coachesDesc'),
      required: false,
      complete: status?.hasCoach,
      count: status?.coachCount,
      setupPath: 'coaches',
    },
    grading: {
      icon: Award,
      title: t('onboarding.gradingTitle'),
      description: t('onboarding.gradingDesc'),
      required: true,
      complete: status?.hasGradingScheme,
      count: status?.gradingSchemeCount,
      setupPath: 'grading-schemes',
    },
    review: {
      icon: PartyPopper,
      title: t('onboarding.reviewTitle'),
      description: t('onboarding.reviewDesc'),
    },
  };

  const current = stepConfig[currentStep];
  const IconComponent = current.icon;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-2xl font-bold mb-2 flex items-center gap-3">
            <Settings className="h-7 w-7 text-primary" />
            {t('onboarding.title')}
          </h1>
          <p className="text-muted-foreground">{t('onboarding.subtitle')}</p>
        </motion.div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{t('onboarding.step')} {stepIndex + 1} / {STEPS.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-2">
          {STEPS.map((step, idx) => {
            const config = stepConfig[step];
            const isComplete = 'complete' in config && config.complete;
            const isCurrent = step === currentStep;
            
            return (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all ${
                  isCurrent 
                    ? 'border-primary bg-primary text-primary-foreground' 
                    : isComplete
                    ? 'border-green-500 bg-green-500/10 text-green-500'
                    : 'border-muted bg-muted/50 text-muted-foreground'
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{idx + 1}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardHeader className="text-center pb-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <IconComponent className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="text-xl">{current.title}</CardTitle>
                <CardDescription className="text-base">{current.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Welcome step */}
                {currentStep === 'welcome' && (
                  <div className="space-y-4">
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {t('onboarding.welcomeAlert')}
                      </AlertDescription>
                    </Alert>
                    <div className="grid gap-2">
                      {[
                        { step: 'academies', required: true, complete: status?.hasAcademy },
                        { step: 'coaches', required: false, complete: status?.hasCoach },
                        { step: 'grading', required: true, complete: status?.hasGradingScheme },
                      ].map(item => (
                        <div 
                          key={item.step}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                        >
                          {item.complete ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          )}
                          <span className="flex-1">{stepConfig[item.step as Step].title}</span>
                          {item.required && (
                            <span className="text-xs text-destructive font-medium">
                              {t('common.required')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Setup steps */}
                {['academies', 'coaches', 'grading'].includes(currentStep) && (
                  <div className="space-y-4">
                    <div className="text-center p-6 bg-muted/30 rounded-lg">
                      {'count' in current && (
                        <div className="text-4xl font-bold text-primary mb-2">
                          {current.count}
                        </div>
                      )}
                      <p className="text-muted-foreground">
                        {'complete' in current && current.complete 
                          ? t('onboarding.stepComplete') 
                          : t('onboarding.stepPending')}
                      </p>
                    </div>
                    
                    {'required' in current && current.required && !('complete' in current && current.complete) && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {t('onboarding.requiredStep')}
                        </AlertDescription>
                      </Alert>
                    )}

                    {'setupPath' in current && (
                      <Button 
                        className="w-full"
                        onClick={() => handleNavigateToSetup(current.setupPath)}
                      >
                        {'complete' in current && current.complete 
                          ? t('onboarding.manageItems')
                          : t('onboarding.setupNow')}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                )}

                {/* Review step */}
                {currentStep === 'review' && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      {[
                        { key: 'academies', label: t('onboarding.academiesTitle'), count: status?.academyCount, complete: status?.hasAcademy, required: true },
                        { key: 'coaches', label: t('onboarding.coachesTitle'), count: status?.coachCount, complete: status?.hasCoach, required: false },
                        { key: 'grading', label: t('onboarding.gradingTitle'), count: status?.gradingSchemeCount, complete: status?.hasGradingScheme, required: true },
                      ].map(item => (
                        <div 
                          key={item.key}
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                            item.complete ? 'bg-primary/10' : item.required ? 'bg-destructive/10' : 'bg-muted/50'
                          }`}
                        >
                          {item.complete ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <AlertCircle className={`h-5 w-5 ${item.required ? 'text-destructive' : 'text-muted-foreground'}`} />
                          )}
                          <span className="flex-1">{item.label}</span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                      ))}
                    </div>

                    {!canComplete && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {t('onboarding.cannotComplete')}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button 
                      className="w-full" 
                      size="lg"
                      disabled={!canComplete || completeMutation.isPending}
                      onClick={() => completeMutation.mutate()}
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <PartyPopper className="h-4 w-4 mr-2" />
                      )}
                      {t('onboarding.completeSetup')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={handlePrev}
            disabled={stepIndex === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          
          {currentStep !== 'review' && (
            <Button onClick={handleNext}>
              {t('common.next')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

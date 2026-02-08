/**
 * 🚀 TENANT ONBOARDING — First Run Wizard
 * 
 * P3.1 — COMPLETE ONBOARDING FLOW WITH SPORT TYPE SELECTION
 * 
 * Required steps:
 * 1. Welcome
 * 2. Sport Types (REQUIRED - at least 1)
 * 3. Academies (REQUIRED - at least 1)
 * 4. Grading Schemes (REQUIRED - at least 1)
 * 5. Coaches (optional)
 * 6. Review & Activate
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, Users, Award, Settings, 
  CheckCircle2, Circle, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, PartyPopper, Medal
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SportType } from '@/types/tenant';

// Available sport types
const AVAILABLE_SPORT_TYPES: SportType[] = [
  'Jiu-Jitsu',
  'Judo',
  'Muay Thai',
  'Wrestling',
  'Boxing',
  'Karate',
  'Taekwondo',
  'MMA',
  'Sambo',
  'Krav Maga',
];

interface OnboardingStatus {
  hasSportTypes: boolean;
  hasAcademy: boolean;
  hasCoach: boolean;
  hasGradingScheme: boolean;
  sportTypesCount: number;
  academyCount: number;
  coachCount: number;
  gradingSchemeCount: number;
  selectedSportTypes: string[];
}

type Step = 'welcome' | 'sport-types' | 'academies' | 'coaches' | 'grading' | 'review';

const STEPS: Step[] = ['welcome', 'sport-types', 'academies', 'coaches', 'grading', 'review'];

export default function TenantOnboarding() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { tenant, refetchTenant } = useTenant();
  const { session } = useImpersonation();
  const impersonationId = session?.impersonationId;
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [selectedSportTypes, setSelectedSportTypes] = useState<SportType[]>([]);
  const [isSavingSports, setIsSavingSports] = useState(false);

  // Fetch onboarding status
  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['onboarding-status', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;

      const [academyResult, coachResult, gradingResult, tenantData] = await Promise.all([
        supabase.from('academies').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('coaches').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('grading_schemes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true),
        supabase.from('tenants').select('sport_types').eq('id', tenant.id).single(),
      ]);

      const sportTypes = (tenantData.data?.sport_types || []) as string[];

      return {
        hasSportTypes: sportTypes.length > 0,
        hasAcademy: (academyResult.count ?? 0) >= 1,
        hasCoach: (coachResult.count ?? 0) >= 1,
        hasGradingScheme: (gradingResult.count ?? 0) >= 1,
        sportTypesCount: sportTypes.length,
        academyCount: academyResult.count ?? 0,
        coachCount: coachResult.count ?? 0,
        gradingSchemeCount: gradingResult.count ?? 0,
        selectedSportTypes: sportTypes,
      } as OnboardingStatus;
    },
    enabled: !!tenant?.id,
    refetchInterval: 5000,
  });

  // Initialize selected sport types from status
  useEffect(() => {
    if (status?.selectedSportTypes && status.selectedSportTypes.length > 0) {
      setSelectedSportTypes(status.selectedSportTypes as SportType[]);
    }
  }, [status?.selectedSportTypes]);

  // Save sport types mutation
  const saveSportTypesMutation = useMutation({
    mutationFn: async (sportTypes: SportType[]) => {
      if (!tenant?.id) throw new Error('No tenant');
      
      const { error } = await supabase
        .from('tenants')
        .update({ 
          sport_types: sportTypes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('onboarding.sportTypesSaved'));
      refetch();
    },
    onError: (error) => {
      toast.error(t('onboarding.sportTypesError'));
      console.error('[ONBOARDING] Sport types save error:', error);
    },
  });

  // Complete onboarding mutation (SETUP → ACTIVE)
  const completeMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

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
      toast.success(t('onboarding.activatedSuccess'));
      
      // Force TenantContext to reload data
      refetchTenant();
      
      // Invalidate React Query caches
      queryClient.invalidateQueries({ queryKey: ['onboarding-status', tenant?.id] });
      
      // Navigate with replace to prevent back-button loop
      navigate(`/${tenant?.slug}/app`, { replace: true });
    },
    onError: (error) => {
      toast.error(error.message || t('onboarding.completedError'));
    },
  });

  const handleSportTypeToggle = (sportType: SportType) => {
    setSelectedSportTypes(prev => 
      prev.includes(sportType)
        ? prev.filter(s => s !== sportType)
        : [...prev, sportType]
    );
  };

  const handleSaveSportTypes = async () => {
    if (selectedSportTypes.length === 0) {
      toast.error(t('onboarding.sportTypesRequired'));
      return;
    }
    setIsSavingSports(true);
    try {
      await saveSportTypesMutation.mutateAsync(selectedSportTypes);
    } finally {
      setIsSavingSports(false);
    }
  };

  const canComplete = status?.hasSportTypes && status?.hasAcademy && status?.hasGradingScheme;
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
    'sport-types': {
      icon: Medal,
      title: t('onboarding.sportTypesTitle'),
      description: t('onboarding.sportTypesDesc'),
      required: true,
      complete: status?.hasSportTypes,
      count: status?.sportTypesCount,
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

        {/* Step indicators with required highlight */}
        <div className="flex justify-center gap-2">
          {STEPS.map((step, idx) => {
            const config = stepConfig[step];
            const isComplete = 'complete' in config && config.complete;
            const isCurrent = step === currentStep;
            const isRequired = 'required' in config && config.required;
            const isRequiredIncomplete = isRequired && !isComplete;
            
            return (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className={`relative flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all ${
                  isCurrent 
                    ? 'border-primary bg-primary text-primary-foreground' 
                    : isComplete
                    ? 'border-green-500 bg-green-500/10 text-green-500'
                    : isRequiredIncomplete
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-muted bg-muted/50 text-muted-foreground'
                }`}
                title={isRequiredIncomplete ? t('onboarding.requiredStep') : undefined}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{idx + 1}</span>
                )}
                {/* Badge indicator for required incomplete */}
                {isRequiredIncomplete && !isCurrent && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                    !
                  </span>
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
                        { step: 'sport-types', required: true, complete: status?.hasSportTypes },
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

                {/* Sport Types step */}
                {currentStep === 'sport-types' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {AVAILABLE_SPORT_TYPES.map(sportType => (
                        <div
                          key={sportType}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedSportTypes.includes(sportType)
                              ? 'border-primary bg-primary/10'
                              : 'border-muted bg-muted/30 hover:border-muted-foreground/30'
                          }`}
                          onClick={() => handleSportTypeToggle(sportType)}
                        >
                          <Checkbox
                            id={sportType}
                            checked={selectedSportTypes.includes(sportType)}
                            onCheckedChange={() => handleSportTypeToggle(sportType)}
                          />
                          <Label 
                            htmlFor={sportType} 
                            className="flex-1 cursor-pointer font-medium"
                          >
                            {sportType}
                          </Label>
                        </div>
                      ))}
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      {selectedSportTypes.length} {t('onboarding.sportTypesSelected')}
                    </div>

                    {selectedSportTypes.length === 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {t('onboarding.sportTypesRequired')}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button 
                      className="w-full"
                      disabled={selectedSportTypes.length === 0 || isSavingSports}
                      onClick={handleSaveSportTypes}
                    >
                      {isSavingSports ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                      )}
                      {t('onboarding.saveSportTypes')}
                    </Button>
                  </div>
                )}

                {/* Setup steps (academies, coaches, grading) */}
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
                        { key: 'sport-types', label: t('onboarding.sportTypesTitle'), count: status?.sportTypesCount, complete: status?.hasSportTypes, required: true },
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
                      {t('onboarding.activateOrganization')}
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
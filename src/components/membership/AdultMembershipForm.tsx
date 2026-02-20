import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Upload, Loader2, Check, CreditCard, Clock } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AuthenticatedHeader } from '@/components/auth/AuthenticatedHeader';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { logMembershipEvent } from '@/lib/analytics/membershipAnalytics';
import { TurnstileWidget, TurnstileError } from '@/components/security/TurnstileWidget';
import {
  saveMembershipResume,
  restoreMembershipResume,
  clearMembershipResume,
  logMembershipResumeEvent,
  extractResumeStepFromStorage,
  cleanupLegacyKey,
} from '@/lib/membership/membershipSessionPersistence';
import { useBillingOverride } from '@/hooks/useBillingOverride';
import { ManualOverrideBanner } from '@/components/billing/ManualOverrideBanner';
import { formatCurrency } from '@/lib/i18n/formatters';
import {
  AthleteFormData,
  GenderType,
  MEMBERSHIP_PRICE_CENTS,
  MEMBERSHIP_CURRENCY,
} from '@/types/membership';
import type { AdultMembershipInsert, DocumentUploaded } from '@/types/membership-insert';

// ✅ FX-01 — Draft persistence uses unified membershipSessionPersistence
// Legacy STORAGE_KEY kept only for one-time migration
// Legacy keys cleaned up on mount

export function AdultMembershipForm() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [_searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { t, locale } = useI18n();
  const { currentUser, isAuthenticated, isLoading: _authLoading } = useCurrentUser();
  const { isManualOverride, canUseStripe, overrideReason, overrideAt } = useBillingOverride();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [athleteData, setAthleteData] = useState<AthleteFormData | null>(null);
  const [documents, setDocuments] = useState<{ idDocument?: File; medicalCertificate?: File }>({});
  const [_membershipId, setMembershipId] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);

  // R-01: Dedup guards for analytics events
  const formStartedRef = useRef(false);
  const lastStepLoggedRef = useRef(0);

  // R-01: MEMBERSHIP_FORM_STARTED on first render
  useEffect(() => {
    if (formStartedRef.current || !tenantSlug) return;
    formStartedRef.current = true;
    logMembershipEvent('MEMBERSHIP_FORM_STARTED', {
      tenantSlug,
      membershipType: 'adult',
      step: 1,
      timestamp: Date.now(),
    });
  }, [tenantSlug]);

  const stepOneSchema = z.object({
    fullName: z.string().min(3, t('membership.validation.nameMin')),
    birthDate: z.string().min(1, t('membership.validation.birthDateRequired')),
    nationalId: z.string().min(1, t('membership.validation.documentRequired')),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    email: z.string().email(t('membership.validation.emailInvalid')),
    phone: z.string().min(10, t('membership.validation.phoneInvalid')),
    addressLine1: z.string().min(5, t('membership.validation.addressRequired')),
    addressLine2: z.string().optional(),
    city: z.string().min(2, t('membership.validation.cityRequired')),
    state: z.string().min(2, t('membership.validation.stateRequired')),
    postalCode: z.string().min(5, t('membership.validation.postalCodeRequired')),
    country: z.string().default('BR'),
  });

  const STEPS = [
    { id: 1, title: t('membership.stepPersonalData') },
    { id: 2, title: t('membership.stepDocuments') },
    { id: 3, title: t('membership.stepPayment') },
  ];

  const GENDER_LABELS: Record<GenderType, string> = {
    MALE: t('membership.male'),
    FEMALE: t('membership.female'),
    OTHER: t('membership.other'),
  };

  const form = useForm<z.infer<typeof stepOneSchema>>({
    resolver: zodResolver(stepOneSchema),
    defaultValues: {
      fullName: '',
      birthDate: '',
      nationalId: '',
      gender: 'MALE',
      email: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'BR',
    },
  });

  // ✅ FX-01A — Restore form state from unified persistence on mount
  // Legacy keys cleaned AFTER restore attempt (never before)
  useEffect(() => {
    if (!tenantSlug) return;

    // 1. Attempt restore FIRST (before any legacy cleanup)
    const result = restoreMembershipResume('adult', tenantSlug);

    // FX-01A: Log with actual stored step for non-success outcomes
    const logStep = result.data?.step
      ?? (result.outcome !== 'not_found' ? extractResumeStepFromStorage('adult') : 0);

    logMembershipResumeEvent(tenantSlug, 'adult', logStep, result.outcome);

    // 2. NOW safe to clean legacy keys (restore already attempted)
    cleanupLegacyKey('tatame.membership.adult.draft');
    cleanupLegacyKey('membershipFormData');

    // FX-01A: Fail-closed — redirect to start page on non-recoverable outcomes
    if (result.outcome === 'expired' || result.outcome === 'tenant_mismatch' || result.outcome === 'invalid') {
      toast.info('Sua sessão expirou. Por favor, reinicie sua inscrição.');
      navigate(`/${tenantSlug}/membership`, { replace: true });
      return;
    }

    if (result.outcome !== 'success' || !result.data) return;

    // Restore step
    if (result.data.step > 1) {
      setStep(result.data.step);
    }

    // Restore athleteData
    const restoredAthleteData = result.data.formData as unknown as AthleteFormData;
    if (restoredAthleteData?.fullName) {
      setAthleteData(restoredAthleteData);
      form.reset(restoredAthleteData);
    }
  }, [tenantSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ FX-01 — Persist form state on step/data changes
  useEffect(() => {
    if (!tenantSlug) return;
    if (step === 1 && !athleteData) return;

    saveMembershipResume({
      membershipType: 'adult',
      step,
      formData: (athleteData ?? {}) as Record<string, unknown>,
      tenantSlug,
      timestamp: Date.now(),
    });
  }, [step, athleteData, tenantSlug]);

  const handleStepOneSubmit = async (data: z.infer<typeof stepOneSchema>) => {
    // Check if adult (18+)
    const birthDate = new Date(data.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const isAdult = age > 18 || (age === 18 && monthDiff >= 0);

    if (!isAdult) {
      toast.error(t('membership.errorAdultAge'));
      return;
    }

    setAthleteData(data as AthleteFormData);
    setStep(2);
    // R-01: Log step completion
    if (tenantSlug && lastStepLoggedRef.current < 1) {
      lastStepLoggedRef.current = 1;
      logMembershipEvent('MEMBERSHIP_STEP_COMPLETED', { tenantSlug, membershipType: 'adult', step: 1, timestamp: Date.now() });
    }
  };

  const handleDocumentUpload = (type: 'idDocument' | 'medicalCertificate', file: File | null) => {
    if (file) {
      setDocuments(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleStepTwoSubmit = () => {
    if (!documents.idDocument) {
      toast.error(t('membership.errorIdDocument'));
      return;
    }
    setStep(3);
    // R-01: Log step completion
    if (tenantSlug && lastStepLoggedRef.current < 2) {
      lastStepLoggedRef.current = 2;
      logMembershipEvent('MEMBERSHIP_STEP_COMPLETED', { tenantSlug, membershipType: 'adult', step: 2, timestamp: Date.now() });
    }
  };

  const handlePayment = async () => {
    // SAFE GOLD: Bloquear Stripe quando override manual ativo
    if (!canUseStripe) {
      toast.error(t('billing.stripeDisabled'));
      return;
    }
    
    if (!tenant || !athleteData) return;

    // FX-02A: Defensive safety — user MUST already be authenticated (no toast, no persistence)
    if (!isAuthenticated || !currentUser) {
      logger.warn('[FX-02A] Unauthenticated user reached checkout — fail-closed redirect');
      navigate(`/${tenantSlug}/login?redirect=${encodeURIComponent(`/${tenantSlug}/membership/adult`)}`, { replace: true });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Upload documentos para path temporário tmp/{userId}/{timestamp}/
      const documentsUploaded: DocumentUploaded[] = [];
      const timestamp = Date.now();

      if (documents.idDocument) {
        const storagePath = `tmp/${currentUser.id}/${timestamp}/id_document`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, documents.idDocument);

        if (uploadError) {
          logger.error('Upload error:', uploadError);
          toast.error(t('membership.errorIdDocument'));
          setIsLoading(false);
          return;
        }

        documentsUploaded.push({
          type: 'ID_DOCUMENT',
          storage_path: storagePath,
          file_type: documents.idDocument.type,
        });
      }

      if (documents.medicalCertificate) {
        const storagePath = `tmp/${currentUser.id}/${timestamp}/medical_certificate`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, documents.medicalCertificate);

        if (uploadError) {
          logger.error('Upload error:', uploadError);
          toast.error(t('membership.errorGeneric'));
          setIsLoading(false);
          return;
        }

        documentsUploaded.push({
          type: 'MEDICAL_CERTIFICATE',
          storage_path: storagePath,
          file_type: documents.medicalCertificate.type,
        });
      }

      // FX-01B: Check for existing DRAFT — strictly scoped to user + tenant + adult flow
      const { data: allDrafts } = await supabase
        .from('memberships')
        .select('id, applicant_data')
        .eq('tenant_id', tenant.id)
        .eq('applicant_profile_id', currentUser.id)
        .eq('status', 'DRAFT')
        .eq('type', 'FIRST_MEMBERSHIP')
        .order('created_at', { ascending: false })
        .limit(10);

      // FX-01B: Filter out youth drafts (is_minor === true) to avoid cross-flow reuse
      const adultDrafts = (allDrafts ?? []).filter((d) => {
        const ad = d.applicant_data as Record<string, unknown> | null;
        return !ad || ad.is_minor !== true;
      });

      const existingDraft = adultDrafts[0] ?? null;
      if (adultDrafts.length > 1) {
        logger.warn('[FX-01B] Multiple adult DRAFT memberships found, using most recent', {
          count: adultDrafts.length,
          selectedId: adultDrafts[0].id,
        });
      }

      // ================================================================
      // C3: Upsert athlete as ASPIRANTE before membership
      // ================================================================
      let athleteId: string | null = null;
      try {
        const { data: existingAthletes } = await supabase
          .from('athletes')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('profile_id', currentUser.id)
          .limit(1);

        if (existingAthletes?.[0]) {
          athleteId = existingAthletes[0].id;
          logger.info('[C3] Existing athlete found', { athleteId });
        } else {
          const { data: newAthlete, error: athleteError } = await supabase
            .from('athletes')
            .insert({
              tenant_id: tenant.id,
              profile_id: currentUser.id,
              full_name: athleteData.fullName,
              birth_date: athleteData.birthDate,
              national_id: athleteData.nationalId,
              gender: athleteData.gender,
              email: athleteData.email,
              phone: athleteData.phone,
              address_line1: athleteData.addressLine1,
              address_line2: athleteData.addressLine2 || null,
              city: athleteData.city,
              state: athleteData.state,
              postal_code: athleteData.postalCode,
              country: athleteData.country,
              status: 'ASPIRANTE' as any,
            } as any)
            .select('id')
            .single();

          if (athleteError) {
            logger.error('[C3] Failed to create athlete (non-fatal)', athleteError);
          } else {
            athleteId = newAthlete.id;
            logger.info('[C3] Athlete created as ASPIRANTE', { athleteId });
          }
        }
      } catch (err) {
        logger.error('[C3] Athlete upsert error (non-fatal)', err);
      }

      let membershipId: string;

      if (existingDraft?.id) {
        // Reuse existing DRAFT
        membershipId = existingDraft.id;
        logger.info('[FX-01] Reusing existing DRAFT membership', { membershipId });
        // C3: Update draft with athlete_id if available
        if (athleteId) {
          await supabase.from('memberships').update({ athlete_id: athleteId } as any).eq('id', membershipId);
        }
      } else {
        // 2. Criar membership COM applicant_data + athlete_id
        const membershipPayload: AdultMembershipInsert = {
          tenant_id: tenant.id,
          athlete_id: athleteId,
          applicant_profile_id: currentUser.id,
          applicant_data: {
            full_name: athleteData.fullName,
            birth_date: athleteData.birthDate,
            national_id: athleteData.nationalId,
            gender: athleteData.gender,
            email: athleteData.email,
            phone: athleteData.phone,
            address_line1: athleteData.addressLine1,
            address_line2: athleteData.addressLine2 || null,
            city: athleteData.city,
            state: athleteData.state,
            postal_code: athleteData.postalCode,
            country: athleteData.country,
          },
          documents_uploaded: documentsUploaded,
          status: 'DRAFT',
          type: 'FIRST_MEMBERSHIP',
          price_cents: MEMBERSHIP_PRICE_CENTS,
          currency: MEMBERSHIP_CURRENCY,
          payment_status: 'NOT_PAID',
        };

        const { data: membership, error: membershipError } = await supabase
          .from('memberships')
          .insert(membershipPayload as unknown as Database['public']['Tables']['memberships']['Insert'])
          .select()
          .single();

        if (membershipError) throw membershipError;
        membershipId = membership.id;
      }

      setMembershipId(membershipId);

      // R-01: Log payment initiation
      if (tenantSlug) {
        logMembershipEvent('MEMBERSHIP_PAYMENT_INITIATED', { tenantSlug, membershipType: 'adult', timestamp: Date.now() });
      }

      // 3. Criar Stripe checkout session
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        'create-membership-checkout',
        {
          body: {
            membershipId: membershipId,
            tenantSlug: tenantSlug,
            successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
            cancelUrl: `${window.location.origin}/${tenantSlug}/membership/adult`,
            captchaToken: captchaToken,
          },
        }
      );

      if (checkoutError) throw checkoutError;

      if (checkoutData?.error) {
        if (checkoutData.captchaRequired) {
          setCaptchaError(checkoutData.error);
          setCaptchaToken(null);
          throw new Error(checkoutData.error);
        }
        throw new Error(checkoutData.error);
      }

      if (checkoutData?.url) {
        clearMembershipResume('adult'); // ✅ FX-01 — Clear only after checkout success
        window.location.href = checkoutData.url;
      } else {
        throw new Error(t('membership.errorPaymentSession'));
      }
    } catch (error: unknown) {
      logger.error('Error:', error);
      const errorMessage = error instanceof Error ? error.message : t('membership.errorGeneric');
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <AuthenticatedHeader
        {...(tenant?.name ? { tenantName: tenant.name } : {})}
        tenantLogo={tenant?.logoUrl ?? null}
        {...(tenantSlug ? { tenantSlug } : {})}
      />
      <div className="container max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step > 1 ? setStep(step - 1) : navigate(`/${tenantSlug}/membership/new`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-2">
            {t('membership.adultTitle')}
          </h1>
          <p className="text-muted-foreground">
            {tenant?.name}
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, _index) => (
            <React.Fragment key={s.id}>
...
            </React.Fragment>
          ))}
        </div>

        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('membership.personalDataTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.personalDataDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleStepOneSubmit)} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t('membership.fullName')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.fullNamePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="birthDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.birthDate')}</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="gender"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.gender')}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t('membership.selectPlaceholder')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(GENDER_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="nationalId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.nationalIdLabel')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.nationalIdPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('common.email')}</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder={t('membership.emailPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('common.phone')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.phonePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="sm:col-span-2 pt-4">
                          <h3 className="text-sm font-medium mb-4">{t('membership.addressSection')}</h3>
                        </div>

                        <FormField
                          control={form.control}
                          name="addressLine1"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t('membership.addressLine1')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.addressPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="addressLine2"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t('membership.addressLine2')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.complementPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.city')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.cityPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.state')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.statePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="postalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.postalCode')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.postalCodePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="pt-4">
                        <Button type="submit" className="w-full" variant="tenant">
                          {t('membership.proceed')}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('membership.documentsTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.documentsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>{t('membership.idDocumentLabel')}</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        id="idDocument"
                        onChange={(e) => handleDocumentUpload('idDocument', e.target.files?.[0] || null)}
                      />
                      <label htmlFor="idDocument" className="cursor-pointer">
                        {documents.idDocument ? (
                          <div className="flex items-center justify-center gap-2 text-success">
                            <Check className="h-5 w-5" />
                            <span>{documents.idDocument.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {t('membership.uploadHint')}
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('membership.medicalCertLabel')}</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        id="medicalCertificate"
                        onChange={(e) => handleDocumentUpload('medicalCertificate', e.target.files?.[0] || null)}
                      />
                      <label htmlFor="medicalCertificate" className="cursor-pointer">
                        {documents.medicalCertificate ? (
                          <div className="flex items-center justify-center gap-2 text-success">
                            <Check className="h-5 w-5" />
                            <span>{documents.medicalCertificate.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {t('membership.uploadHint')}
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <Button onClick={handleStepTwoSubmit} className="w-full" variant="tenant">
                    {t('membership.proceed')}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('membership.summaryTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.summaryDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* SAFE GOLD: Banner de override manual */}
                  {isManualOverride && (
                    <ManualOverrideBanner reason={overrideReason} appliedAt={overrideAt} />
                  )}
                  
                  {athleteData && (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryName')}</p>
                          <p className="font-medium">{athleteData.fullName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryEmail')}</p>
                          <p className="font-medium">{athleteData.email}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryDocument')}</p>
                          <p className="font-medium">{athleteData.nationalId}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryPhone')}</p>
                          <p className="font-medium">{athleteData.phone}</p>
                        </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <p className="text-muted-foreground text-sm">{t('membership.summaryAddress')}</p>
                        <p className="font-medium">
                          {athleteData.addressLine1}
                          {athleteData.addressLine2 && `, ${athleteData.addressLine2}`}
                          <br />
                          {athleteData.city} - {athleteData.state}, {athleteData.postalCode}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted-foreground">{t('membership.annualMembership')} - {tenant?.name}</span>
                      <span className="font-display font-bold text-lg">
                        {formatCurrency(MEMBERSHIP_PRICE_CENTS, locale)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('membership.validFor12Months')}
                    </p>
                  </div>

                  {/* Security verification (CAPTCHA) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('membership.securityVerification') || 'Verificação de Segurança'}</Label>
                    <TurnstileWidget
                      onSuccess={(token) => {
                        setCaptchaToken(token);
                        setCaptchaError(null);
                      }}
                      onError={(error) => {
                        setCaptchaError(error);
                        setCaptchaToken(null);
                      }}
                      onExpire={() => {
                        setCaptchaToken(null);
                      }}
                    />
                    {captchaError && <TurnstileError message={captchaError} />}
                  </div>

                  {/* R-02: Expectation card */}
                  <Card className="bg-muted/50 border-border">
                    <CardContent className="flex items-start gap-3 p-4">
                      <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{t('membership.expectation.title')}</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line mt-1">{t('membership.expectation.body')}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    onClick={handlePayment}
                    disabled={isLoading || !captchaToken || isManualOverride}
                    className="w-full"
                    size="lg"
                    variant="tenant"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('membership.processing')}
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {t('membership.payAndFinish')}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    {t('membership.expectation.security')}
                  </p>

                  <p className="text-xs text-muted-foreground text-center">
                    {t('membership.redirectHint')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

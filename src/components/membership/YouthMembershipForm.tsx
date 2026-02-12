import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Upload, Loader2, Check, CreditCard } from 'lucide-react';
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
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
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
import { formatCurrency, formatDate } from '@/lib/i18n/formatters';
import {
  AthleteFormData,
  GuardianFormData,
  GenderType,
  GuardianRelationship,
  MEMBERSHIP_PRICE_CENTS,
  MEMBERSHIP_CURRENCY,
} from '@/types/membership';
import type { YouthMembershipInsert, DocumentUploaded } from '@/types/membership-insert';

export function YouthMembershipForm() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [_searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { t, locale } = useI18n();
  const { currentUser, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [guardianData, setGuardianData] = useState<GuardianFormData | null>(null);
  const [athleteData, setAthleteData] = useState<AthleteFormData | null>(null);
  const [documents, setDocuments] = useState<{ idDocument?: File; medicalCertificate?: File }>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const { isManualOverride, canUseStripe, overrideReason, overrideAt } = useBillingOverride();

  // ✅ FX-01A — Deterministic restore from unified persistence
  // Legacy keys cleaned AFTER restore attempt (never before)
  useEffect(() => {
    if (!tenantSlug) return;

    // 1. Attempt restore FIRST
    const result = restoreMembershipResume('youth', tenantSlug);

    // FX-01A: Log with actual stored step for non-success outcomes
    const logStep = result.data?.step
      ?? (result.outcome !== 'not_found' ? extractResumeStepFromStorage('youth') : 0);

    logMembershipResumeEvent(tenantSlug, 'youth', logStep, result.outcome);

    // 2. NOW safe to clean legacy keys
    cleanupLegacyKey('membershipYouthFormData');

    // FX-01A: Fail-closed — redirect to start page on non-recoverable outcomes
    if (result.outcome === 'expired' || result.outcome === 'tenant_mismatch' || result.outcome === 'invalid') {
      toast.info('Sua sessão expirou. Por favor, reinicie sua inscrição.');
      navigate(`/${tenantSlug}/membership`, { replace: true });
      return;
    }

    if (result.outcome !== 'success' || !result.data) return;

    if (result.data.step > 1) setStep(result.data.step);
    const fd = result.data.formData as Record<string, unknown>;
    if (fd?.fullName) setAthleteData(fd as unknown as AthleteFormData);
    if (result.data.guardianData) setGuardianData(result.data.guardianData as unknown as GuardianFormData);
  }, [tenantSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ FX-01 — Persist on step/data changes
  useEffect(() => {
    if (!tenantSlug) return;
    if (step === 1 && !guardianData) return;

    saveMembershipResume({
      membershipType: 'youth',
      step,
      formData: (athleteData ?? {}) as Record<string, unknown>,
      guardianData: guardianData as unknown as Record<string, unknown> | null,
      tenantSlug,
      timestamp: Date.now(),
    });
  }, [step, athleteData, guardianData, tenantSlug]);

  const guardianSchema = z.object({
    fullName: z.string().min(3, t('membership.validation.nameMin')),
    nationalId: z.string().min(1, t('membership.validation.documentRequired')),
    email: z.string().email(t('membership.validation.emailInvalid')),
    phone: z.string().min(10, t('membership.validation.phoneInvalid')),
    relationship: z.enum(['PARENT', 'GUARDIAN', 'OTHER']),
  });

  const athleteSchema = z.object({
    fullName: z.string().min(3, t('membership.validation.nameMin')),
    birthDate: z.string().min(1, t('membership.validation.birthDateRequired')),
    nationalId: z.string().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    email: z.string().email(t('membership.validation.emailInvalid')).optional().or(z.literal('')),
    phone: z.string().optional(),
    addressLine1: z.string().min(5, t('membership.validation.addressRequired')),
    addressLine2: z.string().optional(),
    city: z.string().min(2, t('membership.validation.cityRequired')),
    state: z.string().min(2, t('membership.validation.stateRequired')),
    postalCode: z.string().min(5, t('membership.validation.postalCodeRequired')),
    country: z.string().default('BR'),
  });

  const STEPS = [
    { id: 1, title: t('membership.stepGuardian') },
    { id: 2, title: t('membership.stepAthlete') },
    { id: 3, title: t('membership.stepDocuments') },
    { id: 4, title: t('membership.payment') },
  ];

  const GENDER_LABELS: Record<GenderType, string> = {
    MALE: t('membership.male'),
    FEMALE: t('membership.female'),
    OTHER: t('membership.other'),
  };

  const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
    PARENT: t('membership.guardianRelationship.PARENT'),
    GUARDIAN: t('membership.guardianRelationship.GUARDIAN'),
    OTHER: t('membership.guardianRelationship.OTHER'),
  };

  const guardianForm = useForm<z.infer<typeof guardianSchema>>({
    resolver: zodResolver(guardianSchema),
    defaultValues: {
      fullName: '',
      nationalId: '',
      email: '',
      phone: '',
      relationship: 'PARENT',
    },
  });

  const athleteForm = useForm<z.infer<typeof athleteSchema>>({
    resolver: zodResolver(athleteSchema),
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

  const handleGuardianSubmit = (data: z.infer<typeof guardianSchema>) => {
    setGuardianData(data as GuardianFormData);
    setStep(2);
  };

  /**
   * Precise age calculation that considers month/day
   */
  function calculatePreciseAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    
    // Hasn't had birthday this year yet
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      age--;
    }
    
    return age;
  }

  const handleAthleteSubmit = (data: z.infer<typeof athleteSchema>) => {
    // Precise age check: must be under 18
    const birthDate = new Date(data.birthDate);
    const age = calculatePreciseAge(birthDate);
    
    if (age >= 18) {
      toast.error(t('membership.errorYouthAge'));
      return;
    }

    setAthleteData({
      ...data,
      email: data.email || guardianData?.email || '',
    } as AthleteFormData);
    setStep(3);
  };

  const handleDocumentUpload = (type: 'idDocument' | 'medicalCertificate', file: File | null) => {
    if (file) {
      setDocuments(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleStepThreeSubmit = () => {
    if (!documents.idDocument) {
      toast.error(t('membership.errorIdDocumentYouth'));
      return;
    }
    setStep(4);
  };

  const handlePayment = async () => {
    // Block Stripe when manual override active
    if (!canUseStripe) {
      toast.error(t('billing.stripeDisabled'));
      return;
    }
    
    if (!tenant || !athleteData || !guardianData) return;

    // FX-02A: Defensive safety — user MUST already be authenticated (no toast, no persistence)
    if (!isAuthenticated || !currentUser) {
      logger.warn('[FX-02A] Unauthenticated user reached checkout — fail-closed redirect');
      navigate(`/${tenantSlug}/login?redirect=${encodeURIComponent(`/${tenantSlug}/membership/youth`)}`, { replace: true });
      return;
    }

    setIsLoading(true);

    try {
      // 1. Upload documents to TEMPORARY path tmp/{userId}/{timestamp}/
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

      // FX-01B: Check for existing DRAFT — strictly scoped to user + tenant + youth flow
      const { data: allDrafts } = await supabase
        .from('memberships')
        .select('id, applicant_data')
        .eq('tenant_id', tenant.id)
        .eq('applicant_profile_id', currentUser.id)
        .eq('status', 'DRAFT')
        .eq('type', 'FIRST_MEMBERSHIP')
        .order('created_at', { ascending: false })
        .limit(10);

      // FX-01B: Only reuse drafts with is_minor === true (youth flow)
      const youthDrafts = (allDrafts ?? []).filter((d) => {
        const ad = d.applicant_data as Record<string, unknown> | null;
        return ad?.is_minor === true;
      });

      const existingDraft = youthDrafts[0] ?? null;
      if (youthDrafts.length > 1) {
        logger.warn('[FX-01B] Multiple youth DRAFT memberships found, using most recent', {
          count: youthDrafts.length,
          selectedId: youthDrafts[0].id,
        });
      }

      let membershipId: string;

      if (existingDraft?.id) {
        membershipId = existingDraft.id;
        logger.info('[FX-01] Reusing existing DRAFT membership', { membershipId });
      } else {
        // 2. Create membership WITH applicant_data (includes guardian data)
        // ⚠️ DO NOT create guardian/athlete/guardian_links here - that happens on approval!
        const membershipPayload: YouthMembershipInsert = {
          tenant_id: tenant.id,
          athlete_id: null,
          applicant_profile_id: currentUser.id,
          applicant_data: {
            full_name: athleteData.fullName,
            birth_date: athleteData.birthDate,
            national_id: athleteData.nationalId || null,
            gender: athleteData.gender,
            email: athleteData.email || guardianData.email,
            phone: athleteData.phone || guardianData.phone,
            address_line1: athleteData.addressLine1,
            address_line2: athleteData.addressLine2 || null,
            city: athleteData.city,
            state: athleteData.state,
            postal_code: athleteData.postalCode,
            country: athleteData.country,
            is_minor: true,
            guardian: {
              full_name: guardianData.fullName,
              national_id: guardianData.nationalId,
              email: guardianData.email,
              phone: guardianData.phone,
              relationship: guardianData.relationship,
            },
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

      // 3. Create Stripe checkout session (identical to adult flow)
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        'create-membership-checkout',
        {
          body: {
            membershipId: membershipId,
            tenantSlug: tenantSlug,
            successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
            cancelUrl: `${window.location.origin}/${tenantSlug}/membership/youth`,
            captchaToken: captchaToken,
          },
        }
      );

      if (checkoutError) throw checkoutError;

      // Handle specific error responses
      if (checkoutData?.error) {
        if (checkoutData.captchaRequired) {
          setCaptchaError(checkoutData.error);
          setCaptchaToken(null);
          throw new Error(checkoutData.error);
        }
        throw new Error(checkoutData.error);
      }

      if (checkoutData?.url) {
        clearMembershipResume('youth'); // ✅ FX-01 — Clear only after checkout success
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


  // SAFE GOLD Y1.0: Derive deterministic view state
  const viewState = isLoading || authLoading ? 'LOADING' : 'READY';

  return (
    <div 
      className="min-h-screen bg-background"
      data-testid="membership-youth-form"
      data-membership-type="YOUTH"
      data-membership-view-state={viewState}
    >
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
            {t('membership.youthTitle')}
          </h1>
          <p className="text-muted-foreground">
            {tenant?.name}
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, index) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step >= s.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step > s.id ? <Check className="h-5 w-5" /> : s.id}
                </div>
                <span className="text-xs mt-2 text-muted-foreground hidden sm:block">
                  {s.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${step > s.id ? 'bg-primary' : 'bg-muted'}`} />
              )}
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
                  <CardTitle>{t('membership.guardianTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.guardianDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...guardianForm}>
                    <form onSubmit={guardianForm.handleSubmit(handleGuardianSubmit)} className="space-y-4">
                      <FormField
                        control={guardianForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('membership.fullName')}</FormLabel>
                            <FormControl>
                              <Input placeholder={t('membership.guardianNamePlaceholder')} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={guardianForm.control}
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
                          control={guardianForm.control}
                          name="relationship"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.relationship')}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t('membership.selectPlaceholder')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(GUARDIAN_RELATIONSHIP_LABELS).map(([value, label]) => (
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
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={guardianForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('common.email')}</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder={t('membership.guardianEmailPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={guardianForm.control}
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
                  <CardTitle>{t('membership.athleteTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.athleteDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...athleteForm}>
                    <form onSubmit={athleteForm.handleSubmit(handleAthleteSubmit)} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={athleteForm.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>{t('membership.athleteNameLabel')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.athleteNamePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={athleteForm.control}
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
                          control={athleteForm.control}
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
                          control={athleteForm.control}
                          name="nationalId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('membership.documentOptional')}</FormLabel>
                              <FormControl>
                                <Input placeholder={t('membership.documentOptionalPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="sm:col-span-2 pt-4">
                          <h3 className="text-sm font-medium mb-4">{t('membership.addressSection')}</h3>
                        </div>

                        <FormField
                          control={athleteForm.control}
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
                          control={athleteForm.control}
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
                          control={athleteForm.control}
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
                          control={athleteForm.control}
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

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>{t('membership.athleteDocsTitle')}</CardTitle>
                  <CardDescription>
                    {t('membership.athleteDocsDesc')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>{t('membership.idDocumentYouthLabel')}</Label>
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

                  <Button onClick={handleStepThreeSubmit} className="w-full" variant="tenant">
                    {t('membership.proceed')}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
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
                  {/* Manual override banner */}
                  {isManualOverride && (
                    <ManualOverrideBanner reason={overrideReason} appliedAt={overrideAt} />
                  )}
                  
                  {guardianData && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">{t('membership.summaryGuardian')}</h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryName')}</p>
                          <p className="font-medium">{guardianData.fullName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryEmail')}</p>
                          <p className="font-medium">{guardianData.email}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {athleteData && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <h3 className="text-sm font-medium text-muted-foreground">{t('membership.summaryAthlete')}</h3>
                      <div className="grid sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryName')}</p>
                          <p className="font-medium">{athleteData.fullName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('membership.summaryBirthDate')}</p>
                          <p className="font-medium">
                            {formatDate(athleteData.birthDate, locale)}
                          </p>
                        </div>
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

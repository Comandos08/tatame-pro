import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Loader2,
  Calendar,
  Building2,
  User,
  Download,
  Shield,
  Award,
  ShieldCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import PublicHeader from '@/components/PublicHeader';

// Separate interfaces for each query result
interface TenantData {
  id: string;
  name: string;
  slug: string;
  sport_types: string[] | null;
  primary_color: string | null;
}

interface AthleteData {
  id: string;
  full_name: string;
}

interface MembershipData {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  payment_status: string;
  type: string;
  athlete_id: string;
  tenant_id: string;
  academy_id: string | null;
  preferred_coach_id: string | null;
}

interface DigitalCardData {
  id: string;
  pdf_url: string | null;
  valid_until: string | null;
  content_hash_sha256: string | null;
  created_at: string;
}

interface GradingData {
  level_name: string;
  level_code: string;
  scheme_name: string;
  sport_type: string;
  promotion_date: string;
}

interface VerificationState {
  membership: MembershipData | null;
  athlete: AthleteData | null;
  tenant: TenantData | null;
  digitalCard: DigitalCardData | null;
  grading: GradingData | null;
  academyName: string | null;
  coachName: string | null;
}

export default function VerifyMembership() {
  const { tenantSlug, membershipId } = useParams<{ tenantSlug: string; membershipId: string }>();
  const { t } = useI18n();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerificationState>({
    membership: null,
    athlete: null,
    tenant: null,
    digitalCard: null,
    grading: null,
    academyName: null,
    coachName: null,
  });

  useEffect(() => {
    async function fetchVerificationData() {
      if (!membershipId || !tenantSlug) {
        setError(t('verification.insufficientData'));
        setLoading(false);
        return;
      }

      try {
        // Step 1: Fetch tenant by slug (public RLS allows this)
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, name, slug, sport_types, primary_color')
          .eq('slug', tenantSlug)
          .eq('is_active', true)
          .maybeSingle();

        if (tenantError || !tenant) {
          console.error('Tenant not found:', tenantError);
          setError(t('verification.organizationNotFound'));
          setLoading(false);
          return;
        }

        // Step 2: Fetch membership (public RLS via digital_cards or direct access)
        const { data: membership, error: membershipError } = await supabase
          .from('memberships')
          .select('id, status, start_date, end_date, payment_status, type, athlete_id, tenant_id, academy_id, preferred_coach_id')
          .eq('id', membershipId)
          .eq('tenant_id', tenant.id)
          .maybeSingle();

        if (membershipError || !membership) {
          console.error('Membership not found:', membershipError);
          setError(t('verification.membershipNotFound'));
          setLoading(false);
          return;
        }

        // Step 3: Fetch athlete (public RLS via digital_cards policy)
        const { data: athlete, error: athleteError } = await supabase
          .from('athletes')
          .select('id, full_name')
          .eq('id', membership.athlete_id)
          .maybeSingle();

        if (athleteError) {
          console.error('Athlete query error:', athleteError);
        }

        // Step 4: Fetch digital card if exists (public RLS allows this)
        const { data: digitalCard } = await supabase
          .from('digital_cards')
          .select('id, pdf_url, valid_until, content_hash_sha256, created_at')
          .eq('membership_id', membershipId)
          .maybeSingle();

        // Step 5: Fetch latest grading if available
        let grading: GradingData | null = null;
        if (athlete) {
          const { data: gradingResult } = await supabase
            .from('athlete_gradings')
            .select(`
              promotion_date,
              grading_level:grading_levels(
                display_name,
                code,
                grading_scheme:grading_schemes(name, sport_type)
              )
            `)
            .eq('athlete_id', athlete.id)
            .eq('tenant_id', tenant.id)
            .order('promotion_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (gradingResult?.grading_level) {
            const level = gradingResult.grading_level as any;
            grading = {
              level_name: level.display_name,
              level_code: level.code,
              scheme_name: level.grading_scheme?.name || '',
              sport_type: level.grading_scheme?.sport_type || '',
              promotion_date: gradingResult.promotion_date,
            };
          }
        }

        // Step 6: Fetch academy name if exists
        let academyName: string | null = null;
        if (membership.academy_id) {
          const { data: academy } = await supabase
            .from('academies')
            .select('name')
            .eq('id', membership.academy_id)
            .maybeSingle();
          academyName = academy?.name || null;
        }

        // Step 7: Fetch coach name if exists
        let coachName: string | null = null;
        if (membership.preferred_coach_id) {
          const { data: coach } = await supabase
            .from('coaches')
            .select('full_name')
            .eq('id', membership.preferred_coach_id)
            .maybeSingle();
          if (coach) {
            const parts = coach.full_name.split(' ');
            coachName = parts.length > 1 
              ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` 
              : parts[0];
          }
        }

        setData({
          membership,
          athlete,
          tenant,
          digitalCard,
          grading,
          academyName,
          coachName,
        });

      } catch (err) {
        console.error('Verification error:', err);
        setError(t('verification.membershipError'));
      } finally {
        setLoading(false);
      }
    }

    fetchVerificationData();
  }, [membershipId, tenantSlug, t]);

  // Mask name for privacy (LGPD compliance)
  const maskName = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length === 1) {
      return parts[0].substring(0, 2) + '***';
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first} ${last.charAt(0)}.`;
  };

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Determine verification result
  const getVerificationResult = () => {
    const { membership } = data;
    
    if (!membership) {
      return {
        valid: false,
        icon: <XCircle className="h-12 w-12 text-destructive" />,
        title: t('verification.membershipNotFound'),
        description: t('verification.membershipNotFoundDesc'),
        color: 'destructive' as const,
      };
    }

    const activeStatuses = ['APPROVED', 'ACTIVE'];
    const isActive = activeStatuses.includes(membership.status);
    const isPaid = membership.payment_status === 'PAID';
    const isNotExpired = !membership.end_date || new Date(membership.end_date) >= new Date();

    if (isActive && isPaid && isNotExpired) {
      return {
        valid: true,
        icon: <CheckCircle2 className="h-12 w-12 text-green-500" />,
        title: t('verification.membershipValid'),
        description: t('verification.membershipValidDesc'),
        color: 'success' as const,
      };
    }

    if (membership.status === 'PENDING_REVIEW' || membership.status === 'DRAFT') {
      return {
        valid: false,
        icon: <Clock className="h-12 w-12 text-amber-500" />,
        title: t('verification.membershipPending'),
        description: t('verification.membershipPendingDesc'),
        color: 'warning' as const,
      };
    }

    if (!isNotExpired) {
      return {
        valid: false,
        icon: <AlertCircle className="h-12 w-12 text-destructive" />,
        title: t('verification.membershipExpired'),
        description: t('verification.membershipExpiredDesc'),
        color: 'destructive' as const,
      };
    }

    return {
      valid: false,
      icon: <XCircle className="h-12 w-12 text-destructive" />,
      title: t('verification.membershipInvalid'),
      description: t('verification.membershipInvalidDesc'),
      color: 'destructive' as const,
    };
  };

  const handleDownload = () => {
    if (data.digitalCard?.pdf_url) {
      window.open(data.digitalCard.pdf_url, '_blank');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">{t('verification.verifyingDocument')}</p>
          </motion.div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data.tenant) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <div className="container max-w-lg mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border-destructive/50">
              <CardContent className="pt-8 pb-8">
                <div className="text-center">
                  <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">{t('verification.failed')}</h2>
                  <p className="text-muted-foreground">{error || t('verification.membershipNotFoundDesc')}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  const verificationResult = getVerificationResult();
  const { membership, athlete, tenant, digitalCard, grading, academyName, coachName } = data;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      
      <main className="container max-w-lg mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="overflow-hidden">
            {/* Header with verification result */}
            <div 
              className={`p-6 text-center ${
                verificationResult.valid 
                  ? 'bg-green-50 dark:bg-green-950/20' 
                  : verificationResult.color === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/20'
                    : 'bg-red-50 dark:bg-red-950/20'
              }`}
            >
              {verificationResult.icon}
              <h1 className="text-xl font-bold mt-4">{verificationResult.title}</h1>
              <p className="text-sm text-muted-foreground mt-2">{verificationResult.description}</p>
              
              {/* Grading badge if available */}
              {grading && verificationResult.valid && (
                <Badge className="mt-3 bg-primary/90">
                  <Award className="h-3 w-3 mr-1" />
                  {grading.level_name}
                </Badge>
              )}
            </div>

            <CardContent className="pt-6">
              {membership && (
                <div className="space-y-4">
                  {/* Organization Info */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.organization')}</p>
                      <p className="font-medium truncate">{tenant.name}</p>
                    </div>
                  </div>

                  {/* Athlete Info (masked for privacy) */}
                  {athlete && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.athlete')}</p>
                        <p className="font-medium">{maskName(athlete.full_name)}</p>
                      </div>
                    </div>
                  )}

                  {/* Grading Info if available */}
                  {grading && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.grading')}</p>
                        <p className="font-semibold text-primary">{grading.level_name}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.system')}</p>
                        <p className="font-medium text-sm">{grading.scheme_name}</p>
                      </div>
                    </div>
                  )}

                  {/* Academy and Coach */}
                  {(academyName || coachName) && (
                    <div className="grid grid-cols-2 gap-3">
                      {academyName && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.academy')}</p>
                          <p className="font-medium text-sm truncate">{academyName}</p>
                        </div>
                      )}
                      {coachName && (
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.coach')}</p>
                          <p className="font-medium text-sm">{coachName}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Validity Period */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.validityPeriod')}</p>
                      <p className="font-medium">
                        {formatDate(membership.start_date)} - {formatDate(membership.end_date)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Digital Card Status & Download */}
                  {digitalCard ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                        <ShieldCheck className="h-5 w-5" />
                        <span className="font-medium">{t('verification.cardReady')}</span>
                      </div>
                      
                      {/* Hash verification indicator */}
                      {digitalCard.content_hash_sha256 && (
                        <div className="text-center text-xs text-muted-foreground">
                          <span className="font-mono">SHA-256: {digitalCard.content_hash_sha256.substring(0, 12)}...</span>
                        </div>
                      )}

                      {digitalCard.pdf_url && (
                        <Button 
                          onClick={handleDownload}
                          className="w-full"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('verification.downloadCard')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                      <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="font-medium">{t('verification.cardProcessing')}</span>
                      </div>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('verification.cardProcessingDesc')}
                      </p>
                    </div>
                  )}

                  {/* QR Code for sharing */}
                  <div className="pt-4 flex flex-col items-center">
                    <p className="text-xs text-muted-foreground mb-3">{t('verification.shareQr')}</p>
                    <div className="bg-white p-3 rounded-lg shadow-sm">
                      <QRCodeSVG 
                        value={window.location.href}
                        size={100}
                        level="M"
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
                    <Shield className="h-4 w-4" />
                    <span>{t('verification.authenticDocument')} {tenant.name}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Back button */}
        <div className="mt-6 text-center">
          <Button variant="ghost" asChild>
            <Link to={`/${tenantSlug}`}>
              {t('common.back')}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

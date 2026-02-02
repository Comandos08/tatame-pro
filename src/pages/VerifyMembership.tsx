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

// Public verification data from the hardened database view
// This view ONLY returns safe, public data with masked athlete name
// No PII is exposed: no email, phone, address, birth_date, national_id
interface PublicVerificationData {
  // Membership info
  membership_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  payment_status: string;
  type: string;
  
  // Tenant public info
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  sport_types: string[] | null;
  
  // Masked athlete name (First Name + Last Initial, masked at DB level)
  athlete_name: string | null;
  
  // Digital card availability
  digital_card_id: string | null;
  pdf_url: string | null;
  card_valid_until: string | null;
  content_hash_sha256: string | null;
  card_created_at: string | null;
  
  // Current grading (from LATERAL join in view)
  level_name: string | null;
  level_code: string | null;
  scheme_name: string | null;
  grading_sport_type: string | null;
}

export default function VerifyMembership() {
  const { tenantSlug, membershipId } = useParams<{ tenantSlug: string; membershipId: string }>();
  const { t } = useI18n();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicVerificationData | null>(null);

  useEffect(() => {
    async function fetchVerificationData() {
      if (!membershipId || !tenantSlug) {
        setError(t('verification.insufficientData'));
        setLoading(false);
        return;
      }

      try {
        // Query the hardened public verification view
        // This view is designed for anonymous access via QR code
        // It ONLY returns safe, public data with masked athlete name
        // No PII exposed: no email, phone, address, birth_date, national_id
        const { data: verificationData, error: verificationError } = await supabase
          .from('membership_verification')
          .select('membership_id, status, start_date, end_date, payment_status, type, tenant_id, tenant_name, tenant_slug, sport_types, athlete_name, digital_card_id, pdf_url, card_valid_until, content_hash_sha256, card_created_at, level_name, level_code, scheme_name, grading_sport_type')
          .eq('membership_id', membershipId)
          .eq('tenant_slug', tenantSlug)
          .maybeSingle();

        if (verificationError) {
          console.error('Verification query error:', verificationError);
          setError(t('verification.membershipError'));
          setLoading(false);
          return;
        }

        if (!verificationData) {
          console.error('Membership not found');
          setError(t('verification.membershipNotFound'));
          setLoading(false);
          return;
        }

        // Set state directly from the view - NO fallbacks to other tables
        setData(verificationData as PublicVerificationData);

      } catch (err) {
        console.error('Verification error:', err);
        setError(t('verification.membershipError'));
      } finally {
        setLoading(false);
      }
    }

    fetchVerificationData();
  }, [membershipId, tenantSlug, t]);

  // Note: Athlete name is already masked at the database level
  // The view returns "First Name + Last Initial" format (e.g., "João S.")
  // No need for client-side masking

  // Format date
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  // Determine verification result
  const getVerificationResult = () => {
    if (!data) {
      return {
        valid: false,
        icon: <XCircle className="h-12 w-12 text-destructive" />,
        title: t('verification.membershipNotFound'),
        description: t('verification.membershipNotFoundDesc'),
        color: 'destructive' as const,
      };
    }

    const activeStatuses = ['APPROVED', 'ACTIVE'];
    const isActive = activeStatuses.includes(data.status);
    const isPaid = data.payment_status === 'PAID';
    const isNotExpired = !data.end_date || new Date(data.end_date) >= new Date();

    if (isActive && isPaid && isNotExpired) {
      return {
        valid: true,
        icon: <CheckCircle2 className="h-12 w-12 text-green-500" />,
        title: t('verification.membershipValid'),
        description: t('verification.membershipValidDesc'),
        color: 'success' as const,
      };
    }

    if (data.status === 'PENDING_REVIEW' || data.status === 'DRAFT') {
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
    if (data?.pdf_url) {
      window.open(data.pdf_url, '_blank');
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
  if (error || !data) {
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
  const hasDigitalCard = !!data.digital_card_id;

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
            </div>

            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Organization Info */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.organization')}</p>
                    <p className="font-medium truncate">{data.tenant_name}</p>
                  </div>
                </div>

                {/* Athlete Info (already masked at DB level) */}
                {data.athlete_name && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.athlete')}</p>
                      <p className="font-medium">{data.athlete_name}</p>
                    </div>
                  </div>
                )}

                {/* Current Grading (if available) */}
                {data.level_name && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Award className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.currentGrading')}</p>
                      <p className="font-medium">{data.level_name}</p>
                      {(data.scheme_name || data.grading_sport_type) && (
                        <p className="text-xs text-muted-foreground">
                          {data.scheme_name && data.grading_sport_type 
                            ? `${data.scheme_name} • ${data.grading_sport_type}`
                            : data.scheme_name || data.grading_sport_type
                          }
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Validity Period */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.validityPeriod')}</p>
                    <p className="font-medium">
                      {formatDate(data.start_date)} - {formatDate(data.end_date)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Digital Card Status & Download */}
                {hasDigitalCard ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                      <ShieldCheck className="h-5 w-5" />
                      <span className="font-medium">{t('verification.cardReady')}</span>
                    </div>
                    
                    {/* Hash verification indicator */}
                    {data.content_hash_sha256 && (
                      <div className="text-center text-xs text-muted-foreground">
                        <span className="font-mono">ID: {data.content_hash_sha256.substring(0, 12)}...</span>
                      </div>
                    )}

                    {data.pdf_url && (
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
                  <span>{t('verification.authenticDocument')} {data.tenant_name}</span>
                </div>
              </div>
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

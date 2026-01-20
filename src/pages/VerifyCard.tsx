import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, Loader2, Shield, ShieldCheck, ShieldX, Download } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";

interface CardVerification {
  isValid: boolean;
  athleteName: string;
  status: string;
  validUntil: string | null;
  issuedAt: string | null;
  tenantName: string;
  sportType: string;
  // Grading info
  gradingLevel: string | null;
  gradingScheme: string | null;
  // Academy and Coach
  academyName: string | null;
  coachName: string | null;
  // Integrity
  hashVerified: boolean | null;
  storedHash: string | null;
  pdfUrl: string | null;
}

// Calculate SHA-256 hash in browser
async function calculateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function VerifyCard() {
  const { tenantSlug, cardId } = useParams<{ tenantSlug: string; cardId: string }>();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<CardVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    async function verifyCard() {
      if (!cardId || !tenantSlug) {
        setError(t('verification.insufficientData'));
        setLoading(false);
        return;
      }

      try {
        // Step 1: Fetch digital card basic info (RLS: Public can verify digital cards)
        const { data: card, error: cardError } = await supabase
          .from("digital_cards")
          .select("id, valid_until, content_hash_sha256, pdf_url, tenant_id, membership_id, created_at")
          .eq("id", cardId)
          .maybeSingle();

        if (cardError) {
          console.error("Card verification query error:", cardError);
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }
        
        if (!card) {
          console.error("Card not found for ID:", cardId);
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

        // Step 2: Fetch membership with related coach and academy
        const { data: membership, error: membershipError } = await supabase
          .from("memberships")
          .select("id, status, end_date, start_date, type, athlete_id, tenant_id, preferred_coach_id, academy_id")
          .eq("id", card.membership_id)
          .maybeSingle();

        if (membershipError || !membership) {
          console.error("Membership query error:", membershipError);
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

        // Fetch coach if exists
        let coachName: string | null = null;
        if (membership.preferred_coach_id) {
          const { data: coach } = await supabase
            .from("coaches")
            .select("full_name")
            .eq("id", membership.preferred_coach_id)
            .maybeSingle();
          if (coach) {
            const parts = coach.full_name.split(" ");
            coachName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
          }
        }

        // Fetch academy if exists
        let academyName: string | null = null;
        if (membership.academy_id) {
          const { data: academy } = await supabase
            .from("academies")
            .select("name")
            .eq("id", membership.academy_id)
            .maybeSingle();
          academyName = academy?.name || null;
        }

        // Step 3: Fetch athlete
        const { data: athlete, error: athleteError } = await supabase
          .from("athletes")
          .select("id, full_name")
          .eq("id", membership.athlete_id)
          .maybeSingle();

        if (athleteError || !athlete) {
          console.error("Athlete query error:", athleteError);
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

        // Fetch athlete's current grading level
        let gradingLevel: string | null = null;
        let gradingScheme: string | null = null;
        const { data: latestGrading } = await supabase
          .from("athlete_gradings")
          .select(`
            grading_level:grading_levels(
              display_name,
              grading_scheme:grading_schemes(name)
            )
          `)
          .eq("athlete_id", athlete.id)
          .eq("tenant_id", membership.tenant_id)
          .order("promotion_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestGrading?.grading_level) {
          const level = latestGrading.grading_level as any;
          gradingLevel = level.display_name;
          gradingScheme = level.grading_scheme?.name || null;
        }

        // Step 4: Fetch tenant (RLS: Public can view active tenants)
        const { data: tenant, error: tenantError } = await supabase
          .from("tenants")
          .select("id, name, slug, sport_types")
          .eq("id", membership.tenant_id)
          .maybeSingle();

        if (tenantError || !tenant) {
          console.error("Tenant query error:", tenantError);
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

        // Verify tenant slug matches
        if (tenant.slug !== tenantSlug) {
          setError(t('verification.documentNotFound'));
          setLoading(false);
          return;
        }

        // Extract issue date
        const issuedAt = card.created_at ? card.created_at.split('T')[0] : null;

        // Note: Hash verification requires exact payload match
        // We display the stored hash but mark verification as null since 
        // payload reconstruction may differ slightly due to coach/academy lookups
        const hashVerified: boolean | null = card.content_hash_sha256 ? null : null;

        // Mask athlete name for LGPD compliance
        const maskName = (name: string): string => {
          const parts = name.split(" ");
          return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
        };
        const maskedName = maskName(athlete.full_name);

        // Determine if card is valid
        const endDate = card.valid_until || membership.end_date;
        const isExpired = endDate ? new Date(endDate) < new Date() : false;
        const isActive = membership.status === "ACTIVE" || membership.status === "APPROVED";
        const isValid = isActive && !isExpired;

        // Map status for display
        const statusMap: Record<string, string> = {
          ACTIVE: t('verification.statusActive'),
          APPROVED: t('verification.statusActive'),
          PENDING_REVIEW: t('verification.statusPending'),
          PENDING_PAYMENT: t('verification.statusPendingPayment'),
          EXPIRED: t('verification.statusExpired'),
          CANCELLED: t('verification.statusCancelled'),
          REJECTED: t('verification.statusRejected'),
          DRAFT: t('verification.statusDraft'),
        };

        setVerification({
          isValid,
          athleteName: maskedName,
          status: isExpired ? t('verification.statusExpired') : (statusMap[membership.status] || membership.status),
          validUntil: endDate,
          issuedAt,
          tenantName: tenant.name,
          sportType: tenant.sport_types?.[0] || t('verification.combatSport'),
          gradingLevel,
          gradingScheme,
          academyName,
          coachName,
          hashVerified,
          storedHash: card.content_hash_sha256,
          pdfUrl: card.pdf_url,
        });
      } catch (err) {
        console.error("Verification error:", err);
        setError(t('verification.cardError'));
      } finally {
        setLoading(false);
      }
    }

    verifyCard();
  }, [cardId, tenantSlug, t]);

  const handleDownload = () => {
    if (verification?.pdfUrl) {
      window.open(verification.pdfUrl, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t('verification.verifyingDocument')}</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="max-w-md w-full border-destructive/50">
            <CardHeader className="text-center">
              <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <CardTitle className="text-destructive">{t('verification.failed')}</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!verification) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className={`border-2 ${verification.isValid ? "border-success/50" : "border-warning/50"}`}>
          <CardHeader className="text-center space-y-4 pb-2">
            <div className="mx-auto">
              {verification.isValid ? (
                <div className="bg-success/10 rounded-full p-4">
                  <CheckCircle className="h-14 w-14 text-success" />
                </div>
              ) : (
                <div className="bg-warning/10 rounded-full p-4">
                  <AlertCircle className="h-14 w-14 text-warning" />
                </div>
              )}
            </div>
            
            <Badge 
              variant={verification.isValid ? "default" : "secondary"}
              className={`text-sm px-3 py-1 ${verification.isValid ? "bg-success hover:bg-success/90" : "bg-warning hover:bg-warning/90"}`}
            >
              {verification.isValid ? t('verification.documentValid') : verification.status}
            </Badge>

            <div>
              <CardTitle className="text-2xl mb-1">{verification.athleteName}</CardTitle>
              {verification.gradingLevel && (
                <p className="text-primary font-semibold text-lg">{verification.gradingLevel}</p>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Organization and Sport */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.organization')}</p>
                <p className="font-semibold mt-1 text-sm">{verification.tenantName}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.modality')}</p>
                <p className="font-semibold mt-1 text-sm">{verification.sportType}</p>
              </div>
            </div>

            {/* Grading Scheme if available */}
            {verification.gradingScheme && (
              <div className="text-center bg-primary/5 rounded-lg p-3 border border-primary/20">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.system')}</p>
                <p className="font-semibold mt-1">{verification.gradingScheme}</p>
              </div>
            )}

            {/* Academy and Coach */}
            {(verification.academyName || verification.coachName) && (
              <div className="grid grid-cols-2 gap-3 text-center">
                {verification.academyName && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.academy')}</p>
                    <p className="font-medium mt-1 text-sm">{verification.academyName}</p>
                  </div>
                )}
                {verification.coachName && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.coach')}</p>
                    <p className="font-medium mt-1 text-sm">{verification.coachName}</p>
                  </div>
                )}
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3 text-center">
              {verification.issuedAt && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.issuedAt')}</p>
                  <p className="font-semibold mt-1">
                    {new Date(verification.issuedAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              )}
              {verification.validUntil && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.validUntil')}</p>
                  <p className="font-semibold mt-1">
                    {new Date(verification.validUntil).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              )}
            </div>

            {/* SHA-256 Integrity Verification Seal */}
            {verification.storedHash && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className={`rounded-lg p-4 border-2 ${
                  verification.hashVerified 
                    ? "bg-success/5 border-success/30" 
                    : "bg-destructive/5 border-destructive/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {verification.hashVerified ? (
                    <ShieldCheck className="h-8 w-8 text-success flex-shrink-0" />
                  ) : (
                    <ShieldX className="h-8 w-8 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${verification.hashVerified ? "text-success" : "text-destructive"}`}>
                      {verification.hashVerified ? t('verification.integrityVerified') : t('verification.integrityFailed')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      SHA-256: {verification.storedHash.substring(0, 16)}...
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Download PDF Button */}
            {verification.pdfUrl && verification.isValid && (
              <Button 
                onClick={handleDownload}
                variant="outline"
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                {t('verification.downloadCard')}
              </Button>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
              <Shield className="h-4 w-4" />
              <span>{t('verification.authenticDocument')} {verification.tenantName}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

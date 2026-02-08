import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, Loader2, Shield, ShieldCheck, ShieldX, Download } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate } from "@/lib/i18n/formatters";

interface CardVerification {
  isValid: boolean;
  athleteName: string;
  status: string;
  validUntil: string | null;
  issuedAt: string | null;
  tenantName: string;
  sportType: string;
  gradingLevel: string | null;
  gradingScheme: string | null;
  academyName: string | null;
  coachName: string | null;
  hashVerified: boolean | null;
  storedHash: string | null;
  pdfUrl: string | null;
}

export default function VerifyCard() {
  const { tenantSlug, cardId } = useParams<{ tenantSlug: string; cardId: string }>();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<CardVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useI18n();

  useEffect(() => {
    async function verifyCard() {
      if (!cardId || !tenantSlug) {
        setError(t('verification.insufficientData'));
        setLoading(false);
        return;
      }

      try {
        // Call Edge Function for secure verification (no direct PostgREST)
        const { data, error: fnError } = await supabase.functions.invoke("verify-digital-card", {
          body: { cardId, tenantSlug },
        });

        if (fnError) {
          console.error("Edge function error:", fnError);
          setError(t('verification.cardError'));
          setLoading(false);
          return;
        }

        if (!data || !data.found) {
          setError(data?.error || t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

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

        // Determine if expired based on validUntil
        const endDate = data.validUntil;
        const isExpired = endDate ? new Date(endDate) < new Date() : false;

        setVerification({
          isValid: data.isValid,
          athleteName: data.athleteName,
          status: isExpired ? t('verification.statusExpired') : (statusMap[data.status] || data.status),
          validUntil: data.validUntil,
          issuedAt: data.issuedAt,
          tenantName: data.tenantName,
          sportType: data.sportType || t('verification.combatSport'),
          gradingLevel: data.gradingLevel,
          gradingScheme: data.gradingScheme,
          academyName: data.academyName,
          coachName: data.coachName,
          hashVerified: data.hashVerified,
          storedHash: data.storedHash,
          pdfUrl: data.pdfUrl,
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
                    {formatDate(verification.issuedAt, locale)}
                  </p>
                </div>
              )}
              {verification.validUntil && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.validUntil')}</p>
                  <p className="font-semibold mt-1">
                    {formatDate(verification.validUntil, locale)}
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
                      ID: {verification.storedHash.substring(0, 16)}...
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

            <div className="text-center pt-4 border-t space-y-2">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>{t('verification.authenticDocument')} {verification.tenantName}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('verification.cardInstitutionalMessage')}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

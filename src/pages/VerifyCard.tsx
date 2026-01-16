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
  tenantName: string;
  sportType: string;
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
        // Fetch digital card with related data
        const { data: card, error: cardError } = await supabase
          .from("digital_cards")
          .select(`
            id,
            valid_until,
            content_hash_sha256,
            pdf_url,
            tenant_id,
            membership_id,
            created_at,
            membership:memberships!inner(
              id,
              status,
              end_date,
              start_date,
              type,
              athlete:athletes!inner(
                id,
                full_name
              ),
              tenant:tenants!inner(
                id,
                name,
                slug,
                sport_types
              )
            )
          `)
          .eq("id", cardId)
          .maybeSingle();

        if (cardError || !card) {
          setError(t('verification.cardNotFound'));
          setLoading(false);
          return;
        }

        const membership = card.membership as {
          id: string;
          status: string;
          end_date: string | null;
          start_date: string | null;
          type: string;
          athlete: { id: string; full_name: string };
          tenant: { id: string; name: string; slug: string; sport_types: string[] };
        };

        // Verify tenant slug matches
        if (membership.tenant.slug !== tenantSlug) {
          setError(t('verification.documentNotFound'));
          setLoading(false);
          return;
        }

        // Verify SHA-256 hash if present
        let hashVerified: boolean | null = null;
        if (card.content_hash_sha256) {
          try {
            // Recreate the canonical payload (MUST match edge function exactly)
            // Extract created_at date in YYYY-MM-DD format
            const createdAtDate = card.created_at ? card.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
            
            const canonicalPayload = {
              tenant_id: card.tenant_id,
              athlete_id: membership.athlete.id,
              membership_id: card.membership_id,
              valid_until: card.valid_until,
              created_at: createdAtDate,
            };
            
            const calculatedHash = await calculateSHA256(JSON.stringify(canonicalPayload));
            hashVerified = calculatedHash === card.content_hash_sha256;
          } catch (hashErr) {
            console.error("Hash verification error:", hashErr);
            hashVerified = false;
          }
        }

        // Mask athlete name for LGPD compliance
        const nameParts = membership.athlete.full_name.split(" ");
        const maskedName = nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
          : nameParts[0];

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
          tenantName: membership.tenant.name,
          sportType: membership.tenant.sport_types?.[0] || t('verification.combatSport'),
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
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              {verification.isValid ? (
                <div className="bg-success/10 rounded-full p-4">
                  <CheckCircle className="h-16 w-16 text-success" />
                </div>
              ) : (
                <div className="bg-warning/10 rounded-full p-4">
                  <AlertCircle className="h-16 w-16 text-warning" />
                </div>
              )}
            </div>
            
            <div>
              <Badge 
                variant={verification.isValid ? "default" : "secondary"}
                className={`text-lg px-4 py-1 ${verification.isValid ? "bg-success hover:bg-success/90" : "bg-warning hover:bg-warning/90"}`}
              >
                {verification.isValid ? t('verification.documentValid') : verification.status}
              </Badge>
            </div>

            <CardTitle className="text-2xl">{verification.athleteName}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.organization')}</p>
                <p className="font-semibold mt-1">{verification.tenantName}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.modality')}</p>
                <p className="font-semibold mt-1">{verification.sportType}</p>
              </div>
            </div>

            {verification.validUntil && (
              <div className="text-center bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.validUntil')}</p>
                <p className="font-semibold text-lg mt-1">
                  {new Date(verification.validUntil).toLocaleDateString("pt-BR")}
                </p>
              </div>
            )}

            {/* SHA-256 Integrity Verification Seal */}
            {verification.storedHash && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className={`rounded-lg p-4 border-2 ${
                  verification.hashVerified 
                    ? "bg-green-500/5 border-green-500/30" 
                    : "bg-destructive/5 border-destructive/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {verification.hashVerified ? (
                    <ShieldCheck className="h-8 w-8 text-green-500 flex-shrink-0" />
                  ) : (
                    <ShieldX className="h-8 w-8 text-destructive flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${verification.hashVerified ? "text-green-600" : "text-destructive"}`}>
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

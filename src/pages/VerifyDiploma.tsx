import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircle, AlertCircle, Loader2, Shield, Award, ShieldCheck, ShieldX, Download } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";

interface DiplomaVerification {
  isValid: boolean;
  athleteName: string;
  status: string;
  levelName: string;
  schemeName: string;
  sportType: string;
  promotionDate: string;
  serialNumber: string;
  tenantName: string;
  academyName: string | null;
  coachName: string | null;
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

export default function VerifyDiploma() {
  const { tenantSlug, diplomaId } = useParams<{ tenantSlug: string; diplomaId: string }>();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<DiplomaVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    async function verifyDiploma() {
      if (!diplomaId || !tenantSlug) {
        setError(t('verification.insufficientData'));
        setLoading(false);
        return;
      }

      try {
        // Fetch diploma with related data
        const { data: diploma, error: diplomaError } = await supabase
          .from("diplomas")
          .select(`
            id,
            serial_number,
            status,
            promotion_date,
            issued_at,
            content_hash_sha256,
            pdf_url,
            tenant_id,
            athlete_id,
            grading_level_id,
            academy_id,
            coach_id,
            athlete:athletes!inner(
              id,
              full_name
            ),
            grading_level:grading_levels!inner(
              id,
              display_name,
              code,
              grading_scheme:grading_schemes!inner(
                id,
                name,
                sport_type
              )
            ),
            tenant:tenants!inner(
              id,
              name,
              slug
            ),
            academy:academies(
              id,
              name
            ),
            coach:coaches(
              id,
              full_name
            )
          `)
          .eq("id", diplomaId)
          .maybeSingle();

        if (diplomaError || !diploma) {
          setError(t('verification.diplomaNotFound'));
          setLoading(false);
          return;
        }

        const tenant = diploma.tenant as { id: string; name: string; slug: string };

        // Verify tenant slug matches
        if (tenant.slug !== tenantSlug) {
          setError(t('verification.documentNotFound'));
          setLoading(false);
          return;
        }

        const athlete = diploma.athlete as { id: string; full_name: string };
        const gradingLevel = diploma.grading_level as {
          id: string;
          display_name: string;
          code: string;
          grading_scheme: { id: string; name: string; sport_type: string };
        };
        const academy = diploma.academy as { id: string; name: string } | null;
        const coach = diploma.coach as { id: string; full_name: string } | null;

        // Verify SHA-256 hash if present
        let hashVerified: boolean | null = null;
        if (diploma.content_hash_sha256) {
          try {
            // Recreate the STANDARDIZED canonical payload (MUST match edge function exactly)
            const canonicalPayload = {
              // Athlete data
              atleta: {
                id: diploma.athlete_id,
                nome: athlete.full_name,
              },
              // Grading data
              graduacao: {
                id: diploma.grading_level_id,
                nivel: gradingLevel.display_name,
                codigo: gradingLevel.code,
                sistema: gradingLevel.grading_scheme?.name || null,
              },
              // Date information
              data: {
                emissao: diploma.issued_at ? diploma.issued_at.split('T')[0] : new Date().toISOString().split('T')[0],
                promocao: diploma.promotion_date,
              },
              // Entity (tenant) information
              entidade: {
                id: diploma.tenant_id,
                nome: tenant.name,
                slug: tenant.slug,
                modalidade: gradingLevel.grading_scheme.sport_type,
              },
              // Responsible person (coach)
              responsavel: coach ? { 
                id: diploma.coach_id,
                nome: coach.full_name,
              } : null,
              // Document metadata
              documento: {
                tipo: "DIPLOMA",
                id: diploma.id,
                serial: diploma.serial_number,
                academia_id: diploma.academy_id || null,
                academia_nome: academy?.name || null,
              },
            };
            
            const calculatedHash = await calculateSHA256(JSON.stringify(canonicalPayload));
            hashVerified = calculatedHash === diploma.content_hash_sha256;
          } catch (hashErr) {
            console.error("Hash verification error:", hashErr);
            hashVerified = false;
          }
        }

        // Mask athlete name for LGPD compliance
        const nameParts = athlete.full_name.split(" ");
        const maskedName = nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
          : nameParts[0];

        // Status mapping
        const statusMap: Record<string, string> = {
          ISSUED: t('verification.diplomaStatusValid'),
          DRAFT: t('verification.statusDraft'),
          REVOKED: t('verification.diplomaStatusRevoked'),
        };

        const isValid = diploma.status === "ISSUED";

        setVerification({
          isValid,
          athleteName: maskedName,
          status: statusMap[diploma.status] || diploma.status,
          levelName: gradingLevel.display_name,
          schemeName: gradingLevel.grading_scheme.name,
          sportType: gradingLevel.grading_scheme.sport_type,
          promotionDate: diploma.promotion_date,
          serialNumber: diploma.serial_number,
          tenantName: tenant.name,
          academyName: academy?.name || null,
          coachName: coach ? `${coach.full_name.split(" ")[0]} ${coach.full_name.split(" ").pop()?.charAt(0) || ""}.` : null,
          hashVerified,
          storedHash: diploma.content_hash_sha256,
          pdfUrl: diploma.pdf_url,
        });
      } catch (err) {
        console.error("Verification error:", err);
        setError(t('verification.diplomaError'));
      } finally {
        setLoading(false);
      }
    }

    verifyDiploma();
  }, [diplomaId, tenantSlug, t]);

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
          <p className="text-muted-foreground">{t('verification.verifyingDiploma')}</p>
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
        <Card className={`border-2 ${verification.isValid ? "border-success/50" : "border-destructive/50"}`}>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              {verification.isValid ? (
                <div className="bg-success/10 rounded-full p-4">
                  <Award className="h-16 w-16 text-success" />
                </div>
              ) : (
                <div className="bg-destructive/10 rounded-full p-4">
                  <AlertCircle className="h-16 w-16 text-destructive" />
                </div>
              )}
            </div>
            
            <div>
              <Badge 
                variant={verification.isValid ? "default" : "destructive"}
                className={`text-lg px-4 py-1 ${verification.isValid ? "bg-success hover:bg-success/90" : ""}`}
              >
                {verification.isValid ? t('verification.diplomaValid') : verification.status}
              </Badge>
            </div>

            <div>
              <CardTitle className="text-2xl mb-2">{verification.athleteName}</CardTitle>
              <p className="text-primary font-semibold text-lg">{verification.levelName}</p>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.modality')}</p>
                <p className="font-semibold mt-1">{verification.sportType}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.system')}</p>
                <p className="font-semibold mt-1">{verification.schemeName}</p>
              </div>
            </div>

            <div className="text-center bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.promotionDate')}</p>
              <p className="font-semibold text-lg mt-1">
                {new Date(verification.promotionDate).toLocaleDateString("pt-BR")}
              </p>
            </div>

            {(verification.academyName || verification.coachName) && (
              <div className="grid grid-cols-2 gap-4 text-center">
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

            <div className="text-center bg-primary/5 rounded-lg p-3 border border-primary/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('verification.serialNumber')}</p>
              <p className="font-mono font-bold text-primary mt-1">{verification.serialNumber}</p>
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
                {t('verification.downloadDiploma')}
              </Button>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
              <Shield className="h-4 w-4" />
              <span>{t('verification.authenticDiploma')} {verification.tenantName}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

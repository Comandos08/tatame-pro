import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Loader2, Shield, Award } from "lucide-react";
import { motion } from "framer-motion";

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
}

export default function VerifyDiploma() {
  const { tenantSlug, diplomaId } = useParams<{ tenantSlug: string; diplomaId: string }>();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<DiplomaVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyDiploma() {
      if (!diplomaId || !tenantSlug) {
        setError("Dados insuficientes para verificação");
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
            athlete:athletes!inner(
              full_name
            ),
            grading_level:grading_levels!inner(
              display_name,
              grading_scheme:grading_schemes!inner(
                name,
                sport_type
              )
            ),
            tenant:tenants!inner(
              name,
              slug
            ),
            academy:academies(
              name
            ),
            coach:coaches(
              full_name
            )
          `)
          .eq("id", diplomaId)
          .maybeSingle();

        if (diplomaError || !diploma) {
          setError("Diploma não encontrado ou inválido");
          setLoading(false);
          return;
        }

        const tenant = diploma.tenant as { name: string; slug: string };

        // Verify tenant slug matches
        if (tenant.slug !== tenantSlug) {
          setError("Documento não encontrado ou inválido");
          setLoading(false);
          return;
        }

        const athlete = diploma.athlete as { full_name: string };
        const gradingLevel = diploma.grading_level as {
          display_name: string;
          grading_scheme: { name: string; sport_type: string };
        };
        const academy = diploma.academy as { name: string } | null;
        const coach = diploma.coach as { full_name: string } | null;

        // Mask athlete name for LGPD compliance
        const nameParts = athlete.full_name.split(" ");
        const maskedName = nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.`
          : nameParts[0];

        // Status mapping
        const statusMap: Record<string, string> = {
          ISSUED: "VÁLIDO",
          DRAFT: "RASCUNHO",
          REVOKED: "REVOGADO",
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
        });
      } catch (err) {
        console.error("Verification error:", err);
        setError("Erro ao verificar diploma");
      } finally {
        setLoading(false);
      }
    }

    verifyDiploma();
  }, [diplomaId, tenantSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando diploma...</p>
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
              <CardTitle className="text-destructive">Verificação Falhou</CardTitle>
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
        <Card className={`border-2 ${verification.isValid ? "border-green-500/50" : "border-destructive/50"}`}>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              {verification.isValid ? (
                <div className="bg-green-500/10 rounded-full p-4">
                  <Award className="h-16 w-16 text-green-500" />
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
                className={`text-lg px-4 py-1 ${verification.isValid ? "bg-green-500 hover:bg-green-600" : ""}`}
              >
                {verification.isValid ? "DIPLOMA VÁLIDO" : verification.status}
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
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Modalidade</p>
                <p className="font-semibold mt-1">{verification.sportType}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Sistema</p>
                <p className="font-semibold mt-1">{verification.schemeName}</p>
              </div>
            </div>

            <div className="text-center bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Data da Promoção</p>
              <p className="font-semibold text-lg mt-1">
                {new Date(verification.promotionDate).toLocaleDateString("pt-BR")}
              </p>
            </div>

            {(verification.academyName || verification.coachName) && (
              <div className="grid grid-cols-2 gap-4 text-center">
                {verification.academyName && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Academia</p>
                    <p className="font-medium mt-1 text-sm">{verification.academyName}</p>
                  </div>
                )}
                {verification.coachName && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Professor</p>
                    <p className="font-medium mt-1 text-sm">{verification.coachName}</p>
                  </div>
                )}
              </div>
            )}

            <div className="text-center bg-primary/5 rounded-lg p-3 border border-primary/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Número de Série</p>
              <p className="font-mono font-bold text-primary mt-1">{verification.serialNumber}</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
              <Shield className="h-4 w-4" />
              <span>Diploma autêntico emitido por {verification.tenantName}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

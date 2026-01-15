import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertCircle, Loader2, Shield } from "lucide-react";
import { motion } from "framer-motion";

interface CardVerification {
  isValid: boolean;
  athleteName: string;
  status: string;
  validUntil: string | null;
  tenantName: string;
  sportType: string;
}

export default function VerifyCard() {
  const { tenantSlug, cardId } = useParams<{ tenantSlug: string; cardId: string }>();
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<CardVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyCard() {
      if (!cardId || !tenantSlug) {
        setError("Dados insuficientes para verificação");
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
            membership:memberships!inner(
              id,
              status,
              end_date,
              athlete:athletes!inner(
                full_name
              ),
              tenant:tenants!inner(
                name,
                slug,
                sport_types
              )
            )
          `)
          .eq("id", cardId)
          .maybeSingle();

        if (cardError || !card) {
          setError("Carteira não encontrada ou inválida");
          setLoading(false);
          return;
        }

        const membership = card.membership as {
          status: string;
          end_date: string | null;
          athlete: { full_name: string };
          tenant: { name: string; slug: string; sport_types: string[] };
        };

        // Verify tenant slug matches
        if (membership.tenant.slug !== tenantSlug) {
          setError("Documento não encontrado ou inválido");
          setLoading(false);
          return;
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
          ACTIVE: "ATIVA",
          APPROVED: "ATIVA",
          PENDING_REVIEW: "PENDENTE",
          PENDING_PAYMENT: "AGUARDANDO PAGAMENTO",
          EXPIRED: "EXPIRADA",
          CANCELLED: "CANCELADA",
          REJECTED: "REJEITADA",
          DRAFT: "RASCUNHO",
        };

        setVerification({
          isValid,
          athleteName: maskedName,
          status: isExpired ? "EXPIRADA" : (statusMap[membership.status] || membership.status),
          validUntil: endDate,
          tenantName: membership.tenant.name,
          sportType: membership.tenant.sport_types?.[0] || "Esporte de Combate",
        });
      } catch (err) {
        console.error("Verification error:", err);
        setError("Erro ao verificar carteira");
      } finally {
        setLoading(false);
      }
    }

    verifyCard();
  }, [cardId, tenantSlug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando documento...</p>
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
        <Card className={`border-2 ${verification.isValid ? "border-green-500/50" : "border-amber-500/50"}`}>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto">
              {verification.isValid ? (
                <div className="bg-green-500/10 rounded-full p-4">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                </div>
              ) : (
                <div className="bg-amber-500/10 rounded-full p-4">
                  <AlertCircle className="h-16 w-16 text-amber-500" />
                </div>
              )}
            </div>
            
            <div>
              <Badge 
                variant={verification.isValid ? "default" : "secondary"}
                className={`text-lg px-4 py-1 ${verification.isValid ? "bg-green-500 hover:bg-green-600" : "bg-amber-500 hover:bg-amber-600"}`}
              >
                {verification.isValid ? "DOCUMENTO VÁLIDO" : verification.status}
              </Badge>
            </div>

            <CardTitle className="text-2xl">{verification.athleteName}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Organização</p>
                <p className="font-semibold mt-1">{verification.tenantName}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Modalidade</p>
                <p className="font-semibold mt-1">{verification.sportType}</p>
              </div>
            </div>

            {verification.validUntil && (
              <div className="text-center bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Válido até</p>
                <p className="font-semibold text-lg mt-1">
                  {new Date(verification.validUntil).toLocaleDateString("pt-BR")}
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-4 border-t">
              <Shield className="h-4 w-4" />
              <span>Verificação autêntica emitida por {verification.tenantName}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

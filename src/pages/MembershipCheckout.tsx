import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, ArrowLeft, AlertTriangle } from "lucide-react";
import { logger } from "@/lib/logger";

export default function MembershipCheckout() {
  const { membershipId, tenantSlug } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [membership, setMembership] = useState<any>(null);
  const [feePaidAt, setFeePaidAt] = useState<string | null>(null);
  const [feeAmountCents, setFeeAmountCents] = useState<number | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [boundaryError, setBoundaryError] = useState(false);

  useEffect(() => {
    loadData();
  }, [membershipId]);

  async function loadData() {
    try {
      const [membershipRes, feeRes] = await Promise.all([
        supabase
          .from("memberships")
          .select(`*, athletes(full_name, email), tenants(name, slug)`)
          .eq("id", membershipId!)
          .maybeSingle(),
        supabase
          .from("membership_fees")
          .select("paid_at, amount_cents")
          .eq("membership_id", membershipId!)
          .maybeSingle(),
      ]);

      if (membershipRes.error) throw membershipRes.error;
      if (!membershipRes.data) {
        setMembership(null);
        return;
      }

      // Tenant boundary check
      if (tenantSlug && membershipRes.data.tenants?.slug !== tenantSlug) {
        setBoundaryError(true);
        return;
      }

      setMembership(membershipRes.data);

      if (feeRes.data) {
        setFeePaidAt(feeRes.data.paid_at);
        setFeeAmountCents(feeRes.data.amount_cents);
      }
    } catch (error) {
      logger.error("[CHECKOUT] Error loading membership:", error);
      toast.error("Erro ao carregar filiação");
    } finally {
      setIsLoadingData(false);
    }
  }

  async function handlePayment() {
    setIsLoading(true);
    try {
      const successUrl = `${window.location.origin}/${tenantSlug}/membership/${membershipId}/checkout?success=1`;
      const { data, error } = await supabase.functions.invoke(
        "create-membership-fee-checkout",
        {
          body: {
            membership_id: membershipId,
            tenant_id: membership.tenant_id,
            success_url: successUrl,
            cancel_url: window.location.href,
          },
        }
      );

      if (error) throw error;
      window.location.href = data.checkout_url;
    } catch (error) {
      logger.error("[CHECKOUT] Payment error:", error);
      toast.error("Erro ao processar pagamento");
      setIsLoading(false);
    }
  }

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (boundaryError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
            <CardTitle>Acesso não autorizado</CardTitle>
            <p className="text-sm text-muted-foreground">
              Esta filiação não pertence à organização atual.
            </p>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CardTitle className="mb-4">Filiação não encontrada</CardTitle>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const feeConfigured = feeAmountCents != null && feeAmountCents > 0;
  const feePaid = !!feePaidAt;
  const feeAmount = feeConfigured ? feeAmountCents / 100 : 0;

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Pagamento de Filiação</CardTitle>
          <CardDescription>
            Complete o pagamento para finalizar sua filiação
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Atleta</p>
            <p className="text-lg font-semibold text-foreground">{membership.athletes?.full_name}</p>
            <p className="text-sm text-muted-foreground">{membership.athletes?.email}</p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Organização</p>
            <p className="text-lg font-semibold text-foreground">{membership.tenants?.name}</p>
          </div>

          {!feeConfigured && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
              <p className="text-sm font-semibold text-destructive">
                Taxa de filiação não configurada
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Entre em contato com a organização.
              </p>
            </div>
          )}

          {feeConfigured && (
            <div className="rounded-lg border bg-muted/50 p-4 text-center">
              <p className="text-sm font-medium text-muted-foreground">Valor da Filiação</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                R$ {feeAmount.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pagamento único • Válido por 1 ano
              </p>
            </div>
          )}

          {feePaid && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                ✓ Pagamento já realizado
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Sua filiação está pendente de aprovação pela organização.
              </p>
            </div>
          )}

          {!feePaid && feeConfigured && (
            <Button onClick={handlePayment} disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pagar com Cartão
                </>
              )}
            </Button>
          )}

          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">🔒 Pagamento seguro processado pelo Stripe</p>
            <p className="text-xs text-muted-foreground">Seus dados de pagamento são criptografados</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

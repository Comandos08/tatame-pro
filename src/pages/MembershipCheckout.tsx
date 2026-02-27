import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CreditCard, ArrowLeft } from "lucide-react";

export default function MembershipCheckout() {
  const { membershipId } = useParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  // deno-lint-ignore no-explicit-any
  const [membership, setMembership] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    loadMembership();
  }, [membershipId]);

  async function loadMembership() {
    try {
      const { data, error } = await supabase
        .from("memberships")
        .select(`
          *,
          athletes(full_name, email),
          tenants(name, slug)
        `)
        .eq("id", membershipId!)
        .single();

      if (error) throw error;
      setMembership(data);
    } catch (error) {
      console.error("Error loading membership:", error);
      toast.error("Erro ao carregar filiação");
    } finally {
      setIsLoadingData(false);
    }
  }

  async function handlePayment() {
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-membership-fee-checkout",
        {
          body: {
            membership_id: membershipId,
            tenant_id: membership.tenant_id,
            success_url: `${window.location.origin}/${membership.tenants.slug}/membership/success`,
            cancel_url: window.location.href,
          },
        }
      );

      if (error) throw error;

      // Redirecionar para Stripe
      window.location.href = data.checkout_url;
    } catch (error) {
      console.error("Payment error:", error);
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

  const feeAmount = (membership.fee_amount_cents || 15000) / 100;

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
          {/* Informações do Atleta */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Atleta</p>
            <p className="text-lg font-semibold text-foreground">{membership.athletes?.full_name}</p>
            <p className="text-sm text-muted-foreground">{membership.athletes?.email}</p>
          </div>

          {/* Informações da Organização */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Organização</p>
            <p className="text-lg font-semibold text-foreground">{membership.tenants?.name}</p>
          </div>

          {/* Valor */}
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">Valor da Filiação</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              R$ {feeAmount.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Pagamento único • Válido por 1 ano
            </p>
          </div>

          {/* Status de Pagamento */}
          {membership.payment_status === "PAID" && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                ✓ Pagamento já realizado
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Sua filiação está pendente de aprovação pela organização.
              </p>
            </div>
          )}

          {/* Botão de Pagamento */}
          {membership.payment_status !== "PAID" && (
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

          {/* Informações de Segurança */}
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground">🔒 Pagamento seguro processado pelo Stripe</p>
            <p className="text-xs text-muted-foreground">Seus dados de pagamento são criptografados</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

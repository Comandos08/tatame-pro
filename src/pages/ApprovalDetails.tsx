import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ApprovalDetails() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();

  const {
    data: membership,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["approval-details", membershipId, tenant?.id],
    queryFn: async () => {
      if (!membershipId || !tenant?.id) return null;

      const { data, error } = await supabase
        .from("memberships")
        .select(
          `
          id,
          status,
          payment_status,
          created_at,
          start_date,
          end_date,
          price_cents,
          currency,
          applicant_data,
          applicant_profile_id,
          athlete_id,
          tenant_id
        `,
        )
        .eq("id", membershipId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (error) {
        console.error("ApprovalDetails fetch error:", error);
        throw error;
      }

      return data;
    },
    enabled: !!membershipId && !!tenant?.id,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <Card className="p-6">Carregando...</Card>
      </div>
    );
  }

  if (isError || !membership) {
    return (
      <div className="p-6">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <Card className="p-8 text-center text-muted-foreground">Não encontrado</Card>
      </div>
    );
  }

  const applicant = membership.applicant_data ?? {};

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Dados da Solicitação</h2>

        <div>
          <strong>Status:</strong> {membership.status}
        </div>

        <div>
          <strong>Status Pagamento:</strong> {membership.payment_status}
        </div>

        <div>
          <strong>Valor:</strong> {(membership.price_cents / 100).toFixed(2)} {membership.currency}
        </div>

        <div>
          <strong>Solicitado em:</strong> {new Date(membership.created_at).toLocaleString()}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Dados do Atleta</h2>

        <div>
          <strong>Nome:</strong> {applicant.full_name ?? "Não informado"}
        </div>

        <div>
          <strong>Email:</strong> {applicant.email ?? "Não informado"}
        </div>

        <div>
          <strong>Telefone:</strong> {applicant.phone ?? "Não informado"}
        </div>

        <div>
          <strong>Data de nascimento:</strong> {applicant.birth_date ?? "Não informado"}
        </div>
      </Card>
    </div>
  );
}

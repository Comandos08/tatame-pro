import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Loader2, FileText, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";

// ── P0-2: Immutable role constant ──────────────────────────────────
const DEFAULT_APPROVAL_ROLES = ['ATLETA'] as const;
const QUERY_KEY_PREFIX = 'membership-approval-detail';

// ── Local types (tolerant to partial JSONB) ────────────────────────
type ApplicantData = {
  full_name?: string;
  email?: string;
  phone?: string;
  birth_date?: string;
  gender?: string;
  national_id?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

function parseApplicantData(raw: unknown): ApplicantData {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as ApplicantData;
  }
  return {};
}

// ── Status badge helper ────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    PENDING_REVIEW: { label: "Pendente de Análise", className: "bg-accent text-accent-foreground" },
    APPROVED: { label: "Aprovado", className: "bg-primary/10 text-primary" },
    ACTIVE: { label: "Ativo", className: "bg-primary/10 text-primary" },
    CANCELLED: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
    EXPIRED: { label: "Expirado", className: "bg-muted text-muted-foreground" },
  };
  const info = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PAID: { label: "Pago", className: "bg-primary/10 text-primary" },
    NOT_PAID: { label: "Não Pago", className: "bg-destructive/10 text-destructive" },
    FAILED: { label: "Falhou", className: "bg-destructive/10 text-destructive" },
  };
  const info = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────
export default function ApprovalDetails() {
  const { approvalId } = useParams<{ approvalId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // ── P0-1: Deterministic query key ────────────────────────────────
  const QUERY_KEY = [QUERY_KEY_PREFIX, approvalId] as const;

  const {
    data: membership,
    isLoading,
    isError,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      if (!approvalId || !tenant?.id) return null;

      const { data, error } = await supabase
        .from("memberships")
        .select(
          `
          id, status, payment_status, type, created_at,
          start_date, end_date, price_cents, currency,
          review_notes, reviewed_at, applicant_data,
          rejection_reason,
          applicant_profile_id, athlete_id, academy_id,
          preferred_coach_id, documents_uploaded,
          athlete:athletes!athlete_id(
            id, full_name, email, phone, birth_date,
            gender, national_id, address_line1, address_line2,
            city, state, postal_code, country
          ),
          profile:profiles!applicant_profile_id(id, name, email),
          academy:academies!academy_id(id, name),
          coach:coaches!preferred_coach_id(id, full_name),
          digital_cards(id, qr_code_image_url, pdf_url)
        `,
        )
        .eq("id", approvalId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!approvalId && !!tenant?.id,
  });

  // ── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="p-6">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card className="p-8 text-center text-destructive">
          Erro ao carregar solicitação. Tente novamente.
        </Card>
      </div>
    );
  }

  // ── Not found state ──────────────────────────────────────────────
  if (!membership) {
    return (
      <div className="p-6">
        <Button variant="ghost" className="mb-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card className="p-8 text-center text-muted-foreground">
          Solicitação não encontrada.
        </Card>
      </div>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────
  const athlete = Array.isArray(membership.athlete) ? membership.athlete[0] : membership.athlete;
  const profile = Array.isArray(membership.profile) ? membership.profile[0] : membership.profile;
  const academy = Array.isArray(membership.academy) ? membership.academy[0] : membership.academy;
  const coach = Array.isArray(membership.coach) ? membership.coach[0] : membership.coach;
  const digitalCards = membership.digital_cards ?? [];
  const applicantData = parseApplicantData(membership.applicant_data);

  // ── applicantView (deterministic fallback) ───────────────────────
  const applicantView = {
    name: athlete?.full_name ?? profile?.name ?? applicantData.full_name ?? "Nome não informado",
    email: athlete?.email ?? profile?.email ?? applicantData.email ?? "Email não informado",
    phone: athlete?.phone ?? applicantData.phone ?? null,
    birthDate: athlete?.birth_date ?? applicantData.birth_date ?? null,
    gender: athlete?.gender ?? applicantData.gender ?? null,
    nationalId: athlete?.national_id ?? applicantData.national_id ?? null,
    address: athlete?.address_line1 ?? applicantData.address_line1 ?? null,
    city: athlete?.city ?? applicantData.city ?? null,
    state: athlete?.state ?? applicantData.state ?? null,
  };

  // ── State machine ────────────────────────────────────────────────
  const isPendingReview = membership.status === "PENDING_REVIEW";
  const isPaymentCompleted = membership.payment_status === "PAID";
  const canApproveOrReject = isPendingReview && isPaymentCompleted;

  const price =
    typeof membership.price_cents === "number"
      ? (membership.price_cents / 100).toFixed(2)
      : "0.00";

  const createdAt = membership.created_at
    ? new Date(membership.created_at as string).toLocaleString("pt-BR")
    : "Não informado";

  // ── Document preview ─────────────────────────────────────────────
  const handleViewDocument = async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error('Não foi possível abrir o documento.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  // ── Actions ──────────────────────────────────────────────────────
  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        membershipId: approvalId,
        roles: [...DEFAULT_APPROVAL_ROLES],
      };
      if (reviewNotes.trim()) body.reviewNotes = reviewNotes.trim();

      const { error } = await supabase.functions.invoke("approve-membership", { body });
      if (error) {
        toast.error("Erro ao aprovar solicitação.");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Solicitação aprovada com sucesso.");
    } catch {
      toast.error("Erro inesperado ao aprovar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("reject-membership", {
        body: {
          membershipId: approvalId,
          rejectionReason: rejectionReason.trim(),
        },
      });
      if (error) {
        toast.error("Erro ao rejeitar solicitação.");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Solicitação rejeitada.");
    } catch {
      toast.error("Erro inesperado ao rejeitar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Análise de Filiação</h1>
        </div>
        <StatusBadge status={membership.status} />
      </div>

      {/* Payment alert */}
      {!isPaymentCompleted && isPendingReview && (
        <Card className="p-4 border-accent bg-accent/50">
          <div className="flex items-center gap-2 text-accent-foreground">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">
              O pagamento desta solicitação ainda não foi confirmado. As ações de aprovação/rejeição estão desabilitadas até a confirmação do pagamento.
            </span>
          </div>
        </Card>
      )}

      {/* Card: Dados da Solicitação */}
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Dados da Solicitação</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Status</span>
            <div className="mt-1"><StatusBadge status={membership.status} /></div>
          </div>
          <div>
            <span className="text-muted-foreground">Pagamento</span>
            <div className="mt-1"><PaymentBadge status={membership.payment_status} /></div>
          </div>
          <div>
            <span className="text-muted-foreground">Valor</span>
            <p className="font-medium">{price} {membership.currency}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Tipo</span>
            <p className="font-medium">{membership.type ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Solicitado em</span>
            <p className="font-medium">{createdAt}</p>
          </div>
          {membership.reviewed_at && (
            <div>
              <span className="text-muted-foreground">Revisado em</span>
              <p className="font-medium">
                {new Date(membership.reviewed_at as string).toLocaleString("pt-BR")}
              </p>
            </div>
          )}
          {academy && (
            <div>
              <span className="text-muted-foreground">Academia</span>
              <p className="font-medium">{academy.name}</p>
            </div>
          )}
          {coach && (
            <div>
              <span className="text-muted-foreground">Coach</span>
              <p className="font-medium">{coach.full_name}</p>
            </div>
          )}
        </div>
        {membership.review_notes && (
          <div className="pt-2 border-t">
            <span className="text-sm text-muted-foreground">Notas do revisor</span>
            <p className="text-sm mt-1">{membership.review_notes}</p>
          </div>
        )}
      </Card>

      {/* Card: Dados do Atleta */}
      <Card className="p-6 space-y-3">
        <h2 className="text-lg font-semibold">Dados do Atleta</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Nome</span>
            <p className="font-medium">{applicantView.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Email</span>
            <p className="font-medium">{applicantView.email}</p>
          </div>
          {applicantView.phone && (
            <div>
              <span className="text-muted-foreground">Telefone</span>
              <p className="font-medium">{applicantView.phone}</p>
            </div>
          )}
          {applicantView.birthDate && (
            <div>
              <span className="text-muted-foreground">Data de nascimento</span>
              <p className="font-medium">{applicantView.birthDate}</p>
            </div>
          )}
          {applicantView.gender && (
            <div>
              <span className="text-muted-foreground">Gênero</span>
              <p className="font-medium">{applicantView.gender}</p>
            </div>
          )}
          {applicantView.nationalId && (
            <div>
              <span className="text-muted-foreground">Documento</span>
              <p className="font-medium">{applicantView.nationalId}</p>
            </div>
          )}
          {applicantView.address && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Endereço</span>
              <p className="font-medium">
                {[applicantView.address, applicantView.city, applicantView.state]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Card: Documentos */}
      {Array.isArray(membership.documents_uploaded) && membership.documents_uploaded.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentos
          </h2>
          <ul className="text-sm space-y-2">
            {(membership.documents_uploaded as Array<{ name?: string; type?: string; storage_path?: string }>).map(
              (doc, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    {doc.name ?? doc.type ?? `Documento ${i + 1}`}
                  </span>
                  {doc.storage_path && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleViewDocument(doc.storage_path!)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                  )}
                </li>
              ),
            )}
          </ul>
        </Card>
      )}

      {/* Card: Carteira Digital (optional) */}
      {Array.isArray(digitalCards) && digitalCards.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Carteira Digital
          </h2>
          {(digitalCards as Array<{ id: string; qr_code_image_url: string | null; pdf_url: string | null }>).map((card) => (
            <div key={card.id} className="text-sm space-y-1">
              {card.pdf_url && (
                <a
                  href={card.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  Baixar PDF
                </a>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* Card: Decisão */}
      {isPendingReview && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Decisão</h2>

          <div>
            <label className="text-sm text-muted-foreground block mb-1">
              Notas do revisor (opcional)
            </label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Observações sobre a solicitação..."
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            {/* Approve */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!canApproveOrReject || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Aprovar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar Aprovação</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deseja aprovar esta solicitação de filiação? Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleApprove} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar Aprovação
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Reject */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={!canApproveOrReject || isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Rejeitar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar Rejeição</AlertDialogTitle>
                  <AlertDialogDescription>
                    Informe o motivo da rejeição. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2">
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Motivo da rejeição..."
                    rows={3}
                    disabled={isSubmitting}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReject}
                    disabled={isSubmitting || rejectionReason.trim() === ""}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirmar Rejeição
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      )}

      {/* Rejection reason (if already cancelled with reason) */}
      {membership.status === "REJECTED" && membership.rejection_reason && (
        <Card className="p-6 border-destructive/30">
          <h2 className="text-lg font-semibold text-destructive mb-2">Motivo da Rejeição</h2>
          <p className="text-sm">{membership.rejection_reason}</p>
        </Card>
      )}
    </div>
  );
}

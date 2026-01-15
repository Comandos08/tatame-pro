import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar, 
  Mail, 
  Phone,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  CreditCard,
  Clock,
  Building2,
  QrCode,
  UserCheck
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  GENDER_LABELS,
  GenderType,
} from '@/types/membership';

interface MembershipDetails {
  id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  start_date: string | null;
  end_date: string | null;
  price_cents: number;
  currency: string;
  type: string;
  created_at: string;
  review_notes: string | null;
  reviewed_at: string | null;
  academy_id: string | null;
  preferred_coach_id: string | null;
  athlete: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    birth_date: string;
    gender: GenderType;
    national_id: string | null;
    city: string | null;
    state: string | null;
  };
  academy: {
    id: string;
    name: string;
  } | null;
  coach: {
    id: string;
    full_name: string;
  } | null;
  digital_cards: {
    id: string;
    qr_code_image_url: string;
    pdf_url: string;
  }[];
}

interface Document {
  id: string;
  type: string;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

interface Academy {
  id: string;
  name: string;
}

interface Coach {
  id: string;
  full_name: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID_DOCUMENT: 'Documento de Identidade',
  MEDICAL_CERTIFICATE: 'Atestado Médico',
  ADDRESS_PROOF: 'Comprovante de Residência',
  OTHER: 'Outro',
};

export default function ApprovalDetails() {
  const { tenant } = useTenant();
  const { currentUser, hasRole, isGlobalSuperadmin } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantSlug, membershipId } = useParams();
  
  const [reviewNotes, setReviewNotes] = useState('');
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedAcademyId, setSelectedAcademyId] = useState<string>('');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');

  const canApprove = isGlobalSuperadmin || 
    (tenant && (
      hasRole('ADMIN_TENANT', tenant.id) || 
      hasRole('STAFF_ORGANIZACAO', tenant.id) ||
      hasRole('COACH_PRINCIPAL', tenant.id)
    ));

  const { data: membership, isLoading, error } = useQuery({
    queryKey: ['approval-membership', membershipId],
    queryFn: async () => {
      if (!membershipId) return null;

      const { data, error } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          payment_status,
          start_date,
          end_date,
          price_cents,
          currency,
          type,
          created_at,
          review_notes,
          reviewed_at,
          academy_id,
          preferred_coach_id,
          athlete:athletes(id, full_name, email, phone, birth_date, gender, national_id, city, state),
          academy:academies!academy_id(id, name),
          coach:coaches!preferred_coach_id(id, full_name),
          digital_cards(id, qr_code_image_url, pdf_url)
        `)
        .eq('id', membershipId)
        .maybeSingle();

      if (error) throw error;
      
      const result = data as unknown as MembershipDetails;
      
      // Initialize selections from existing data
      if (result?.academy_id) {
        setSelectedAcademyId(result.academy_id);
      }
      if (result?.preferred_coach_id) {
        setSelectedCoachId(result.preferred_coach_id);
      }
      
      return result;
    },
    enabled: !!membershipId,
  });

  const { data: documents } = useQuery({
    queryKey: ['athlete-documents', membership?.athlete?.id],
    queryFn: async () => {
      if (!membership?.athlete?.id) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('id, type, file_url, file_type, created_at')
        .eq('athlete_id', membership.athlete.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Document[];
    },
    enabled: !!membership?.athlete?.id,
  });

  // Fetch academies
  const { data: academies } = useQuery({
    queryKey: ['academies-for-approval', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academies')
        .select('id, name')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Academy[];
    },
    enabled: !!tenant?.id,
  });

  // Fetch coaches
  const { data: coaches } = useQuery({
    queryKey: ['coaches-for-approval', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coaches')
        .select('id, full_name')
        .eq('tenant_id', tenant!.id)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as Coach[];
    },
    enabled: !!tenant?.id,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId || !currentUser || !membership) throw new Error('Missing data');

      const now = new Date();
      const startDate = now.toISOString().split('T')[0];
      const endDate = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString().split('T')[0];

      // Update membership with academy and coach
      const { error: updateError } = await supabase
        .from('memberships')
        .update({
          status: 'APPROVED',
          start_date: startDate,
          end_date: endDate,
          review_notes: reviewNotes || null,
          reviewed_by_profile_id: currentUser.id,
          reviewed_at: new Date().toISOString(),
          academy_id: selectedAcademyId || null,
          preferred_coach_id: selectedCoachId || null,
        })
        .eq('id', membershipId);

      if (updateError) throw updateError;

      // Update athlete's current academy and coach if this is their first/active membership
      if (membership.athlete?.id && (selectedAcademyId || selectedCoachId)) {
        const athleteUpdate: Record<string, string | null> = {};
        if (selectedAcademyId) {
          athleteUpdate.current_academy_id = selectedAcademyId;
        }
        if (selectedCoachId) {
          athleteUpdate.current_main_coach_id = selectedCoachId;
        }
        
        await supabase
          .from('athletes')
          .update(athleteUpdate)
          .eq('id', membership.athlete.id);
      }

      // Check if digital card already exists
      const { data: existingCard } = await supabase
        .from('digital_cards')
        .select('id')
        .eq('membership_id', membershipId)
        .maybeSingle();

      // If no card exists and payment is done, generate one
      if (!existingCard && membership?.payment_status === 'PAID') {
        try {
          await supabase.functions.invoke('generate-digital-card', {
            body: { membershipId },
          });
        } catch (cardError) {
          console.error('Error generating digital card:', cardError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-membership'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['athletes-list'] });
      setIsApproveDialogOpen(false);
      toast.success('Filiação aprovada com sucesso!');
      navigate(`/${tenantSlug}/app/approvals`);
    },
    onError: (error) => {
      toast.error('Erro ao aprovar filiação');
      console.error(error);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId || !currentUser) throw new Error('Missing data');

      const { error } = await supabase
        .from('memberships')
        .update({
          status: 'CANCELLED',
          review_notes: reviewNotes || 'Filiação rejeitada',
          reviewed_by_profile_id: currentUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', membershipId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-membership'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setIsRejectDialogOpen(false);
      toast.success('Filiação rejeitada');
      navigate(`/${tenantSlug}/app/approvals`);
    },
    onError: (error) => {
      toast.error('Erro ao rejeitar filiação');
      console.error(error);
    },
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  const getStatusColor = (status: MembershipStatus) => {
    switch (status) {
      case 'ACTIVE':
      case 'APPROVED':
        return 'bg-success text-success-foreground';
      case 'PENDING_REVIEW':
        return 'bg-warning text-warning-foreground';
      case 'CANCELLED':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  if (!tenant) return null;

  if (!canApprove) {
    return (
      <AppShell>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-muted-foreground">Você não tem permissão para acessar esta página</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const digitalCard = membership?.digital_cards?.[0];
  const isPendingReview = membership?.status === 'PENDING_REVIEW';

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/${tenantSlug}/app/approvals`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para aprovações
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || !membership ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">Filiação não encontrada</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="font-display text-2xl">
                        Análise de Filiação
                      </CardTitle>
                      <CardDescription>
                        #{membership.id.substring(0, 8).toUpperCase()} - {tenant.name}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(membership.status)}>
                        {MEMBERSHIP_STATUS_LABELS[membership.status]}
                      </Badge>
                      <Badge variant={membership.payment_status === 'PAID' ? 'outline' : 'destructive'}>
                        <CreditCard className="h-3 w-3 mr-1" />
                        {PAYMENT_STATUS_LABELS[membership.payment_status]}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-6">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Solicitado em</p>
                        <p className="font-medium">{formatDate(membership.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valor</p>
                        <p className="font-medium">{formatCurrency(membership.price_cents)}</p>
                      </div>
                    </div>
                    {membership.academy && (
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Academia</p>
                          <p className="font-medium">{membership.academy.name}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Athlete Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Dados do Atleta
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Nome completo</p>
                      <p className="font-medium">{membership.athlete?.full_name}</p>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Data de nascimento</p>
                        <p className="font-medium">{formatDate(membership.athlete?.birth_date)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gênero</p>
                        <p className="font-medium">
                          {GENDER_LABELS[membership.athlete?.gender]}
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" /> E-mail
                      </p>
                      <p className="font-medium">{membership.athlete?.email}</p>
                    </div>
                    {membership.athlete?.phone && (
                      <div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> Telefone
                        </p>
                        <p className="font-medium">{membership.athlete.phone}</p>
                      </div>
                    )}
                    {membership.athlete?.national_id && (
                      <div>
                        <p className="text-sm text-muted-foreground">CPF/Documento</p>
                        <p className="font-medium">{membership.athlete.national_id}</p>
                      </div>
                    )}
                    {(membership.athlete?.city || membership.athlete?.state) && (
                      <div>
                        <p className="text-sm text-muted-foreground">Localização</p>
                        <p className="font-medium">
                          {[membership.athlete.city, membership.athlete.state].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Documents */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Documentos Enviados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {documents && documents.length > 0 ? (
                      <div className="space-y-3">
                        {documents.map((doc) => (
                          <div 
                            key={doc.id}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">
                                  {DOCUMENT_TYPE_LABELS[doc.type] || doc.type}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Enviado em {formatDate(doc.created_at)}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(doc.file_url, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Nenhum documento enviado
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Digital Card Preview */}
            {digitalCard && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <QrCode className="h-5 w-5" />
                      Carteira Digital
                    </CardTitle>
                    <CardDescription>
                      Carteira já gerada para este atleta
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <img 
                        src={digitalCard.qr_code_image_url} 
                        alt="QR Code"
                        className="w-24 h-24 rounded-lg"
                      />
                      <Button 
                        variant="outline"
                        onClick={() => window.open(digitalCard.pdf_url, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Ver PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Action Buttons */}
            {isPendingReview && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5" />
                      Decisão e Vínculo
                    </CardTitle>
                    <CardDescription>
                      Defina a academia e coach do atleta antes de aprovar
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Academy and Coach Selection */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="academy">Academia do Atleta</Label>
                        <Select value={selectedAcademyId} onValueChange={setSelectedAcademyId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a academia" />
                          </SelectTrigger>
                          <SelectContent>
                            {academies?.map((academy) => (
                              <SelectItem key={academy.id} value={academy.id}>
                                {academy.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coach">Coach Responsável</Label>
                        <Select value={selectedCoachId} onValueChange={setSelectedCoachId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o coach" />
                          </SelectTrigger>
                          <SelectContent>
                            {coaches?.map((coach) => (
                              <SelectItem key={coach.id} value={coach.id}>
                                {coach.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2">
                      <Label htmlFor="notes">Observações (opcional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="Adicione observações sobre a análise..."
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-4 pt-2">
                      <Button 
                        className="flex-1"
                        onClick={() => setIsApproveDialogOpen(true)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Aprovar Filiação
                      </Button>
                      <Button 
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setIsRejectDialogOpen(true)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Rejeitar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}

        {/* Approve Dialog */}
        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Aprovação</DialogTitle>
              <DialogDescription>
                Você está prestes a aprovar a filiação de {membership?.athlete?.full_name}.
                {selectedAcademyId && academies && (
                  <span className="block mt-2">
                    <strong>Academia:</strong> {academies.find(a => a.id === selectedAcademyId)?.name}
                  </span>
                )}
                {selectedCoachId && coaches && (
                  <span className="block">
                    <strong>Coach:</strong> {coaches.find(c => c.id === selectedCoachId)?.full_name}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar Aprovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Rejeição</DialogTitle>
              <DialogDescription>
                Você está prestes a rejeitar a filiação de {membership?.athlete?.full_name}.
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Motivo da rejeição</Label>
              <Textarea
                id="reject-reason"
                placeholder="Informe o motivo da rejeição..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => rejectMutation.mutate()} 
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar Rejeição
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

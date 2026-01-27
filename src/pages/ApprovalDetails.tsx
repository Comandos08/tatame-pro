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
  Building2,
  QrCode,
  UserCheck,
  MapPin,
  ShieldAlert
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type { AppRole } from '@/types/auth';

// Type for applicant_data JSONB
interface ApplicantData {
  full_name: string;
  birth_date: string;
  national_id: string;
  gender: GenderType;
  email: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

// Type for documents_uploaded JSONB
interface DocumentUploaded {
  type: string;
  storage_path: string;
  file_type: string;
}

interface MembershipApplication {
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
  applicant_data: ApplicantData | null;
  applicant_profile_id: string | null;
  documents_uploaded: DocumentUploaded[] | null;
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
  const { t } = useI18n();
  
  const [reviewNotes, setReviewNotes] = useState('');
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedAcademyId, setSelectedAcademyId] = useState<string>('');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  
  // Role selection state - ATLETA is pre-selected by default
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(['ATLETA']);
  
  // Available roles that can be assigned during approval
  const ASSIGNABLE_ROLES: { value: AppRole; label: string; description: string }[] = [
    { value: 'ATLETA', label: t('roles.athlete'), description: t('roles.athleteDesc') },
    { value: 'COACH_ASSISTENTE', label: t('roles.assistantCoach'), description: t('roles.assistantCoachDesc') },
    { value: 'COACH_PRINCIPAL', label: t('roles.headCoach'), description: t('roles.headCoachDesc') },
    { value: 'INSTRUTOR', label: t('roles.instructor'), description: t('roles.instructorDesc') },
    { value: 'STAFF_ORGANIZACAO', label: t('roles.staff'), description: t('roles.staffDesc') },
  ];
  
  const toggleRole = (role: AppRole) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };
  
  const hasMinimumRoleSelected = selectedRoles.length > 0;

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
          applicant_data,
          applicant_profile_id,
          documents_uploaded,
          academy:academies!academy_id(id, name),
          coach:coaches!preferred_coach_id(id, full_name),
          digital_cards(id, qr_code_image_url, pdf_url)
        `)
        .eq('id', membershipId)
        .maybeSingle();

      if (error) throw error;
      
      const result = data as unknown as MembershipApplication;
      
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

  // Download temporary document
  const handleDownloadDocument = async (doc: DocumentUploaded) => {
    setDownloadingDoc(doc.storage_path);
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .download(doc.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.storage_path.split('/').pop() || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      toast.error(t('common.error'));
    } finally {
      setDownloadingDoc(null);
    }
  };

  // APPROVE via edge function - NOW WITH ROLE SELECTION
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId) throw new Error('Missing data');
      
      // CRITICAL: At least one role must be selected
      if (selectedRoles.length === 0) {
        throw new Error(t('approval.roleRequired'));
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('approve-membership', {
        body: {
          membershipId,
          academyId: selectedAcademyId || null,
          coachId: selectedCoachId || null,
          reviewNotes: reviewNotes || null,
          // NEW: Pass selected roles to backend
          roles: selectedRoles,
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-membership'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['athletes-list'] });
      setIsApproveDialogOpen(false);
      setSelectedRoles(['ATLETA']); // Reset for next approval
      toast.success(t('approval.successApprove'));
      navigate(`/${tenantSlug}/app/approvals`);
    },
    onError: (error) => {
      toast.error(error.message || t('approval.errorApprove'));
      console.error(error);
    },
  });

  // REJECT via edge function
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!membershipId) throw new Error('Missing data');

      if (!reviewNotes || reviewNotes.trim().length === 0) {
        throw new Error(t('approval.rejectReasonRequired'));
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('reject-membership', {
        body: {
          membershipId,
          reason: reviewNotes.trim(),
        },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-membership'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setIsRejectDialogOpen(false);
      toast.success(t('approval.successReject'));
      navigate(`/${tenantSlug}/app/approvals`);
    },
    onError: (error) => {
      toast.error(error.message || t('approval.errorReject'));
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
            <p className="text-muted-foreground">{t('common.accessDenied')}</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const digitalCard = membership?.digital_cards?.[0];
  const isPendingReview = membership?.status === 'PENDING_REVIEW';
  const applicantData = membership?.applicant_data;

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
            {t('common.back')}
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
              <p className="text-muted-foreground">{t('common.notFound')}</p>
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
                        {t('approval.reviewTitle')}
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
                        <p className="text-sm text-muted-foreground">{t('approval.requestedAt')}</p>
                        <p className="font-medium">{formatDate(membership.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('common.value')}</p>
                        <p className="font-medium">{formatCurrency(membership.price_cents)}</p>
                      </div>
                    </div>
                    {membership.academy && (
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('common.academy')}</p>
                          <p className="font-medium">{membership.academy.name}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Applicant Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      {t('approval.athleteData')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {applicantData ? (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('membership.form.fullName')}</p>
                          <p className="font-medium">{applicantData.full_name}</p>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.birthDate')}</p>
                            <p className="font-medium">{formatDate(applicantData.birth_date)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.gender')}</p>
                            <p className="font-medium">
                              {GENDER_LABELS[applicantData.gender] || applicantData.gender}
                            </p>
                          </div>
                        </div>
                        <Separator />
                        <div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {t('common.email')}
                          </p>
                          <p className="font-medium">{applicantData.email}</p>
                        </div>
                        {applicantData.phone && (
                          <div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {t('common.phone')}
                            </p>
                            <p className="font-medium">{applicantData.phone}</p>
                          </div>
                        )}
                        {applicantData.national_id && (
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.nationalId')}</p>
                            <p className="font-medium">{applicantData.national_id}</p>
                          </div>
                        )}
                        {(applicantData.city || applicantData.state) && (
                          <div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {t('common.location')}
                            </p>
                            <p className="font-medium">
                              {[applicantData.city, applicantData.state].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        )}
                        {applicantData.address_line1 && (
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.address')}</p>
                            <p className="font-medium text-sm">
                              {applicantData.address_line1}
                              {applicantData.address_line2 && `, ${applicantData.address_line2}`}
                              {applicantData.postal_code && ` - ${applicantData.postal_code}`}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <User className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {t('common.noData')}
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
                      {t('approval.documentsUploaded')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {membership.documents_uploaded && membership.documents_uploaded.length > 0 ? (
                      <div className="space-y-3">
                        {membership.documents_uploaded.map((doc, index) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-3 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">
                                  {DOCUMENT_TYPE_LABELS[doc.type] || doc.type}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {doc.file_type}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={downloadingDoc === doc.storage_path}
                              onClick={() => handleDownloadDocument(doc)}
                            >
                              {downloadingDoc === doc.storage_path ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {t('common.noDocuments')}
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
                      {t('athlete.digitalCard')}
                    </CardTitle>
                    <CardDescription>
                      {t('approval.cardGenerated')}
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
                        {t('common.viewPdf')}
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
                      {t('approval.decisionAndLink')}
                    </CardTitle>
                    <CardDescription>
                      {t('approval.selectAcademyCoach')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Academy and Coach Selection */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="academy">{t('common.academy')}</Label>
                        <Select value={selectedAcademyId} onValueChange={setSelectedAcademyId}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('approval.selectAcademy')} />
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
                        <Label htmlFor="coach">{t('common.coach')}</Label>
                        <Select value={selectedCoachId} onValueChange={setSelectedCoachId}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('approval.selectCoach')} />
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
                      <Label htmlFor="notes">{t('approval.notes')}</Label>
                      <Textarea
                        id="notes"
                        placeholder={t('approval.notesPlaceholder')}
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
                        {t('approval.approve')}
                      </Button>
                      <Button 
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setIsRejectDialogOpen(true)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {t('approval.reject')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}

        {/* Approve Dialog - WITH ROLE SELECTION */}
        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('approval.confirmApprove')}</DialogTitle>
              <DialogDescription>
                {t('approval.confirmApproveMessage')} <strong>{applicantData?.full_name}</strong>.
              </DialogDescription>
            </DialogHeader>
            
            {/* Role Selection - MANDATORY */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">{t('approval.selectRoles')}</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('approval.selectRolesDescription')}
                </p>
              </div>
              
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                {ASSIGNABLE_ROLES.map((role) => (
                  <div key={role.value} className="flex items-start space-x-3">
                    <Checkbox
                      id={`role-${role.value}`}
                      checked={selectedRoles.includes(role.value)}
                      onCheckedChange={() => toggleRole(role.value)}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <label
                        htmlFor={`role-${role.value}`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        {role.label}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Responsibility Warning */}
              <Alert variant="default" className="border-warning bg-warning/10">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {t('approval.roleWarning')}
                </AlertDescription>
              </Alert>

              {/* Summary */}
              {(selectedAcademyId || selectedCoachId) && (
                <div className="text-sm space-y-1 pt-2 border-t">
                  {selectedAcademyId && academies && (
                    <p><strong>{t('common.academy')}:</strong> {academies.find(a => a.id === selectedAcademyId)?.name}</p>
                  )}
                  {selectedCoachId && coaches && (
                    <p><strong>{t('common.coach')}:</strong> {coaches.find(c => c.id === selectedCoachId)?.full_name}</p>
                  )}
                </div>
              )}
            </div>
            
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={() => approveMutation.mutate()} 
                disabled={approveMutation.isPending || !hasMinimumRoleSelected}
              >
                {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('approval.confirmApprove')} ({selectedRoles.length} {selectedRoles.length === 1 ? t('approval.role') : t('approval.roles')})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('approval.confirmReject')}</DialogTitle>
              <DialogDescription>
                {t('approval.confirmRejectMessage')} {applicantData?.full_name}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reject-reason">{t('approval.rejectReason')}</Label>
              <Textarea
                id="reject-reason"
                placeholder={t('approval.rejectReasonPlaceholder')}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => rejectMutation.mutate()} 
                disabled={rejectMutation.isPending || !reviewNotes.trim()}
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t('approval.confirmReject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

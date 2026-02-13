import { useState } from 'react';
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
import { LoadingState } from '@/components/ux/LoadingState';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { logger } from '@/lib/logger';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate, formatCurrency } from '@/lib/i18n/formatters';
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

// Type for applicant_data JSONB — all fields optional for fallback tolerance
interface ApplicantData {
  full_name?: string;
  birth_date?: string;
  national_id?: string;
  gender?: GenderType;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
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
  athlete_id: string | null;
  athlete: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
    gender: string | null;
    national_id: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  documents_uploaded: DocumentUploaded[] | null;
  profile: {
    id: string;
    name: string | null;
    email: string;
  } | null;
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
  const { } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantSlug, membershipId } = useParams();
  const { t, locale } = useI18n();
  
  const [reviewNotes, setReviewNotes] = useState('');
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedAcademyId, setSelectedAcademyId] = useState<string>('');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('');
  const [downloadingDoc, setDownloadingDoc] = useState<string | null>(null);
  
  // Role selection state - ATLETA is pre-selected by default
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(['ATLETA']);
  
  // Available roles that can be assigned during membership approval.
  // NOTE: ADMIN_TENANT is NOT assignable here — tenant admin assignment
  // is managed exclusively via ManageAdminsDialog (create-tenant-admin edge function).
  const ASSIGNABLE_ROLES: { value: AppRole; label: string; description: string }[] = [
    { value: 'ATLETA', label: t('roles.athlete'), description: t('roles.athleteDesc') },
  ];
  
  const toggleRole = (role: AppRole) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };
  
  const hasMinimumRoleSelected = selectedRoles.length > 0;

  const { can: canFeature } = usePermissions();
  const canApprove = canFeature('TENANT_APPROVALS');

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
          athlete_id,
          athlete:athletes!athlete_id(
            id,
            full_name,
            email,
            phone,
            birth_date,
            gender,
            national_id,
            address_line1,
            address_line2,
            city,
            state,
            postal_code,
            country
          ),
          documents_uploaded,
          profile:profiles!applicant_profile_id(id, name, email),
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
      logger.error('Download error:', err);
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

      if (error) {
        throw new Error(error?.message || t('approval.errorApprove'));
      }

      // A07 envelope unwrap
      const payload = data?.data ?? data;
      if (payload?.error || payload?.ok === false) {
        const msgKey = payload?.messageKey || payload?.error?.message || payload?.error;
        throw new Error(typeof msgKey === 'string' ? msgKey : t('approval.errorApprove'));
      }

      return payload;
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
      logger.error(error);
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
      logger.error(error);
    },
  });


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

  if (!tenant) return <LoadingState titleKey="common.loading" />;

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
  const isPaymentCompleted = membership?.payment_status === 'PAID';
  const canApproveOrReject = isPendingReview && isPaymentCompleted;

  // Deterministic display derivation: athlete > profile > applicant_data > fallback
  const displayName = membership?.athlete?.full_name
    ?? membership?.profile?.name
    ?? membership?.applicant_data?.full_name
    ?? 'Nome não disponível';

  const displayEmail = membership?.athlete?.email
    ?? membership?.profile?.email
    ?? membership?.applicant_data?.email
    ?? 'Email não disponível';

  const applicantView = membership ? {
    full_name: displayName,
    email: displayEmail,
    phone: membership.applicant_data?.phone ?? membership.athlete?.phone ?? null,
    birth_date: membership.applicant_data?.birth_date ?? membership.athlete?.birth_date ?? null,
    gender: membership.applicant_data?.gender ?? membership.athlete?.gender ?? null,
    national_id: membership.applicant_data?.national_id ?? membership.athlete?.national_id ?? null,
    city: membership.applicant_data?.city ?? membership.athlete?.city ?? null,
    state: membership.applicant_data?.state ?? membership.athlete?.state ?? null,
    address_line1: membership.applicant_data?.address_line1 ?? membership.athlete?.address_line1 ?? null,
    address_line2: membership.applicant_data?.address_line2 ?? membership.athlete?.address_line2 ?? null,
    postal_code: membership.applicant_data?.postal_code ?? membership.athlete?.postal_code ?? null,
    country: membership.applicant_data?.country ?? membership.athlete?.country ?? null,
  } : null;

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
                        <p className="font-medium">{formatDate(membership.created_at, locale)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('common.value')}</p>
                        <p className="font-medium">{formatCurrency(membership.price_cents, locale)}</p>
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
                    {applicantView ? (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">{t('membership.form.fullName')}</p>
                          <p className="font-medium">{applicantView.full_name}</p>
                        </div>
                        <Separator />
                        {(applicantView.birth_date || applicantView.gender) && (
                          <div className="grid grid-cols-2 gap-4">
                            {applicantView.birth_date && (
                              <div>
                                <p className="text-sm text-muted-foreground">{t('membership.form.birthDate')}</p>
                                <p className="font-medium">{formatDate(applicantView.birth_date, locale)}</p>
                              </div>
                            )}
                            {applicantView.gender && (
                              <div>
                                <p className="text-sm text-muted-foreground">{t('membership.form.gender')}</p>
                                <p className="font-medium">
                                  {GENDER_LABELS[applicantView.gender as GenderType] || applicantView.gender}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        <Separator />
                        <div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {t('common.email')}
                          </p>
                          <p className="font-medium">{applicantView.email}</p>
                        </div>
                        {applicantView.phone && (
                          <div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {t('common.phone')}
                            </p>
                            <p className="font-medium">{applicantView.phone}</p>
                          </div>
                        )}
                        {applicantView.national_id && (
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.nationalId')}</p>
                            <p className="font-medium">{applicantView.national_id}</p>
                          </div>
                        )}
                        {(applicantView.city || applicantView.state) && (
                          <div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {t('common.location')}
                            </p>
                            <p className="font-medium">
                              {[applicantView.city, applicantView.state].filter(Boolean).join(', ')}
                            </p>
                          </div>
                        )}
                        {applicantView.address_line1 && (
                          <div>
                            <p className="text-sm text-muted-foreground">{t('membership.form.address')}</p>
                            <p className="font-medium text-sm">
                              {applicantView.address_line1}
                              {applicantView.address_line2 && `, ${applicantView.address_line2}`}
                              {applicantView.postal_code && ` - ${applicantView.postal_code}`}
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
                    {isPendingReview && !isPaymentCompleted && (
                      <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {t('approval.paymentRequired')}
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="flex gap-4 pt-2">
                      <Button 
                        className="flex-1"
                        onClick={() => setIsApproveDialogOpen(true)}
                        disabled={!canApproveOrReject}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('approval.approve')}
                      </Button>
                      <Button 
                        variant="destructive"
                        className="flex-1"
                        onClick={() => setIsRejectDialogOpen(true)}
                        disabled={!isPendingReview}
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
                {t('approval.confirmApproveMessage')} <strong>{displayName}</strong>.
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
                {t('approval.confirmRejectMessage')} {displayName}.
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

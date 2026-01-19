import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { 
  User, 
  Award, 
  CreditCard, 
  FileText, 
  Calendar,
  Building2,
  Download,
  QrCode,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { MEMBERSHIP_STATUS_LABELS } from '@/types/membership';
import { EditablePersonalData } from '@/components/athlete/EditablePersonalData';
import { DocumentsSection } from '@/components/athlete/DocumentsSection';
import { RenewalBanner } from '@/components/membership/RenewalBanner';
import { ProvisionalCard } from '@/components/athlete/ProvisionalCard';

interface AthleteData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  gender: string;
  national_id: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  current_academy_id: string | null;
  current_main_coach_id: string | null;
  current_academy: {
    id: string;
    name: string;
  } | null;
  current_coach: {
    id: string;
    full_name: string;
  } | null;
}

interface MembershipData {
  id: string;
  status: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  payment_status: string;
  academy: {
    id: string;
    name: string;
  } | null;
  digital_cards: {
    id: string;
    qr_code_image_url: string | null;
    pdf_url: string | null;
    valid_until: string | null;
  }[];
}

interface GradingData {
  id: string;
  promotion_date: string;
  notes: string | null;
  grading_levels: {
    id: string;
    code: string;
    display_name: string;
    order_index: number;
    grading_schemes: {
      id: string;
      name: string;
      sport_type: string;
    };
  };
  academies: {
    id: string;
    name: string;
  } | null;
  coaches: {
    id: string;
    full_name: string;
  } | null;
  diplomas: {
    id: string;
    serial_number: string;
    pdf_url: string | null;
    status: string;
  } | null;
}

interface DiplomaData {
  id: string;
  serial_number: string;
  promotion_date: string;
  status: string;
  pdf_url: string | null;
  grading_levels: {
    display_name: string;
    grading_schemes: {
      sport_type: string;
    };
  };
  academies: {
    name: string;
  } | null;
}

export default function AthleteArea() {
  const { tenant } = useTenant();
  const { currentUser, hasRole, isGlobalSuperadmin } = useCurrentUser();
  const { t } = useI18n();

  // Check if user is an athlete (not an admin/staff)
  const isAdmin = tenant && (
    isGlobalSuperadmin ||
    hasRole('ADMIN_TENANT', tenant.id) ||
    hasRole('STAFF_ORGANIZACAO', tenant.id)
  );

  // Fetch athlete data linked to current user's profile
  const { data: athlete, isLoading: athleteLoading, error: athleteError } = useQuery({
    queryKey: ['my-athlete', currentUser?.id, tenant?.id],
    queryFn: async () => {
      if (!currentUser?.id || !tenant?.id) return null;

      const { data, error } = await supabase
        .from('athletes')
        .select(`
          id,
          full_name,
          email,
          phone,
          birth_date,
          gender,
          national_id,
          city,
          state,
          country,
          address_line1,
          address_line2,
          postal_code,
          current_academy_id,
          current_main_coach_id,
          current_academy:academies!current_academy_id(id, name),
          current_coach:coaches!current_main_coach_id(id, full_name)
        `)
        .eq('profile_id', currentUser.id)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as AthleteData;
    },
    enabled: !!currentUser?.id && !!tenant?.id,
  });

  // Fetch memberships
  const { data: memberships, isLoading: membershipsLoading } = useQuery({
    queryKey: ['my-memberships', athlete?.id, tenant?.id],
    queryFn: async () => {
      if (!athlete?.id || !tenant?.id) return [];

      const { data, error } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          type,
          start_date,
          end_date,
          payment_status,
          academy:academies!academy_id(id, name),
          digital_cards(id, qr_code_image_url, pdf_url, valid_until)
        `)
        .eq('athlete_id', athlete.id)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as MembershipData[];
    },
    enabled: !!athlete?.id && !!tenant?.id,
  });

  // Fetch gradings for timeline
  const { data: gradings, isLoading: gradingsLoading } = useQuery({
    queryKey: ['my-gradings', athlete?.id, tenant?.id],
    queryFn: async () => {
      if (!athlete?.id || !tenant?.id) return [];

      const { data, error } = await supabase
        .from('athlete_gradings')
        .select(`
          id,
          promotion_date,
          notes,
          grading_levels:grading_level_id (
            id, code, display_name, order_index,
            grading_schemes:grading_scheme_id (id, name, sport_type)
          ),
          academies:academy_id (id, name),
          coaches:coach_id (id, full_name),
          diplomas:diploma_id (id, serial_number, pdf_url, status)
        `)
        .eq('athlete_id', athlete.id)
        .eq('tenant_id', tenant.id)
        .order('promotion_date', { ascending: false });

      if (error) throw error;
      return data as unknown as GradingData[];
    },
    enabled: !!athlete?.id && !!tenant?.id,
  });

  // Fetch all diplomas
  const { data: diplomas, isLoading: diplomasLoading } = useQuery({
    queryKey: ['my-diplomas', athlete?.id, tenant?.id],
    queryFn: async () => {
      if (!athlete?.id || !tenant?.id) return [];

      const { data, error } = await supabase
        .from('diplomas')
        .select(`
          id,
          serial_number,
          promotion_date,
          status,
          pdf_url,
          grading_levels:grading_level_id (
            display_name,
            grading_schemes:grading_scheme_id (sport_type)
          ),
          academies:academy_id (name)
        `)
        .eq('athlete_id', athlete.id)
        .eq('tenant_id', tenant.id)
        .eq('status', 'ISSUED')
        .order('promotion_date', { ascending: false });

      if (error) throw error;
      return data as unknown as DiplomaData[];
    },
    enabled: !!athlete?.id && !!tenant?.id,
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const maskNationalId = (id: string | null) => {
    if (!id) return '-';
    if (id.length <= 4) return '***' + id;
    return '***.' + id.slice(-4);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-success text-success-foreground';
      case 'PENDING_REVIEW':
      case 'PENDING_PAYMENT':
        return 'bg-warning text-warning-foreground';
      case 'APPROVED':
        return 'bg-info text-info-foreground';
      case 'EXPIRED':
      case 'CANCELLED':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const activeMembership = memberships?.find(m => m.status === 'ACTIVE' || m.status === 'APPROVED');
  const activeDigitalCard = activeMembership?.digital_cards?.[0];
  const currentGrading = gradings?.[0];

  // Calculate days until expiry for renewal banner
  const renewalInfo = useMemo(() => {
    if (!activeMembership?.end_date) return null;
    const endDate = new Date(activeMembership.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
      membershipId: activeMembership.id,
      daysUntilExpiry,
      endDate: activeMembership.end_date,
      status: activeMembership.status,
    };
  }, [activeMembership]);

  if (!tenant) return null;

  // Show message for admins
  if (isAdmin && !athlete) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
            <User className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-2">{t('athleteArea.adminMessage')}</h1>
          <p className="text-muted-foreground max-w-md">
            {t('athleteArea.adminMessageDesc')}
          </p>
        </div>
      </AppShell>
    );
  }

  if (athleteLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  if (athleteError || !athlete) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-2">{t('athleteArea.noAthleteFound')}</h1>
          <p className="text-muted-foreground max-w-md">
            {t('athleteArea.noAthleteFoundDesc')}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Renewal Banner - Shows when membership is expiring soon */}
        {renewalInfo && (
          <RenewalBanner
            membershipId={renewalInfo.membershipId}
            daysUntilExpiry={renewalInfo.daysUntilExpiry}
            endDate={renewalInfo.endDate}
            status={renewalInfo.status}
          />
        )}
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 pb-0">
              <div className="flex flex-col sm:flex-row items-start gap-4 pb-6">
                <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                    {getInitials(athlete.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h1 className="text-2xl sm:text-3xl font-display font-bold">{athlete.full_name}</h1>
                  <p className="text-muted-foreground">{tenant.name}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {tenant.sportTypes?.map((sport) => (
                      <Badge key={sport} variant="secondary">{sport}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">{gradings?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('athleteArea.gradings')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">{diplomas?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('athleteArea.diplomas')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">{memberships?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">{t('athleteArea.memberships')}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <Badge className={getStatusColor(activeMembership?.status || 'DRAFT')}>
                    {activeMembership ? (MEMBERSHIP_STATUS_LABELS as any)[activeMembership.status] : t('athleteArea.noMembership')}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">{t('athleteArea.membershipStatus')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Personal Data Card - Editable */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <EditablePersonalData athlete={athlete} tenantId={tenant.id} />
          </motion.div>

          {/* Digital Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  {t('athleteArea.digitalCard')}
                </CardTitle>
                <CardDescription>
                  {activeDigitalCard 
                    ? t('athleteArea.digitalCardActive')
                    : t('athleteArea.digitalCardPending')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeDigitalCard ? (
                  <div className="space-y-4">
                    {activeDigitalCard.qr_code_image_url && (
                      <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-center">
                        <img 
                          src={activeDigitalCard.qr_code_image_url} 
                          alt="QR Code"
                          className="w-40 h-40 rounded-lg"
                        />
                      </div>
                    )}
                    {currentGrading && (
                      <div className="text-center">
                        <Badge variant="outline" className="text-lg px-4 py-1">
                          {currentGrading.grading_levels?.display_name}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentGrading.grading_levels?.grading_schemes?.sport_type}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground text-center">
                      {t('verification.validUntil')}: {formatDate(activeDigitalCard.valid_until)}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        className="flex-1"
                        asChild
                      >
                        <Link to={`/${tenant.slug}/verify/card/${activeDigitalCard.id}`}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          {t('common.view')}
                        </Link>
                      </Button>
                      {activeDigitalCard.pdf_url && (
                        <Button 
                          className="flex-1"
                          onClick={() => window.open(activeDigitalCard.pdf_url!, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('verification.downloadCard')}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : activeMembership ? (
                  <ProvisionalCard
                    athleteName={athlete.full_name}
                    tenantName={tenant.name}
                    tenantSlug={tenant.slug}
                    membershipId={activeMembership.id}
                    membershipStatus={activeMembership.status}
                    paymentStatus={activeMembership.payment_status}
                    endDate={activeMembership.end_date}
                    sportTypes={tenant.sportTypes || []}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <CreditCard className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">
                      {t('athleteArea.noActiveMembershipDesc')}
                    </p>
                    <Button asChild>
                      <Link to={`/${tenant.slug}/membership/new`}>
                        {t('athleteArea.startMembership')}
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Memberships */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                {t('athleteArea.membershipHistory')}
              </CardTitle>
              <CardDescription>{t('athleteArea.membershipHistoryDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {membershipsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !memberships?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CreditCard className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">{t('empty.noMemberships')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {memberships.map((membership) => (
                    <div
                      key={membership.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {membership.type === 'FIRST_MEMBERSHIP' ? t('athleteArea.firstMembership') : t('athleteArea.renewal')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(membership.start_date)} - {formatDate(membership.end_date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(membership.status)}>
                          {(MEMBERSHIP_STATUS_LABELS as any)[membership.status]}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Documents Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <DocumentsSection athleteId={athlete.id} tenantId={tenant.id} />
        </motion.div>

        {/* Diplomas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('athleteArea.myDiplomas')}
              </CardTitle>
              <CardDescription>{t('athleteArea.myDiplomasDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {diplomasLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !diplomas?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">{t('athleteArea.noDiplomas')}</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {diplomas.map((diploma) => (
                    <div
                      key={diploma.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Award className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{diploma.grading_levels?.display_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {diploma.grading_levels?.grading_schemes?.sport_type} • {formatDate(diploma.promotion_date)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          asChild
                        >
                          <Link to={`/${tenant.slug}/verify/diploma/${diploma.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        {diploma.pdf_url && (
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => window.open(diploma.pdf_url!, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Grading History Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                {t('athleteArea.gradingHistory')}
              </CardTitle>
              <CardDescription>{t('athleteArea.gradingHistoryDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {gradingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !gradings?.length ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Award className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">{t('athleteArea.noGradings')}</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
                  
                  <div className="space-y-6">
                    {gradings.map((grading, index) => {
                      const isLatest = index === 0;
                      const level = grading.grading_levels;
                      const scheme = level?.grading_schemes;
                      const diploma = grading.diplomas;
                      
                      return (
                        <div key={grading.id} className="relative flex gap-4">
                          {/* Timeline dot */}
                          <div className={`relative z-10 h-10 w-10 rounded-full flex items-center justify-center ${
                            isLatest 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted border-2 border-border'
                          }`}>
                            {isLatest ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <Award className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          
                          {/* Content */}
                          <div className={`flex-1 pb-6 ${index === gradings.length - 1 ? 'pb-0' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold">{level?.display_name}</h4>
                                  {isLatest && (
                                    <Badge variant="default" className="text-xs">
                                      {t('athleteArea.currentGrading')}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {scheme?.sport_type} • {scheme?.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(grading.promotion_date)}
                                </span>
                              </div>
                            </div>
                            
                            <div className="mt-2 text-sm text-muted-foreground space-y-1">
                              {grading.academies && (
                                <p className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {grading.academies.name}
                                </p>
                              )}
                              {grading.coaches && (
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {grading.coaches.full_name}
                                </p>
                              )}
                            </div>
                            
                            {diploma && diploma.status === 'ISSUED' && (
                              <div className="mt-3">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  asChild
                                >
                                  <Link to={`/${tenant.slug}/verify/diploma/${diploma.id}`}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    {t('athleteArea.viewDiploma')} #{diploma.serial_number}
                                  </Link>
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AppShell>
  );
}

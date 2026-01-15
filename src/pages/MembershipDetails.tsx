import React from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Download, 
  CreditCard, 
  Calendar, 
  User, 
  Mail, 
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  QrCode
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import {
  MembershipStatus,
  PaymentStatus,
  MEMBERSHIP_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/types/membership';

interface MembershipDetails {
  id: string;
  status: MembershipStatus;
  start_date: string | null;
  end_date: string | null;
  payment_status: PaymentStatus;
  price_cents: number;
  currency: string;
  type: string;
  created_at: string;
  athlete: {
    id: string;
    full_name: string;
    email: string;
    birth_date: string;
    phone: string | null;
    gender: string;
  };
  digital_cards: {
    id: string;
    qr_code_image_url: string;
    pdf_url: string;
    valid_until: string;
  }[];
}

export default function MembershipDetailsPage() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();
  const { tenantSlug, membershipId } = useParams();

  const { data: membership, isLoading, error } = useQuery({
    queryKey: ['membership', membershipId],
    queryFn: async () => {
      if (!membershipId) return null;

      const { data, error } = await supabase
        .from('memberships')
        .select(`
          id,
          status,
          start_date,
          end_date,
          payment_status,
          price_cents,
          currency,
          type,
          created_at,
          athlete:athletes(id, full_name, email, birth_date, phone, gender),
          digital_cards(id, qr_code_image_url, pdf_url, valid_until)
        `)
        .eq('id', membershipId)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as MembershipDetails;
    },
    enabled: !!membershipId,
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

  if (!tenant) return null;

  const digitalCard = membership?.digital_cards?.[0];

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
            onClick={() => navigate(`/${tenantSlug}/app/memberships`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para filiações
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
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Main Info Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-2"
            >
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="font-display text-2xl">
                        Filiação #{membership.id.substring(0, 8).toUpperCase()}
                      </CardTitle>
                      <CardDescription>
                        {tenant.name}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(membership.status)}>
                        {MEMBERSHIP_STATUS_LABELS[membership.status]}
                      </Badge>
                      <Badge variant={membership.payment_status === 'PAID' ? 'outline' : 'destructive'}>
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
                        <p className="text-sm text-muted-foreground">Início</p>
                        <p className="font-medium">{formatDate(membership.start_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Clock className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Validade</p>
                        <p className="font-medium">{formatDate(membership.end_date)}</p>
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
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Athlete Info Card */}
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
                      <p className="font-medium capitalize">
                        {membership.athlete?.gender === 'MALE' ? 'Masculino' : 
                         membership.athlete?.gender === 'FEMALE' ? 'Feminino' : 'Outro'}
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
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium">{membership.athlete.phone}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
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
                    Carteira Digital
                  </CardTitle>
                  <CardDescription>
                    {digitalCard 
                      ? 'Sua carteira de atleta filiado'
                      : 'Disponível após aprovação'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {digitalCard ? (
                    <div className="space-y-4">
                      <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-center">
                        <img 
                          src={digitalCard.qr_code_image_url} 
                          alt="QR Code da Carteira Digital"
                          className="w-40 h-40 rounded-lg"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground text-center">
                        Válida até {formatDate(digitalCard.valid_until)}
                      </p>
                      <Button 
                        className="w-full"
                        onClick={() => window.open(digitalCard.pdf_url, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar PDF da Carteira
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        Sua carteira digital será gerada automaticamente após a aprovação da sua filiação pela organização.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

import React from 'react';
import { motion } from 'framer-motion';
import { User, Users, AlertTriangle, CreditCard, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTenant } from '@/contexts/TenantContext';
import { useTenantStatus } from '@/hooks/useTenantStatus';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function MembershipTypeSelector() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();
  const tenantStatus = useTenantStatus();
  const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);

  // P4B-3: Check if user already has an active membership
  const { data: existingMembership } = useQuery({
    queryKey: ['existing-membership', currentUser?.id, tenant?.id],
    queryFn: async () => {
      if (!currentUser?.id || !tenant?.id) return null;
      
      // First get athlete
      const { data: athlete } = await supabase
        .from('athletes')
        .select('id')
        .eq('profile_id', currentUser.id)
        .eq('tenant_id', tenant.id)
        .maybeSingle();
      
      if (!athlete) return null;
      
      // Then check for active membership
      const { data: membership } = await supabase
        .from('memberships')
        .select('id, status')
        .eq('athlete_id', athlete.id)
        .in('status', ['ACTIVE', 'APPROVED', 'PENDING_REVIEW'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return membership;
    },
    enabled: !!currentUser?.id && !!tenant?.id,
  });

  const hasMembership = !!existingMembership;

  // Check if new memberships should be blocked
  const isMembershipBlocked = tenantStatus.isBlocked || tenantStatus.hasBillingIssue || tenantStatus.isTrialExpired;

  const handleOpenPortal = async () => {
    if (!tenant?.id) return;

    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenant.id },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Error opening portal:', err);
      toast.error(t('billing.openPortalError'));
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const options = [
    {
      id: 'adult',
      title: 'Atleta Adulto',
      description: 'Para atletas com 18 anos ou mais que farão a filiação em nome próprio.',
      icon: User,
      path: `/${tenantSlug}/membership/adult`,
    },
    {
      id: 'youth',
      title: 'Atleta Menor de Idade',
      description: 'Para atletas menores de 18 anos. A filiação será feita por um responsável legal.',
      icon: Users,
      path: `/${tenantSlug}/membership/youth`,
    },
  ];

  const handleOptionClick = (path: string) => {
    if (isMembershipBlocked) {
      toast.error(t('membership.blockedByBilling'));
      return;
    }
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
            {t('membership.selectorTitle')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            {t('membership.selectorDesc').replace('{tenant}', tenant?.name || t('common.organization'))}
          </p>
        </motion.div>

        {/* P4B-3: Informative banner when user already has membership */}
        {hasMembership && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle className="h-4 w-4 text-primary" />
              <AlertTitle className="text-primary">{t('membership.alreadyMember')}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{t('membership.alreadyMemberDesc')}</p>
                <Button variant="tenant-outline" size="sm" asChild className="gap-2">
                  <Link to={`/${tenantSlug}/portal`}>
                    {t('membership.goToPortal')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Warning banner when memberships are blocked */}
        {isMembershipBlocked && !hasMembership && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('membership.billingBlockedTitle')}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{t('membership.billingBlockedDesc')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenPortal}
                  disabled={isOpeningPortal}
                  className="border-destructive-foreground/30"
                >
                  {isOpeningPortal ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  {t('tenantStatus.manageBilling')}
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {options.map((option, index) => (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card 
                className={`h-full card-hover cursor-pointer group ${(isMembershipBlocked || hasMembership) ? 'opacity-50 pointer-events-none' : ''}`} 
                onClick={() => handleOptionClick(option.path)}
              >
                <CardHeader>
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <option.icon className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{option.title}</CardTitle>
                  <CardDescription className="text-base">
                    {option.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" variant="tenant-outline" disabled={isMembershipBlocked || hasMembership}>
                    {t('common.select')}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          {t('membership.termsAgreement')}
        </motion.p>
      </div>
    </div>
  );
}

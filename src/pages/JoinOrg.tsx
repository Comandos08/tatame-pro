/**
 * 🔐 JOIN ORG — Step 1: Select Organization
 * 
 * RULES:
 * - User MUST select a tenant before proceeding
 * - No bypass allowed
 * - Selected tenant stored in JoinContext
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Building2, ArrowRight, ArrowLeft, HelpCircle, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useJoin, SelectedTenant } from '@/contexts/JoinContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import iconLogo from '@/assets/iconLogo.png';

interface TenantResult {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  sport_types: string[] | null;
  description: string | null;
}

export default function JoinOrg() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { selectedTenant, setSelectedTenant } = useJoin();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotFoundHelp, setShowNotFoundHelp] = useState(false);

  // Fetch active tenants
  const { data: tenants, isLoading } = useQuery({
    queryKey: ['join-tenants', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('tenants')
        .select('id, slug, name, logo_url, sport_types, description')
        .eq('is_active', true)
        .order('name');
      
      if (searchQuery.trim()) {
        query = query.or(`name.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
      }
      
      const { data, error } = await query.limit(20);
      
      if (error) throw error;
      return data as TenantResult[];
    },
    staleTime: 30000,
  });

  const handleSelectTenant = (tenant: TenantResult) => {
    const selected: SelectedTenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logo_url,
      sportTypes: tenant.sport_types || [],
    };
    setSelectedTenant(selected);
  };

  const handleContinue = () => {
    if (!selectedTenant) return;
    navigate('/join/account');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-display text-lg font-bold">TATAME</span>
          </Link>
          
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="h-2 w-8 rounded-full bg-primary" />
            <div className="h-2 w-8 rounded-full bg-muted" />
            <div className="h-2 w-8 rounded-full bg-muted" />
          </div>
          
          <h1 className="font-display text-2xl font-bold mb-2">
            {t('join.selectOrg')}
          </h1>
          <p className="text-muted-foreground">
            {t('join.selectOrgDesc')}
          </p>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('join.searchOrg')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

        {/* Tenant list */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3 mb-6"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tenants && tenants.length > 0 ? (
            tenants.map((tenant) => (
              <Card
                key={tenant.id}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  selectedTenant?.id === tenant.id
                    ? 'border-primary ring-2 ring-primary/20'
                    : ''
                }`}
                onClick={() => handleSelectTenant(tenant)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {tenant.logo_url ? (
                      <img
                        src={tenant.logo_url}
                        alt={tenant.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{tenant.name}</h3>
                    {tenant.sport_types && tenant.sport_types.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {tenant.sport_types.slice(0, 3).map((sport) => (
                          <Badge key={sport} variant="secondary" className="text-xs">
                            {sport}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedTenant?.id === tenant.id && (
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('join.noOrgsFound')}</p>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Not found help */}
        {!showNotFoundHelp ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground mb-6"
            onClick={() => setShowNotFoundHelp(true)}
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            {t('join.cantFindOrg')}
          </Button>
        ) : (
          <Alert className="mb-6">
            <HelpCircle className="h-4 w-4" />
            <AlertTitle>{t('join.cantFindOrgTitle')}</AlertTitle>
            <AlertDescription>
              {t('join.cantFindOrgDesc')}
            </AlertDescription>
          </Alert>
        )}

        {/* Continue button */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
          <Button
            className="flex-1"
            onClick={handleContinue}
            disabled={!selectedTenant}
          >
            {t('common.continue')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

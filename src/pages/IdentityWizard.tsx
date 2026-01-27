/**
 * 🔐 IDENTITY WIZARD — Blocking Onboarding Flow
 * 
 * Mandatory 3-step wizard that ensures every user has:
 * 1. Tenant binding (join existing or create new)
 * 2. Profile type (Admin/Athlete)
 * 3. Completion validation
 * 
 * RULES:
 * - Cannot be bypassed
 * - Refresh/deep link/back button don't break the block
 * - Must complete to access any protected route
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Building2, UserCheck, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useIdentity } from '@/contexts/IdentityContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';

type WizardStep = 1 | 2 | 3;
type JoinMode = 'existing' | 'new' | null;
type ProfileType = 'admin' | 'athlete' | null;

interface SelectedTenant {
  id: string;
  slug: string;
  name: string;
}

export default function IdentityWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();
  const { currentUser, isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState, completeWizard, setIdentityError } = useIdentity();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [joinMode, setJoinMode] = useState<JoinMode>(null);
  const [profileType, setProfileType] = useState<ProfileType>(null);
  const [selectedTenant, setSelectedTenant] = useState<SelectedTenant | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [inviteCode, setInviteCode] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SelectedTenant[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Redirect if already resolved
  useEffect(() => {
    if (identityState === 'resolved' || identityState === 'superadmin') {
      navigate('/portal', { replace: true });
    }
  }, [identityState, navigate]);

  // Search for tenants
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, slug, name')
        .eq('is_active', true)
        .ilike('name', `%${query}%`)
        .limit(10);

      if (error) throw error;

      setSearchResults(data?.map(t => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
      })) || []);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Validate invite code
  const handleValidateInvite = async () => {
    if (!inviteCode.trim()) {
      toast({
        title: 'Código obrigatório',
        description: 'Digite o código de convite.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      // Try to find tenant by slug or special invite code
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('id, slug, name')
        .or(`slug.eq.${inviteCode.toLowerCase()},id.eq.${inviteCode}`)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !tenant) {
        setIdentityError({ 
          code: 'INVITE_INVALID', 
          message: 'Código de convite inválido ou organização não encontrada.' 
        });
        return false;
      }

      setSelectedTenant({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      });
      return true;
    } catch (err) {
      console.error('Invite validation failed:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao validar código. Tente novamente.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create new organization
  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite o nome da organização.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSubmitting(true);
    try {
      // Generate slug from name
      const slug = newOrgName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      // Check if slug is available
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        toast({
          title: 'Nome já utilizado',
          description: 'Este nome de organização já está em uso. Escolha outro.',
          variant: 'destructive',
        });
        return false;
      }

      // Create tenant
      const { data: newTenant, error: createError } = await supabase
        .from('tenants')
        .insert({
          name: newOrgName.trim(),
          slug,
          is_active: true,
          primary_color: '#dc2626',
          sport_types: ['BJJ'],
        })
        .select('id, slug, name')
        .single();

      if (createError || !newTenant) {
        throw createError || new Error('Failed to create tenant');
      }

      // Create billing record (trial)
      await supabase
        .from('tenant_billing')
        .insert({
          tenant_id: newTenant.id,
          status: 'TRIALING',
        });

      setSelectedTenant({
        id: newTenant.id,
        slug: newTenant.slug,
        name: newTenant.name,
      });

      // Auto-set profile type to admin for new org creators
      setProfileType('admin');
      
      return true;
    } catch (err) {
      console.error('Organization creation failed:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao criar organização. Tente novamente.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete wizard
  const handleComplete = async () => {
    if (!selectedTenant || !profileType) {
      toast({
        title: 'Configuração incompleta',
        description: 'Complete todas as etapas antes de continuar.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Grant appropriate role based on profile type
      if (profileType === 'admin') {
        await supabase
          .from('user_roles')
          .insert({
            user_id: currentUser!.id,
            tenant_id: selectedTenant.id,
            role: 'ADMIN_TENANT',
          });
      }
      // For athletes, they need to go through membership flow
      // Just set tenant context for now

      // Complete the wizard
      await completeWizard(selectedTenant.id, selectedTenant.slug);

      toast({
        title: 'Configuração concluída!',
        description: 'Sua conta foi configurada com sucesso.',
      });

      // Navigate to appropriate destination
      if (profileType === 'admin') {
        navigate(`/${selectedTenant.slug}/app/onboarding`, { replace: true });
      } else {
        navigate(`/${selectedTenant.slug}/membership/new`, { replace: true });
      }
    } catch (err) {
      console.error('Wizard completion failed:', err);
      toast({
        title: 'Erro',
        description: 'Falha ao finalizar configuração. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step navigation
  const handleNextStep = async () => {
    if (step === 1) {
      // Validate step 1
      if (joinMode === 'existing' && !selectedTenant) {
        const valid = await handleValidateInvite();
        if (!valid) return;
      } else if (joinMode === 'new') {
        const valid = await handleCreateOrganization();
        if (!valid) return;
      } else if (!joinMode) {
        toast({
          title: 'Seleção obrigatória',
          description: 'Escolha como deseja prosseguir.',
          variant: 'destructive',
        });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!profileType) {
        toast({
          title: 'Perfil obrigatório',
          description: 'Selecione seu tipo de perfil.',
          variant: 'destructive',
        });
        return;
      }
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as WizardStep);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const steps = [
    { number: 1, title: 'Organização', icon: Building2 },
    { number: 2, title: 'Perfil', icon: UserCheck },
    { number: 3, title: 'Confirmação', icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">Configuração de Conta</CardTitle>
          <CardDescription>
            Complete as etapas abaixo para acessar o sistema
          </CardDescription>
          
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mt-6">
            {steps.map((s, idx) => (
              <React.Fragment key={s.number}>
                <div className="flex flex-col items-center gap-1">
                  <div 
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      step >= s.number 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs ${step >= s.number ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.title}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-16 h-0.5 -mt-4 ${step > s.number ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <AnimatePresence mode="wait">
            {/* Step 1: Organization Binding */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">Você já faz parte de uma organização?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Escolha como deseja prosseguir
                  </p>
                </div>

                <RadioGroup 
                  value={joinMode || ''} 
                  onValueChange={(v) => setJoinMode(v as JoinMode)}
                  className="space-y-4"
                >
                  <div className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                    joinMode === 'existing' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}>
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing" className="flex-1 cursor-pointer">
                      <div className="font-medium">Sim, tenho um código/convite</div>
                      <div className="text-sm text-muted-foreground">
                        Digite o código da sua organização ou busque pelo nome
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                    joinMode === 'new' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}>
                    <RadioGroupItem value="new" id="new" />
                    <Label htmlFor="new" className="flex-1 cursor-pointer">
                      <div className="font-medium">Não, quero criar uma nova</div>
                      <div className="text-sm text-muted-foreground">
                        Crie uma organização e convide membros
                      </div>
                    </Label>
                  </div>
                </RadioGroup>

                {/* Conditional fields based on selection */}
                {joinMode === 'existing' && (
                  <div className="space-y-4 pt-4">
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="invite">Código ou nome da organização</Label>
                      <Input
                        id="invite"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="Ex: demo-bjj ou código de convite"
                      />
                    </div>

                    {/* Search results */}
                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        <Label>Resultados da busca</Label>
                        <div className="border rounded-lg divide-y">
                          {searchResults.map((tenant) => (
                            <button
                              key={tenant.id}
                              type="button"
                              onClick={() => {
                                setSelectedTenant(tenant);
                                setInviteCode(tenant.slug);
                              }}
                              className={`w-full p-3 text-left hover:bg-muted transition-colors ${
                                selectedTenant?.id === tenant.id ? 'bg-primary/10' : ''
                              }`}
                            >
                              <div className="font-medium">{tenant.name}</div>
                              <div className="text-sm text-muted-foreground">{tenant.slug}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {joinMode === 'new' && (
                  <div className="space-y-4 pt-4">
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="orgName">Nome da organização</Label>
                      <Input
                        id="orgName"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="Ex: Academia Central BJJ"
                      />
                      <p className="text-xs text-muted-foreground">
                        Este será o nome público da sua organização
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: Profile Type */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">Qual é o seu perfil?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Isso define como você usará o sistema
                  </p>
                </div>

                <RadioGroup 
                  value={profileType || ''} 
                  onValueChange={(v) => setProfileType(v as ProfileType)}
                  className="space-y-4"
                >
                  <div className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                    profileType === 'admin' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}>
                    <RadioGroupItem value="admin" id="admin" />
                    <Label htmlFor="admin" className="flex-1 cursor-pointer">
                      <div className="font-medium">Administrador / Responsável</div>
                      <div className="text-sm text-muted-foreground">
                        Gerencio a organização, atletas e eventos
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                    profileType === 'athlete' ? 'border-primary bg-primary/5' : 'border-border'
                  }`}>
                    <RadioGroupItem value="athlete" id="athlete" />
                    <Label htmlFor="athlete" className="flex-1 cursor-pointer">
                      <div className="font-medium">Atleta</div>
                      <div className="text-sm text-muted-foreground">
                        Sou praticante e quero acessar minha carteirinha e eventos
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </motion.div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">Confirme seus dados</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Revise as informações antes de continuar
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Organização:</span>
                    <span className="font-medium">{selectedTenant?.name}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Perfil:</span>
                    <span className="font-medium">
                      {profileType === 'admin' ? 'Administrador' : 'Atleta'}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span className="font-medium">{currentUser?.email}</span>
                  </div>
                </div>

                {profileType === 'athlete' && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Próximo passo:</strong> Após confirmar, você será direcionado para 
                      completar seu cadastro de atleta e solicitar sua filiação.
                    </p>
                  </div>
                )}

                {profileType === 'admin' && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Próximo passo:</strong> Após confirmar, você será direcionado para 
                      configurar sua organização (academias, graduações, etc.).
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>

        <CardFooter className="flex justify-between pt-6">
          <div>
            {step === 1 ? (
              <Button variant="ghost" onClick={handleLogout}>
                Sair
              </Button>
            ) : (
              <Button variant="outline" onClick={handlePrevStep} disabled={isSubmitting}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            )}
          </div>

          <div>
            {step < 3 ? (
              <Button onClick={handleNextStep} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Continuar
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirmar
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

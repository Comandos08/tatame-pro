/**
 * 🔐 IDENTITY WIZARD — Blocking Onboarding Flow (Backend-Driven)
 *
 * REFACTORED: All sensitive operations happen via Edge Function.
 * Client NEVER writes to: user_roles, tenant_billing, tenants.
 *
 * RULES:
 * - Cannot be bypassed
 * - Refresh/deep link/back button don't break the block
 * - Must complete to access any protected route
 * - All writes via resolve-identity-wizard Edge Function
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, UserCheck, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { AuthenticatedHeader } from "@/components/auth/AuthenticatedHeader";
import { logger } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";
import { useIdentity } from "@/contexts/IdentityContext";
import { useCurrentUser } from "@/contexts/AuthContext";
import { getOnboardingIntent, clearOnboardingIntent } from "@/lib/onboarding-storage";

type WizardStep = 1 | 2 | 3;
type JoinMode = "existing" | "new" | null;
type ProfileType = "admin" | "athlete" | null;

export default function IdentityWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentUser, isAuthenticated, isLoading: authLoading, signOut } = useCurrentUser();
  const { identityState, createTenant, joinExistingTenant, refreshIdentity } = useIdentity();

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [joinMode, setJoinMode] = useState<JoinMode>(null);
  const [profileType, setProfileType] = useState<ProfileType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // P1-003: Pending redirect — set by handleComplete, consumed by identityState effect
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Form fields - NO open search, only exact invite code
  const [inviteCode, setInviteCode] = useState("");
  const [newOrgName, setNewOrgName] = useState("");

  // PI-ONB-ENDTOEND-HARDEN-001: Read localStorage onboarding intent on mount
  useEffect(() => {
    const intent = getOnboardingIntent();
    if (intent.mode === "join" && intent.tenantCode) {
      setJoinMode("existing");
      setInviteCode(intent.tenantCode);
      setProfileType("athlete");
      logger.info("[IdentityWizard] Prefilled from onboarding intent", {
        mode: intent.mode,
        tenantCode: intent.tenantCode,
      });
    } else if (intent.mode === "create") {
      setJoinMode("new");
      setProfileType("admin");
      logger.info("[IdentityWizard] Prefilled from onboarding intent", { mode: intent.mode });
    }
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Redirect if already resolved (or after wizard completes)
  // P1-003: pendingRedirect takes priority over /portal fallback
  useEffect(() => {
    if (identityState === "RESOLVED" || identityState === "SUPERADMIN") {
      if (pendingRedirect) {
        navigate(pendingRedirect, { replace: true });
        setPendingRedirect(null);
      } else {
        navigate("/portal", { replace: true });
      }
    }
  }, [identityState, navigate, pendingRedirect]);

  // Complete wizard via backend — PI-ONB-001: Use explicit methods
  const handleComplete = async () => {
    if (!joinMode || !profileType) {
      toast({
        title: "Configuração incompleta",
        description: "Complete todas as etapas antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    // Validate required fields
    if (joinMode === "existing" && !inviteCode.trim()) {
      toast({
        title: "Código obrigatório",
        description: "Digite o código de convite da organização.",
        variant: "destructive",
      });
      return;
    }

    if (joinMode === "new" && !newOrgName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite o nome da organização.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // PI-ONB-001: Use explicit methods instead of generic completeWizard
      if (joinMode === "new") {
        const result = await createTenant({ orgName: newOrgName.trim() });

        if (result.success) {
          clearOnboardingIntent();
          toast({
            title: "Organização criada!",
            description: "Sua organização foi criada com sucesso.",
          });

          // P1-003: Set pending redirect BEFORE refreshIdentity so the effect
          // navigates only when identityState stabilizes to "resolved"
          const targetPath = result.redirectPath || (result.tenant?.slug ? `/${result.tenant.slug}/app` : null);
          if (targetPath) {
            setPendingRedirect(targetPath);
          }

          await queryClient.invalidateQueries({ queryKey: ["identity"] });
          await queryClient.invalidateQueries({ queryKey: ["user-roles"] });
          await queryClient.invalidateQueries({ queryKey: ["tenant"] });
          await refreshIdentity();
          // Navigation happens in identityState useEffect above
        } else if (result.error) {
          handleWizardError(result.error);
        }
      } else if (joinMode === "existing") {
        const result = await joinExistingTenant({
          tenantCode: inviteCode.trim(),
          applicantData: {
            full_name: currentUser?.name ?? currentUser?.email?.split("@")[0] ?? "Nome não informado",
            email: currentUser?.email ?? "email@desconhecido",
            birth_date: null,
            gender: null,
            national_id: null,
            phone: null,
            address_line1: null,
            address_line2: null,
            city: null,
            state: null,
            postal_code: null,
            country: null,
          },
        });

        if (result.success) {
          clearOnboardingIntent();
          toast({
            title: "Solicitação enviada!",
            description: "Sua solicitação foi enviada para análise.",
          });

          // P1-003: Set pending redirect BEFORE refreshIdentity
          if (result.redirectPath) {
            setPendingRedirect(result.redirectPath);
          }

          await queryClient.invalidateQueries({ queryKey: ["identity"] });
          await queryClient.invalidateQueries({ queryKey: ["user-roles"] });
          await queryClient.invalidateQueries({ queryKey: ["tenant"] });
          await refreshIdentity();
          // Navigation happens in identityState useEffect above
        } else if (result.error) {
          handleWizardError(result.error);
        }
      }
    } catch (err) {
      logger.error("Wizard completion failed:", err);
      toast({
        title: "Erro",
        description: "Falha ao finalizar configuração. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // PI-ONB-001 + PI-UX-003: Handle specific error codes with legacy message blocking
  const LEGACY_BLOCKED_MESSAGES = [
    "Only 'new' organization mode is supported.",
    "Only 'new' organization mode is supported",
  ];

  const handleWizardError = (error: { code: string; message: string }) => {
    // PI-UX-003: Block legacy technical messages from reaching the user
    if (error?.message && LEGACY_BLOCKED_MESSAGES.includes(error.message)) {
      toast({
        title: "Erro de configuração",
        description: "Não foi possível concluir a solicitação. Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    const errorMessages: Record<string, { title: string; description: string }> = {
      TENANT_NOT_FOUND: {
        title: "Organização não encontrada",
        description: "O código informado não corresponde a nenhuma organização.",
      },
      TENANT_INACTIVE: {
        title: "Organização inativa",
        description: "Esta organização não está ativa para novos membros.",
      },
      ALREADY_REQUESTED: {
        title: "Solicitação pendente",
        description: "Sua solicitação já está em análise.",
      },
      ALREADY_MEMBER: {
        title: "Já é membro",
        description: "Você já faz parte desta organização.",
      },
      MEMBERSHIP_EXISTS: {
        title: "Solicitação existente",
        description: "Você já possui uma solicitação ativa para esta organização.",
      },
      ONBOARDING_FORBIDDEN: {
        title: "Acesso bloqueado",
        description: "Não foi possível solicitar entrada. Contate a administração.",
      },
      INVITE_INVALID: {
        title: "Código inválido",
        description: "O código de convite não foi encontrado ou está inativo.",
      },
      SLUG_TAKEN: {
        title: "Nome já utilizado",
        description: "Este nome de organização já está em uso. Escolha outro.",
      },
      SLUG_CONFLICT: {
        title: "Nome já utilizado",
        description: "Este nome de organização já está em uso. Escolha outro nome.",
      },
      RESERVED_SLUG: {
        title: "Nome reservado",
        description: "Este nome de organização é reservado pelo sistema. Escolha outro.",
      },
      TENANT_CREATION_FAILED: {
        title: "Erro ao criar organização",
        description: "Não foi possível criar a organização. Tente novamente em alguns instantes.",
      },
      ROLE_ASSIGNMENT_FAILED: {
        title: "Erro de permissão",
        description: "A organização foi criada, mas houve um erro ao atribuir sua permissão. Contate o suporte.",
      },
      PROFILE_CREATION_FAILED: {
        title: "Erro no perfil",
        description: "Não foi possível criar seu perfil. Tente novamente.",
      },
      UNSUPPORTED_JOIN_MODE: {
        title: "Modo não suportado",
        description: "Este modo de entrada não está disponível no momento.",
      },
      UNKNOWN: {
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
      },
      VALIDATION_ERROR: {
        title: "Dados inválidos",
        description: error.message || "Verifique os dados informados.",
      },
    };

    const msg = errorMessages[error.code] || {
      title: "Erro",
      description: `Não foi possível concluir a solicitação (${error.code || "desconhecido"}). Tente novamente.`,
    };

    toast({
      title: msg.title,
      description: msg.description,
      variant: "destructive",
    });
  };

  // Step navigation
  const handleNextStep = () => {
    if (step === 1) {
      if (!joinMode) {
        toast({
          title: "Seleção obrigatória",
          description: "Escolha como deseja prosseguir.",
          variant: "destructive",
        });
        return;
      }

      // Validate inputs before advancing
      if (joinMode === "existing" && !inviteCode.trim()) {
        toast({
          title: "Código obrigatório",
          description: "Digite o código de convite da organização.",
          variant: "destructive",
        });
        return;
      }

      if (joinMode === "new" && !newOrgName.trim()) {
        toast({
          title: "Nome obrigatório",
          description: "Digite o nome da organização.",
          variant: "destructive",
        });
        return;
      }

      // Auto-set profile type to admin for new org creators
      if (joinMode === "new") {
        setProfileType("admin");
      }

      setStep(2);
    } else if (step === 2) {
      if (!profileType) {
        toast({
          title: "Perfil obrigatório",
          description: "Selecione seu tipo de perfil.",
          variant: "destructive",
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
    navigate("/login", { replace: true });
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
    { number: 1, title: "Organização", icon: Building2 },
    { number: 2, title: "Perfil", icon: UserCheck },
    { number: 3, title: "Confirmação", icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AuthenticatedHeader />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">Configuração de Conta</CardTitle>
            <CardDescription>Complete as etapas abaixo para acessar o sistema</CardDescription>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mt-6">
              {steps.map((s, idx) => (
                <React.Fragment key={s.number}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        step >= s.number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className={`text-xs ${step >= s.number ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.title}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-16 h-0.5 -mt-4 ${step > s.number ? "bg-primary" : "bg-muted"}`} />
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
                    <p className="text-sm text-muted-foreground mt-1">Escolha como deseja prosseguir</p>
                  </div>

                  <RadioGroup
                    value={joinMode || ""}
                    onValueChange={(v) => setJoinMode(v as JoinMode)}
                    className="space-y-4"
                  >
                    <div
                      className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                        joinMode === "existing" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="existing" id="existing" />
                      <Label htmlFor="existing" className="flex-1 cursor-pointer">
                        <div className="font-medium">Sim, tenho um código/convite</div>
                        <div className="text-sm text-muted-foreground">Digite o código da sua organização</div>
                      </Label>
                    </div>

                    <div
                      className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                        joinMode === "new" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="new" id="new" />
                      <Label htmlFor="new" className="flex-1 cursor-pointer">
                        <div className="font-medium">Não, quero criar uma nova</div>
                        <div className="text-sm text-muted-foreground">Crie uma organização e convide membros</div>
                      </Label>
                    </div>
                  </RadioGroup>

                  {/* Conditional fields based on selection */}
                  {joinMode === "existing" && (
                    <div className="space-y-4 pt-4">
                      <Separator />
                      <div className="space-y-2">
                        <Label htmlFor="invite">Código de convite</Label>
                        <Input
                          id="invite"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value)}
                          placeholder="Ex: demo-bjj ou código recebido"
                        />
                        <p className="text-xs text-muted-foreground">
                          Digite o código exato que você recebeu da sua organização
                        </p>
                      </div>
                    </div>
                  )}

                  {joinMode === "new" && (
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
                        <p className="text-xs text-muted-foreground">Este será o nome público da sua organização</p>
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
                    <p className="text-sm text-muted-foreground mt-1">Isso define como você usará o sistema</p>
                  </div>

                  <RadioGroup
                    value={profileType || ""}
                    onValueChange={(v) => setProfileType(v as ProfileType)}
                    className="space-y-4"
                  >
                    <div
                      className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                        profileType === "admin" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="admin" id="admin" />
                      <Label htmlFor="admin" className="flex-1 cursor-pointer">
                        <div className="font-medium">Administrador / Responsável</div>
                        <div className="text-sm text-muted-foreground">Gerencio a organização, atletas e eventos</div>
                      </Label>
                    </div>

                    <div
                      className={`flex items-center space-x-4 border rounded-lg p-4 transition-colors cursor-pointer ${
                        profileType === "athlete" ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <RadioGroupItem value="athlete" id="athlete" />
                      <Label htmlFor="athlete" className="flex-1 cursor-pointer">
                        <div className="font-medium">Atleta</div>
                        <div className="text-sm text-muted-foreground">
                          Sou praticante e quero acessar minha carteirinha e eventos
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  {joinMode === "new" && (
                    <div className="bg-muted/50 border rounded-lg p-3">
                      <p className="text-sm text-muted-foreground">
                        <strong>Nota:</strong> Como criador da organização, você será automaticamente o administrador.
                      </p>
                    </div>
                  )}
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
                    <p className="text-sm text-muted-foreground mt-1">Revise as informações antes de continuar</p>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Modo:</span>
                      <span className="font-medium">
                        {joinMode === "new" ? "Criar nova organização" : "Entrar em organização existente"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{joinMode === "new" ? "Nome:" : "Código:"}</span>
                      <span className="font-medium">{joinMode === "new" ? newOrgName : inviteCode}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Perfil:</span>
                      <span className="font-medium">{profileType === "admin" ? "Administrador" : "Atleta"}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-medium">{currentUser?.email}</span>
                    </div>
                  </div>

                  {profileType === "athlete" && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <p className="text-sm">
                        <strong>Próximo passo:</strong> Após confirmar, você será direcionado para completar seu
                        cadastro de atleta e solicitar sua filiação.
                      </p>
                    </div>
                  )}

                  {profileType === "admin" && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <p className="text-sm">
                        <strong>Próximo passo:</strong> Após confirmar, você será direcionado para configurar sua
                        organização (academias, graduações, etc.).
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
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
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
    </div>
  );
}

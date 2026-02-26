/**
 * 🔐 IDENTITY WIZARD — Blocking Onboarding Flow (Backend-Driven)
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

  const [step, setStep] = useState<WizardStep>(1);
  const [joinMode, setJoinMode] = useState<JoinMode>(null);
  const [profileType, setProfileType] = useState<ProfileType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ P1-003
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const [inviteCode, setInviteCode] = useState("");
  const [newOrgName, setNewOrgName] = useState("");

  useEffect(() => {
    const intent = getOnboardingIntent();
    if (intent.mode === "join" && intent.tenantCode) {
      setJoinMode("existing");
      setInviteCode(intent.tenantCode);
      setProfileType("athlete");
    } else if (intent.mode === "create") {
      setJoinMode("new");
      setProfileType("admin");
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // ✅ P1-003 — SINGLE SOURCE OF NAVIGATION
  useEffect(() => {
    if (identityState === "resolved" || identityState === "superadmin") {
      if (pendingRedirect) {
        navigate(pendingRedirect, { replace: true });
        setPendingRedirect(null);
      } else {
        navigate("/portal", { replace: true });
      }
    }
  }, [identityState, navigate, pendingRedirect]);

  const handleComplete = async () => {
    if (!joinMode || !profileType) return;

    setIsSubmitting(true);

    try {
      if (joinMode === "new") {
        const result = await createTenant({ orgName: newOrgName.trim() });

        if (result.success) {
          clearOnboardingIntent();

          const targetPath = result.redirectPath || (result.tenant?.slug ? `/${result.tenant.slug}/app` : null);

          if (targetPath) {
            setPendingRedirect(targetPath);
          }

          await queryClient.invalidateQueries({ queryKey: ["identity"] });
          await queryClient.invalidateQueries({ queryKey: ["user-roles"] });
          await queryClient.invalidateQueries({ queryKey: ["tenant"] });

          await refreshIdentity();
        }
      }

      if (joinMode === "existing") {
        const result = await joinExistingTenant({
          tenantCode: inviteCode.trim(),
          applicantData: {
            full_name: currentUser?.name ?? "",
            email: currentUser?.email ?? "",
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

          if (result.redirectPath) {
            setPendingRedirect(result.redirectPath);
          }

          await queryClient.invalidateQueries({ queryKey: ["identity"] });
          await queryClient.invalidateQueries({ queryKey: ["user-roles"] });
          await queryClient.invalidateQueries({ queryKey: ["tenant"] });

          await refreshIdentity();
        }
      }
    } catch (err) {
      logger.error("Wizard completion failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AuthenticatedHeader />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Configuração de Conta</CardTitle>
          </CardHeader>

          <CardContent>{/* (UI omitted for brevity — mantém seu layout original) */}</CardContent>

          <CardFooter className="flex justify-end">
            <Button onClick={handleComplete} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

// src/pages/Login.tsx

import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import iconLogo from "@/assets/iconLogo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/contexts/I18nContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");

  const { signIn, signUp, isAuthenticated } = useCurrentUser();
  const { identityState, redirectPath } = useIdentity();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  // ✅ Aguardar auth E identity estarem resolvidos antes de navegar
  useEffect(() => {
    if (isAuthenticated && identityState !== "loading") {
      // Se wizard required, deixar o fluxo normal lidar
      if (identityState === "wizard_required") {
        navigate("/identity/wizard", { replace: true });
        return;
      }
      
      // Usar redirectPath do backend (mais preciso que /portal hardcoded)
      const destination = redirectPath || "/portal";
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, identityState, redirectPath, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      if (isSignUp) {
        await signUp(email, password, name);
        toast({
          title: t("auth.accountCreated"),
          description: t("auth.accountCreatedDesc"),
        });
        // DO NOT navigate here. Wait for isAuthenticated and then go /portal.
      } else {
        await signIn(email, password);
        toast({
          title: t("auth.welcome"),
          description: t("auth.loginSuccess"),
        });
        // DO NOT navigate here. Wait for isAuthenticated and then go /portal.
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast({
        title: t("auth.error"),
        description: error instanceof Error ? error.message : t("auth.genericError"),
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // Keep submitting state until auth stabilizes or user leaves
    // (AuthContext will flip isAuthenticated; effect will navigate)
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-8">
              <img src={iconLogo} alt="TATAME" className="h-10 w-10 rounded-xl object-contain" />
              <span className="font-display text-xl font-bold">TATAME</span>
            </Link>
            <h1 className="font-display text-3xl font-bold mb-2">
              {isSignUp ? t("auth.signUpTitle") : t("auth.loginTitle")}
            </h1>
            <p className="text-muted-foreground">{isSignUp ? t("auth.signUpDesc") : t("auth.loginDesc")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">{t("auth.fullName")}</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("auth.emailLabel")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("auth.emailPlaceholder")}
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSignUp ? (
                t("auth.createAccount")
              ) : (
                t("auth.login")
              )}
            </Button>
          </form>

          {!isSignUp && (
            <div className="mt-4 text-center">
              <Link to="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                {t("auth.forgotPassword")}
              </Link>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? t("auth.alreadyHaveAccount") : t("auth.dontHaveAccount")}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsSubmitting(false);
              }}
              className="text-primary hover:underline font-medium"
            >
              {isSignUp ? t("auth.login") : t("auth.createAccount")}
            </button>
          </p>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-30" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 text-center p-8"
        >
          <div className="h-24 w-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary">
            <img src={iconLogo} alt="TATAME" className="h-24 w-24 rounded-2xl object-contain" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-4">{t("auth.manageOrganization")}</h2>
          <p className="text-muted-foreground max-w-sm">{t("auth.manageOrganizationDesc")}</p>
        </motion.div>
      </div>
    </div>
  );
}

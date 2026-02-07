// src/pages/SignUp.tsx

import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2, User } from "lucide-react";
import iconLogo from "@/assets/iconLogo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/contexts/AuthContext";
import { useIdentity } from "@/contexts/IdentityContext";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/contexts/I18nContext";
import { getAuthErrorKey } from "@/lib/errors";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const { signUp, isAuthenticated } = useCurrentUser();
  const { identityState, redirectPath } = useIdentity();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useI18n();

  // Redirect when authenticated
  useEffect(() => {
    if (isAuthenticated && identityState !== "loading") {
      if (identityState === "wizard_required") {
        navigate("/identity/wizard", { replace: true });
        return;
      }
      const destination = redirectPath || "/portal";
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, identityState, redirectPath, navigate]);

  const validateForm = (): boolean => {
    const errors: typeof formErrors = {};

    if (!name.trim()) {
      errors.name = t('auth.fullNameRequired');
    }

    if (!email.trim()) {
      errors.email = t('auth.emailRequired');
    } else if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = t('auth.invalidEmail');
    }

    if (!password.trim()) {
      errors.password = t('auth.passwordRequired');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const isFormValid = (): boolean => {
    return (
      name.trim() !== '' &&
      email.trim() !== '' &&
      EMAIL_REGEX.test(email.trim()) &&
      password.trim() !== ''
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormErrors({});
    if (!validateForm()) {
      toast({
        title: t('auth.formError'),
        description: t('auth.correctErrors'),
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await signUp(email, password, name);
      toast({
        title: t("auth.accountCreated"),
        description: t("auth.accountCreatedDesc"),
      });
      // Do not navigate manually - wait for isAuthenticated in useEffect
    } catch (error) {
      console.error("SignUp error:", error);
      const errorKey = getAuthErrorKey(error);
      toast({
        title: t("auth.error"),
        description: t(errorKey),
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
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
              {t("auth.signUpTitle")}
            </h1>
            <p className="text-muted-foreground">{t("auth.signUpDesc")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("auth.fullName")}</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder")}
                  className="pl-10"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  required
                  autoComplete="name"
                />
              </div>
              {formErrors.name && (
                <p className="text-sm text-destructive mt-1">{formErrors.name}</p>
              )}
            </div>

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
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  required
                  autoComplete="email"
                />
              </div>
              {formErrors.email && (
                <p className="text-sm text-destructive mt-1">{formErrors.email}</p>
              )}
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formErrors.password && (
                <p className="text-sm text-destructive mt-1">{formErrors.password}</p>
              )}
            </div>

            <Button type="submit" className="w-full h-11" disabled={isSubmitting || !isFormValid()}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("auth.createAccount")
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              {t("auth.login")}
            </Link>
          </p>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-card border-l border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow opacity-30" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-10 text-center p-8 max-w-md"
        >
          <div className="w-24 h-24 rounded-2xl mx-auto flex items-center justify-center mb-8 glow-primary overflow-hidden">
            <img src={iconLogo} alt="TATAME" className="max-h-full max-w-full rounded-2xl object-contain" />
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
            {t("login.institutional.title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            {t("login.institutional.description")}
          </p>
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>{t("login.institutional.point1")}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>{t("login.institutional.point2")}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>{t("login.institutional.point3")}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

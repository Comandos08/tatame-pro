import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import { Loader2, Lock, ArrowLeft, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { logger } from "@/lib/logger";

type ValidationState = "loading" | "valid" | "invalid";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const { t } = useI18n();
  
  const [validationState, setValidationState] = useState<ValidationState>("loading");
  const [validationMessage, setValidationMessage] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidationState("invalid");
        setValidationMessage(t('auth.requestNewLink'));
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("reset-password", {
          body: { token, action: "validate" },
        });

        if (error) throw error;

        if (data.valid) {
          setValidationState("valid");
          setMaskedEmail(data.email || "");
        } else {
          setValidationState("invalid");
          setValidationMessage(data.message || t('auth.invalidLink'));
        }
      } catch (error) {
        logger.error("Token validation error:", error);
        setValidationState("invalid");
        setValidationMessage(t('auth.genericError'));
      }
    }

    validateToken();
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error(t('auth.passwordTooShort'), { description: t('auth.passwordTooShortDesc') });
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDontMatch'), { description: t('auth.passwordsDontMatchDesc') });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { token, password },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setIsSuccess(true);
      toast.success(t('auth.passwordChanged'), { description: t('auth.passwordChangedDesc') });

      // PI Z0.4: Deterministic redirect — navigate immediately after confirmed success
      navigate("/login");
    } catch (error) {
      logger.error("Password reset error:", error);
      toast.error(t('auth.resetError'), { description: error instanceof Error ? error.message : t('auth.genericError') });
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (validationState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t('auth.validatingLink')}</p>
        </motion.div>
      </div>
    );
  }

  // Invalid token state
  if (validationState === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-destructive/50">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto bg-destructive/10 rounded-full p-4 w-fit">
                <XCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle className="text-2xl">{t('auth.invalidLink')}</CardTitle>
              <CardDescription className="text-base">
                {validationMessage}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-col gap-4">
              <Button className="w-full" asChild>
                <Link to="/forgot-password">{t('auth.requestNewLink')}</Link>
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('auth.backToLogin')}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="border-success/50">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto bg-success/10 rounded-full p-4 w-fit">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
              <CardTitle className="text-2xl">{t('auth.passwordChanged')}</CardTitle>
              <CardDescription className="text-base">
                {t('auth.passwordChangedDesc')}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button className="w-full" asChild>
                <Link to="/login">{t('auth.loginNow')}</Link>
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto bg-primary/10 rounded-full p-4 w-fit mb-2">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('auth.resetPassword')}</CardTitle>
            <CardDescription>
              {maskedEmail && `${t('auth.creatingPasswordFor')} ${maskedEmail}`}
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.newPassword')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t('auth.minChars')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className={password.length >= 8 ? "text-success" : ""}>
                  ✓ {t('auth.minCharsCheck')}
                </p>
                <p className={password && password === confirmPassword ? "text-success" : ""}>
                  ✓ {t('auth.passwordsMatchCheck')}
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || password.length < 8 || password !== confirmPassword}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.saving')}
                  </>
                ) : (
                  t('auth.saveNewPassword')
                )}
              </Button>

              <Button variant="ghost" className="w-full" asChild>
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('auth.backToLogin')}
                </Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

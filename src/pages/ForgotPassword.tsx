import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    
    // Validar email vazio
    if (!email.trim()) {
      setEmailError(t('auth.emailRequired'));
      toast({
        title: t('auth.formError'),
        description: t('auth.emailRequired'),
        variant: "destructive",
      });
      return;
    }

    // Validar formato de email
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError(t('auth.invalidEmail'));
      toast({
        title: t('auth.formError'),
        description: t('auth.invalidEmail'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("request-password-reset", {
        body: { email: email.trim().toLowerCase() },
      });

      if (error) throw error;

      setIsSuccess(true);
      toast({
        title: t('auth.forgot.emailSent'),
        description: data.message,
      });
    } catch (error) {
      console.error("Password reset error:", error);
      toast({
        title: t('auth.forgot.error'),
        description: t('auth.forgot.errorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto bg-success/10 rounded-full p-4 w-fit">
                <CheckCircle className="h-12 w-12 text-success" />
              </div>
              <CardTitle className="text-2xl">{t('auth.forgot.successTitle')}</CardTitle>
              <CardDescription className="text-base">
                {t('auth.forgot.successDesc', { email })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p className="mb-2">{t('auth.forgot.linkExpiry')}</p>
                <p>{t('auth.forgot.linkWarning')}</p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('auth.forgot.backToLogin')}
                </Link>
              </Button>
              <button
                type="button"
                onClick={() => setIsSuccess(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('auth.forgot.tryAgain')}
              </button>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

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
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t('auth.forgot.title')}</CardTitle>
            <CardDescription>
              {t('auth.forgot.description')}
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.forgot.email.label')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t('auth.forgot.email.placeholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  disabled={isLoading}
                  autoComplete="email"
                  autoFocus
                />
                {emailError && (
                  <p className="text-sm text-destructive mt-1">{emailError}</p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading || !email.trim() || !EMAIL_REGEX.test(email.trim())}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('auth.forgot.sending')}
                  </>
                ) : (
                  t('auth.forgot.submit')
                )}
              </Button>

              <Button variant="ghost" className="w-full" asChild>
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('auth.forgot.backToLogin')}
                </Link>
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

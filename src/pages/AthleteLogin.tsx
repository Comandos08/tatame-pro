import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, CheckCircle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';

export default function AthleteLogin() {
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Respeitar ?redirect se existir, senão usar /portal
    const redirect = searchParams.get('redirect') || `/${tenantSlug}/portal`;
    const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`;

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: false, // Apenas usuários existentes
      }
    });

    if (authError) {
      if (authError.message.includes('Signups not allowed') || authError.message.includes('User not found')) {
        setError(t('auth.magicLink.userNotFound'));
      } else {
        setError(authError.message);
      }
    } else {
      setEmailSent(true);
    }

    setIsLoading(false);
  };

  const handleResend = () => {
    setEmailSent(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Back to tenant */}
        <Link
          to={`/${tenantSlug}`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('auth.magicLink.backToTenant').replace('{tenant}', tenant?.name || '')}
        </Link>

        <Card>
          <CardHeader className="text-center">
            {/* Tenant branding */}
            {tenant?.logoUrl && (
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="h-16 w-auto mx-auto mb-4 object-contain"
              />
            )}
            
            {!emailSent ? (
              <>
                <CardTitle className="text-2xl font-display">
                  {t('auth.magicLink.title')}
                </CardTitle>
                <CardDescription>
                  {t('auth.magicLink.description')}
                </CardDescription>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
                </motion.div>
                <CardTitle className="text-2xl font-display">
                  {t('auth.magicLink.success')}
                </CardTitle>
                <CardDescription>
                  {t('auth.magicLink.successDesc')}
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {!emailSent ? (
              <form onSubmit={handleMagicLink} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.magicLink.emailLabel')}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !email}
                  variant="tenant"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('auth.magicLink.sending')}
                    </>
                  ) : (
                    t('auth.magicLink.button')
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t('auth.magicLink.checkSpam')}
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResend}
                >
                  {t('auth.magicLink.resend')}
                </Button>
              </div>
            )}

            {/* Admin login link */}
            <div className="pt-4 border-t text-center">
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('auth.magicLink.adminLogin')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

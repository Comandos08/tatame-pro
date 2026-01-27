/**
 * 🔐 JOIN ACCOUNT — Step 2: Login or Create Account
 * 
 * RULES:
 * - Tenant MUST be selected (redirect to /join/org if not)
 * - After auth, navigate to /join/confirm (NOT /portal)
 * - User can switch tenant
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowLeft, ArrowRight, Building2, X, User } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useJoin } from '@/contexts/JoinContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { useToast } from '@/hooks/use-toast';
import iconLogo from '@/assets/iconLogo.png';

export default function JoinAccount() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { toast } = useToast();
  const { selectedTenant, setSelectedTenant } = useJoin();
  const { signIn, signUp, isAuthenticated, isLoading: authLoading } = useCurrentUser();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('signup');

  // 🔐 Guard: Redirect to org selection if no tenant
  useEffect(() => {
    if (!selectedTenant) {
      navigate('/join/org', { replace: true });
    }
  }, [selectedTenant, navigate]);

  // 🔐 If already authenticated, proceed to confirm
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/join/confirm', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleChangeTenant = () => {
    setSelectedTenant(null);
    navigate('/join/org', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (activeTab === 'signup') {
        await signUp(email, password, name);
        toast({
          title: t('auth.accountCreated'),
          description: t('join.accountCreatedWizard'),
        });
      } else {
        await signIn(email, password);
        toast({
          title: t('auth.welcome'),
          description: t('auth.loginSuccess'),
        });
      }
      // 🔐 Navigate to confirm step, NOT /portal
      navigate('/join/confirm', { replace: true });
    } catch (error) {
      console.error('Auth error:', error);
      toast({
        title: t('auth.error'),
        description: error instanceof Error ? error.message : t('auth.genericError'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Don't render until we know tenant is selected
  if (!selectedTenant) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
            <span className="font-display text-lg font-bold">TATAME</span>
          </Link>
          
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="h-2 w-8 rounded-full bg-primary" />
            <div className="h-2 w-8 rounded-full bg-primary" />
            <div className="h-2 w-8 rounded-full bg-muted" />
          </div>
        </motion.div>

        {/* Selected tenant badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className="bg-muted/50">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 overflow-hidden">
                {selectedTenant.logoUrl ? (
                  <img
                    src={selectedTenant.logoUrl}
                    alt={selectedTenant.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{t('join.selectedOrg')}</p>
                <p className="font-medium text-sm truncate">{selectedTenant.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleChangeTenant}
                className="flex-shrink-0"
              >
                {t('join.change')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Auth form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{t('join.createOrLogin')}</CardTitle>
              <CardDescription>{t('join.createOrLoginDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'signup')}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signup">{t('join.newAccount')}</TabsTrigger>
                  <TabsTrigger value="login">{t('join.existingAccount')}</TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <TabsContent value="signup" className="space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t('auth.fullName')}</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          placeholder={t('auth.fullNamePlaceholder')}
                          className="pl-10"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required={activeTab === 'signup'}
                          autoComplete="name"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.emailLabel')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder={t('auth.emailPlaceholder')}
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.passwordLabel')}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('auth.passwordPlaceholder')}
                        className="pl-10 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete={activeTab === 'signup' ? 'new-password' : 'current-password'}
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

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : activeTab === 'signup' ? (
                      <>
                        {t('auth.createAccount')}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    ) : (
                      <>
                        {t('auth.login')}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Back button */}
        <div className="mt-6">
          <Button variant="ghost" onClick={() => navigate('/join/org')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('join.backToOrgSelection')}
          </Button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CreditCard, ExternalLink, Loader2, Phone, Mail, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TenantBlockedScreenProps {
  tenantName: string;
  tenantId: string;
  hasStripeCustomer: boolean;
}

export function TenantBlockedScreen({ tenantName, tenantId, hasStripeCustomer }: TenantBlockedScreenProps) {
  const { hasRole, currentUser } = useCurrentUser();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  // Check if user is admin or staff
  const isAdmin = currentUser && (
    hasRole('ADMIN_TENANT', tenantId) || 
    hasRole('STAFF_ORGANIZACAO', tenantId) ||
    hasRole('SUPERADMIN_GLOBAL')
  );

  const handleOpenCustomerPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('tenant-customer-portal', {
        body: { tenant_id: tenantId },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('URL do portal não retornada');
      }
    } catch (err) {
      console.error('Error opening customer portal:', err);
      toast.error('Erro ao abrir portal de pagamento. Entre em contato com o suporte.');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  // Admin view - shows management options
  if (isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg"
        >
          <Card className="border-destructive/50 shadow-lg">
            <CardHeader className="text-center pb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto mb-4 h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center"
              >
                <AlertTriangle className="h-10 w-10 text-destructive" />
              </motion.div>
              <CardTitle className="text-2xl font-display">
                Assinatura Inativa
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {tenantName}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center text-muted-foreground">
                <p>
                  O acesso ao sistema administrativo está suspenso devido a pendências 
                  no pagamento da assinatura.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Para regularizar:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-2 ml-6">
                  <li>• Atualize seu método de pagamento</li>
                  <li>• Efetue o pagamento pendente</li>
                  <li>• Ou entre em contato com nosso suporte</li>
                </ul>
              </div>

              <div className="space-y-3">
                {hasStripeCustomer && (
                  <Button
                    className="w-full"
                    onClick={handleOpenCustomerPortal}
                    disabled={isOpeningPortal}
                  >
                    {isOpeningPortal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Gerenciar Assinatura
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <a href="mailto:suporte@tatamepro.com.br">
                    <Mail className="h-4 w-4 mr-2" />
                    Contatar Suporte
                  </a>
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Após a regularização, o acesso será restaurado automaticamente.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Non-admin view - simple message
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-border shadow-lg">
          <CardHeader className="text-center pb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center"
            >
              <Clock className="h-8 w-8 text-muted-foreground" />
            </motion.div>
            <CardTitle className="text-xl font-display">
              Temporariamente Indisponível
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {tenantName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center text-muted-foreground text-sm">
              <p>
                Esta organização está temporariamente indisponível.
              </p>
              <p className="mt-2">
                Por favor, tente novamente mais tarde ou entre em contato com o administrador da sua organização.
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

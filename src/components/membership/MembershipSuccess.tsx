import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';

export function MembershipSuccess() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const membershipId = searchParams.get('membership_id');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const confirmPayment = async () => {
      if (!membershipId || !sessionId) {
        setStatus('error');
        setMessage('Parâmetros inválidos');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('confirm-membership-payment', {
          body: { sessionId, membershipId },
        });

        if (error) throw error;

        if (data?.success) {
          setStatus('success');
          setMessage('Sua filiação foi registrada com sucesso!');
        } else {
          setStatus('error');
          setMessage(data?.message || 'Erro ao confirmar pagamento');
        }
      } catch (error) {
        console.error('Error confirming payment:', error);
        setStatus('error');
        setMessage('Erro ao processar pagamento. Entre em contato conosco.');
      }
    };

    confirmPayment();
  }, [membershipId, sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            {status === 'loading' && (
              <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
            )}
            {status === 'success' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle className="h-16 w-16 mx-auto text-success mb-4" />
              </motion.div>
            )}
            {status === 'error' && (
              <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            )}
            
            <CardTitle className="text-2xl">
              {status === 'loading' && 'Processando...'}
              {status === 'success' && 'Pagamento Confirmado!'}
              {status === 'error' && 'Ops!'}
            </CardTitle>
            <CardDescription className="text-base">
              {status === 'loading' && 'Aguarde enquanto confirmamos seu pagamento'}
              {status === 'success' && message}
              {status === 'error' && message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'success' && (
              <>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">Status da Filiação</p>
                  <p className="font-medium text-warning">Aguardando Aprovação</p>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Sua filiação está em análise pela {tenant?.name}. 
                  Você receberá uma notificação quando for aprovada.
                </p>
              </>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => navigate(`/${tenantSlug}`)}
                variant={status === 'success' ? 'default' : 'outline'}
              >
                Voltar para {tenant?.name || 'Início'}
              </Button>
              
              {status === 'error' && (
                <Button
                  onClick={() => navigate(`/${tenantSlug}/membership/new`)}
                  variant="default"
                >
                  Tentar novamente
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

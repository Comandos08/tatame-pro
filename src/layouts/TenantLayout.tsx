import React from 'react';
import { Outlet } from 'react-router-dom';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';

function TenantContent() {
  const { tenant, isLoading, error } = useTenant();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando organização...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 p-8 text-center"
        >
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-bold">Organização não encontrada</h1>
          <p className="text-muted-foreground max-w-md">
            A organização que você está procurando não existe ou não está ativa no momento.
          </p>
        </motion.div>
      </div>
    );
  }

  return <Outlet />;
}

export function TenantLayout() {
  return (
    <TenantProvider>
      <TenantContent />
    </TenantProvider>
  );
}

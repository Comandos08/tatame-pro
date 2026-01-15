import React from 'react';
import { motion } from 'framer-motion';
import { Users, Award, FileText, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';

export default function TenantDashboard() {
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();

  if (!tenant) return null;

  const stats = [
    { label: 'Atletas Filiados', value: '234', icon: Users, trend: '+12%' },
    { label: 'Graduações Pendentes', value: '18', icon: Award, trend: '+5' },
    { label: 'Documentos', value: '156', icon: FileText, trend: '3 novos' },
    { label: 'Filiações este mês', value: '42', icon: TrendingUp, trend: '+23%' },
  ];

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Welcome section */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-3xl font-bold mb-2"
          >
            Olá, {currentUser?.name || 'Usuário'}! 👋
          </motion.h1>
          <p className="text-muted-foreground">
            Bem-vindo ao painel da {tenant.name}. Aqui você pode gerenciar atletas, academias e graduações.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Card className="card-hover">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-display font-bold">{stat.value}</div>
                  <p className="text-xs text-success mt-1">{stat.trend}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Placeholder content */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Atividade Recente</CardTitle>
              <CardDescription>Últimas atualizações do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Dashboard do tenant (federação/organização) – placeholder.
                  <br />
                  Funcionalidades de filiação serão implementadas na Fase 1b.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Acesse funções frequentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Atalhos para cadastro de atletas, aprovação de filiações 
                  e emissão de diplomas serão adicionados em breve.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

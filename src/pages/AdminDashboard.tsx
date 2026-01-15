import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Building2, Users, LogOut, Activity, ExternalLink, Power, Loader2, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentUser } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  sport_types: string[];
  is_active: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const { currentUser, signOut, isGlobalSuperadmin, isLoading: authLoading } = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!authLoading && !isGlobalSuperadmin && currentUser) {
      navigate('/');
    }
  }, [isGlobalSuperadmin, currentUser, navigate, authLoading]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Fetch all tenants
  const { data: tenants, isLoading: tenantsLoading, refetch } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Tenant[];
    },
    enabled: isGlobalSuperadmin,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [tenantsRes, profilesRes, athletesRes] = await Promise.all([
        supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('athletes').select('id', { count: 'exact', head: true }),
      ]);
      
      return {
        activeTenants: tenantsRes.count || 0,
        totalUsers: profilesRes.count || 0,
        totalAthletes: athletesRes.count || 0,
      };
    },
    enabled: isGlobalSuperadmin,
  });

  // Toggle tenant active status
  const toggleTenantMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('tenants')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Status do tenant atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tenant');
      console.error(error);
    },
  });

  const statCards = [
    { label: 'Organizações Ativas', value: stats?.activeTenants || 0, icon: Building2, color: 'text-primary' },
    { label: 'Usuários Totais', value: stats?.totalUsers || 0, icon: Users, color: 'text-info' },
    { label: 'Atletas Filiados', value: stats?.totalAthletes || 0, icon: Activity, color: 'text-success' },
  ];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold">IPPON Admin</h1>
              <p className="text-xs text-muted-foreground">Painel Global</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{currentUser?.email}</span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold mb-2">
              Admin Global da Plataforma
            </h2>
            <p className="text-muted-foreground">
              Gerencie todas as organizações de esportes de combate da plataforma IPPON.
            </p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {statCards.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className="card-hover">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-display font-bold">
                      {stat.value.toLocaleString('pt-BR')}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Tenants Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Organizações
                  </CardTitle>
                  <CardDescription>
                    Gerencie todas as organizações da plataforma
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tenants && tenants.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Modalidades</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-medium">{tenant.name}</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {tenant.slug}
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {tenant.sport_types?.map((sport) => (
                              <Badge key={sport} variant="outline" className="text-xs">
                                {sport}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={tenant.is_active}
                              onCheckedChange={(checked) => 
                                toggleTenantMutation.mutate({ id: tenant.id, isActive: checked })
                              }
                              disabled={toggleTenantMutation.isPending}
                            />
                            <span className={tenant.is_active ? 'text-success' : 'text-muted-foreground'}>
                              {tenant.is_active ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/${tenant.slug}/app`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Acessar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma organização encontrada
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}

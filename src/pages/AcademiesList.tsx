import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, Edit, Loader2, AlertCircle, MapPin, Phone, Mail, Power } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/layouts/AppShell';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Academy {
  id: string;
  name: string;
  slug: string;
  sport_type: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export default function AcademiesList() {
  const { tenant } = useTenant();
  const { hasRole, isGlobalSuperadmin } = useCurrentUser();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAcademy, setEditingAcademy] = useState<Academy | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    sport_type: '',
    city: '',
    state: '',
    phone: '',
    email: '',
  });

  const canManage = isGlobalSuperadmin || 
    (tenant && (hasRole('ADMIN_TENANT', tenant.id) || hasRole('STAFF_ORGANIZACAO', tenant.id)));

  const { data: academies, isLoading, error } = useQuery({
    queryKey: ['academies', tenant?.id],
    queryFn: async () => {
      if (!tenant) return [];
      
      const { data, error } = await supabase
        .from('academies')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name');
      
      if (error) throw error;
      return data as Academy[];
    },
    enabled: !!tenant,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!tenant) throw new Error('Tenant not found');
      
      const { error } = await supabase
        .from('academies')
        .insert({
          tenant_id: tenant.id,
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
          sport_type: data.sport_type || tenant.sportTypes?.[0] || null,
          city: data.city || null,
          state: data.state || null,
          phone: data.phone || null,
          email: data.email || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academies'] });
      setIsCreateOpen(false);
      resetForm();
      toast.success('Academia criada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar academia');
      console.error(error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const { error } = await supabase
        .from('academies')
        .update({
          name: data.name,
          slug: data.slug,
          sport_type: data.sport_type || null,
          city: data.city || null,
          state: data.state || null,
          phone: data.phone || null,
          email: data.email || null,
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academies'] });
      setEditingAcademy(null);
      resetForm();
      toast.success('Academia atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar academia');
      console.error(error);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('academies')
        .update({ is_active: isActive })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academies'] });
      toast.success('Status atualizado');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar status');
      console.error(error);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      sport_type: '',
      city: '',
      state: '',
      phone: '',
      email: '',
    });
  };

  const openEditDialog = (academy: Academy) => {
    setEditingAcademy(academy);
    setFormData({
      name: academy.name,
      slug: academy.slug,
      sport_type: academy.sport_type || '',
      city: academy.city || '',
      state: academy.state || '',
      phone: academy.phone || '',
      email: academy.email || '',
    });
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast.error('Nome é obrigatório');
      return;
    }
    
    if (editingAcademy) {
      updateMutation.mutate({ id: editingAcademy.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (!tenant) return null;

  const AcademyForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Nome da academia"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
            placeholder="slug-da-academia"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sport_type">Modalidade</Label>
          <Input
            id="sport_type"
            value={formData.sport_type}
            onChange={(e) => setFormData({ ...formData, sport_type: e.target.value })}
            placeholder="Ex: BJJ"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Cidade</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            placeholder="Cidade"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="state">Estado</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            placeholder="UF"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="academia@email.com"
        />
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold">Academias</h1>
            <p className="text-muted-foreground">
              Gerencie as academias vinculadas à {tenant.name}
            </p>
          </div>
          {canManage && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Academia
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Academia</DialogTitle>
                  <DialogDescription>
                    Adicione uma nova academia à organização
                  </DialogDescription>
                </DialogHeader>
                <AcademyForm />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </motion.div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">Erro ao carregar academias</p>
            </CardContent>
          </Card>
        ) : academies && academies.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {academies.map((academy, index) => (
              <motion.div
                key={academy.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="card-hover h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{academy.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {academy.sport_type || 'Todas modalidades'}
                          </CardDescription>
                        </div>
                      </div>
                      {canManage && (
                        <Switch
                          checked={academy.is_active}
                          onCheckedChange={(checked) => 
                            toggleActiveMutation.mutate({ id: academy.id, isActive: checked })
                          }
                        />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(academy.city || academy.state) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {[academy.city, academy.state].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {academy.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {academy.phone}
                      </div>
                    )}
                    {academy.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {academy.email}
                      </div>
                    )}
                    <div className="pt-2">
                      <Badge variant={academy.is_active ? 'default' : 'secondary'}>
                        {academy.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                    {canManage && (
                      <div className="pt-2">
                        <Dialog open={editingAcademy?.id === academy.id} onOpenChange={(open) => !open && setEditingAcademy(null)}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(academy)}>
                              <Edit className="h-3 w-3 mr-2" />
                              Editar
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Editar Academia</DialogTitle>
                              <DialogDescription>
                                Atualize as informações da academia
                              </DialogDescription>
                            </DialogHeader>
                            <AcademyForm />
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEditingAcademy(null)}>
                                Cancelar
                              </Button>
                              <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
                                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Salvar
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-display font-bold text-xl mb-2">Nenhuma academia cadastrada</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-md">
                Comece cadastrando as academias vinculadas à sua organização.
              </p>
              {canManage && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeira academia
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Settings, ChevronRight, Award, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { AppShell } from '@/layouts/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { GradingScheme } from '@/types/grading';

export default function GradingSchemesList() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState<GradingScheme | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sport_type: '',
    is_default: false,
  });

  const { data: schemes, isLoading } = useQuery({
    queryKey: ['grading-schemes', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('grading_schemes')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('sport_type', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as GradingScheme[];
    },
    enabled: !!tenant?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('grading_schemes').insert({
        tenant_id: tenant!.id,
        name: data.name,
        sport_type: data.sport_type,
        is_default: data.is_default,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grading-schemes'] });
      toast.success('Esquema de graduação criado!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar esquema: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('grading_schemes')
        .update({
          name: data.name,
          sport_type: data.sport_type,
          is_default: data.is_default,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grading-schemes'] });
      toast.success('Esquema atualizado!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar esquema: ' + error.message);
    },
  });

  const openCreateDialog = () => {
    setEditingScheme(null);
    setFormData({
      name: '',
      sport_type: tenant?.sportTypes?.[0] || '',
      is_default: false,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (scheme: GradingScheme) => {
    setEditingScheme(scheme);
    setFormData({
      name: scheme.name,
      sport_type: scheme.sport_type,
      is_default: scheme.is_default,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingScheme(null);
    setFormData({ name: '', sport_type: '', is_default: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScheme) {
      updateMutation.mutate({ id: editingScheme.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const sportTypes = tenant?.sportTypes || [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Esquemas de Graduação
            </h1>
            <p className="text-muted-foreground">
              Configure os sistemas de graduação por modalidade
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Esquema
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !schemes?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Award className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                Nenhum esquema de graduação configurado.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro esquema
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {schemes.map((scheme, index) => (
              <motion.div
                key={scheme.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{scheme.name}</CardTitle>
                        <CardDescription>{scheme.sport_type}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {scheme.is_default && (
                          <Badge variant="secondary">Padrão</Badge>
                        )}
                        {!scheme.is_active && (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(scheme)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a href={`/${tenant?.slug}/app/grading-schemes/${scheme.id}/levels`}>
                          Níveis
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingScheme ? 'Editar Esquema' : 'Novo Esquema de Graduação'}
              </DialogTitle>
              <DialogDescription>
                Configure um sistema de graduação para uma modalidade esportiva.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Esquema</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: BJJ Adulto Padrão"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sport_type">Modalidade</Label>
                <Select
                  value={formData.sport_type}
                  onValueChange={(value) => setFormData({ ...formData, sport_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a modalidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {sportTypes.map((sport) => (
                      <SelectItem key={sport} value={sport}>
                        {sport}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default">Esquema padrão para esta modalidade</Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingScheme ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

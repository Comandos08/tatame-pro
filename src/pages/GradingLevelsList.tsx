import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Plus, 
  ArrowLeft, 
  GripVertical, 
  Pencil, 
  Loader2,
  Award 
} from 'lucide-react';
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
import { toast } from 'sonner';
import type { GradingScheme, GradingLevel } from '@/types/grading';

export default function GradingLevelsList() {
  const { tenantSlug, schemeId } = useParams<{ tenantSlug: string; schemeId: string }>();
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<GradingLevel | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    order_index: 0,
    min_time_months: '',
    min_age: '',
    is_active: true,
  });

  const { data: scheme, isLoading: schemeLoading } = useQuery({
    queryKey: ['grading-scheme', schemeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grading_schemes')
        .select('*')
        .eq('id', schemeId)
        .single();
      if (error) throw error;
      return data as GradingScheme;
    },
    enabled: !!schemeId,
  });

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ['grading-levels', schemeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grading_levels')
        .select('*')
        .eq('grading_scheme_id', schemeId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return data as GradingLevel[];
    },
    enabled: !!schemeId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from('grading_levels').insert({
        tenant_id: tenant!.id,
        grading_scheme_id: schemeId,
        code: data.code,
        display_name: data.display_name,
        order_index: data.order_index,
        min_time_months: data.min_time_months ? parseInt(data.min_time_months) : null,
        min_age: data.min_age ? parseInt(data.min_age) : null,
        is_active: data.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grading-levels', schemeId] });
      toast.success('Nível criado!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar nível: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('grading_levels')
        .update({
          code: data.code,
          display_name: data.display_name,
          order_index: data.order_index,
          min_time_months: data.min_time_months ? parseInt(data.min_time_months) : null,
          min_age: data.min_age ? parseInt(data.min_age) : null,
          is_active: data.is_active,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grading-levels', schemeId] });
      toast.success('Nível atualizado!');
      closeDialog();
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar nível: ' + error.message);
    },
  });

  const openCreateDialog = () => {
    const nextOrder = levels?.length ? Math.max(...levels.map(l => l.order_index)) + 1 : 0;
    setEditingLevel(null);
    setFormData({
      code: '',
      display_name: '',
      order_index: nextOrder,
      min_time_months: '',
      min_age: '',
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (level: GradingLevel) => {
    setEditingLevel(level);
    setFormData({
      code: level.code,
      display_name: level.display_name,
      order_index: level.order_index,
      min_time_months: level.min_time_months?.toString() || '',
      min_age: level.min_age?.toString() || '',
      is_active: level.is_active,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingLevel(null);
    setFormData({
      code: '',
      display_name: '',
      order_index: 0,
      min_time_months: '',
      min_age: '',
      is_active: true,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLevel) {
      updateMutation.mutate({ id: editingLevel.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isLoading = schemeLoading || levelsLoading;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/${tenantSlug}/app/grading-schemes`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Níveis de Graduação
            </h1>
            {scheme && (
              <p className="text-muted-foreground">
                {scheme.name} • {scheme.sport_type}
              </p>
            )}
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Nível
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !levels?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Award className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                Nenhum nível configurado para este esquema.
              </p>
              <Button onClick={openCreateDialog} variant="outline" className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar primeiro nível
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Níveis ({levels.length})</CardTitle>
              <CardDescription>
                Arraste para reordenar a progressão das faixas/níveis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {levels.map((level, index) => (
                  <motion.div
                    key={level.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="text-muted-foreground cursor-grab">
                      <GripVertical className="h-5 w-5" />
                    </div>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {level.order_index}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{level.display_name}</p>
                        <Badge variant="outline" className="text-xs">
                          {level.code}
                        </Badge>
                        {!level.is_active && (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        {level.min_time_months && (
                          <span>Min. {level.min_time_months} meses</span>
                        )}
                        {level.min_age && (
                          <span>Min. {level.min_age} anos</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(level)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingLevel ? 'Editar Nível' : 'Novo Nível de Graduação'}
              </DialogTitle>
              <DialogDescription>
                Configure um nível/faixa dentro do esquema de graduação.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="WHITE, BLUE..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order_index">Ordem</Label>
                  <Input
                    id="order_index"
                    type="number"
                    value={formData.order_index}
                    onChange={(e) => setFormData({ ...formData, order_index: parseInt(e.target.value) || 0 })}
                    min={0}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome de Exibição</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="Faixa Branca"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_time_months">Tempo Mínimo (meses)</Label>
                  <Input
                    id="min_time_months"
                    type="number"
                    value={formData.min_time_months}
                    onChange={(e) => setFormData({ ...formData, min_time_months: e.target.value })}
                    placeholder="Opcional"
                    min={0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_age">Idade Mínima</Label>
                  <Input
                    id="min_age"
                    type="number"
                    value={formData.min_age}
                    onChange={(e) => setFormData({ ...formData, min_age: e.target.value })}
                    placeholder="Opcional"
                    min={0}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Nível ativo</Label>
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
                {editingLevel ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

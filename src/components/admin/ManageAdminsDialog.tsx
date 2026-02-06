import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Loader2, Copy, Check, Mail, UserPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface TenantAdmin {
  id: string;
  user_id: string;
  profile: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

interface ManageAdminsDialogProps {
  tenant: Tenant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageAdminsDialog({ tenant, open, onOpenChange }: ManageAdminsDialogProps) {
  const { t } = useI18n();
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [useExisting, setUseExisting] = useState(true);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<TenantAdmin | null>(null);
  
  const queryClient = useQueryClient();

  // Fetch current admins for this tenant
  const { data: admins, isLoading: adminsLoading } = useQuery({
    queryKey: ['tenant-admins', tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          profile:profiles!user_id(id, email, name)
        `)
        .eq('tenant_id', tenant.id)
        .eq('role', 'ADMIN_TENANT');

      if (error) throw error;
      return data as unknown as TenantAdmin[];
    },
    enabled: open,
  });

  const addAdminMutation = useMutation({
    mutationFn: async () => {
      if (!email.trim()) {
        throw new Error('E-mail é obrigatório');
      }

      const { data, error } = await supabase.functions.invoke('create-tenant-admin', {
        body: {
          email: email.trim(),
          name: useExisting ? undefined : name.trim(),
          password: useExisting ? undefined : password || undefined,
          tenantId: tenant.id,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Erro ao adicionar admin');

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-admins', tenant.id] });
      
      if (data.isNewUser && data.generatedPassword) {
        setCreatedCredentials({
          email: email.trim(),
          password: data.generatedPassword,
        });
        toast.success('Novo admin criado! Anote as credenciais.');
      } else if (data.alreadyAdmin) {
        toast.info('Este usuário já é admin desta organização.');
      } else {
        toast.success('Admin adicionado com sucesso!');
      }
      
      setEmail('');
      setName('');
      setPassword('');
      setIsAddingAdmin(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar admin');
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (admin: TenantAdmin) => {
      // 🔐 C3 FIX: Route ALL role revocations through revoke-roles Edge Function
      // This ensures: audit logging, decision logs, rate limiting, impersonation checks
      const { data, error } = await supabase.functions.invoke('revoke-roles', {
        body: {
          targetProfileId: admin.user_id,
          tenantId: tenant.id,
          roles: ['ADMIN_TENANT'],
          reason: 'Removed via ManageAdminsDialog',
          forceRemoveAll: false, // Don't orphan the user
        },
      });

      if (error) {
        console.error('[ManageAdminsDialog] revoke-roles invocation error:', error);
        throw new Error('Operation not permitted');
      }

      // Handle specific error codes from the Edge Function
      if (!data?.ok) {
        const errorCode = data?.code;
        
        // Map error codes to user-friendly messages (anti-enumeration)
        if (errorCode === 'VALIDATION_FAILED') {
          throw new Error('Cannot remove the last admin role');
        }
        
        // Generic error for all other cases (security)
        throw new Error('Operation not permitted');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-admins', tenant.id] });
      toast.success('Admin removido com sucesso');
      setAdminToRemove(null);
    },
    onError: (error) => {
      // Anti-enumeration: show generic message
      toast.error(error instanceof Error ? error.message : 'Erro ao remover admin');
      setAdminToRemove(null);
    },
  });

  const copyPassword = () => {
    if (createdCredentials?.password) {
      navigator.clipboard.writeText(createdCredentials.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const resetForm = () => {
    setIsAddingAdmin(false);
    setEmail('');
    setName('');
    setPassword('');
    setCreatedCredentials(null);
    setUseExisting(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Administradores
            </DialogTitle>
            <DialogDescription>
              Gerencie os administradores da organização <strong>{tenant.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Success credentials display */}
            {createdCredentials && (
              <Card className="border-success bg-success/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-success">Credenciais do novo admin</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">E-mail</Label>
                    <p className="font-mono text-sm">{createdCredentials.email}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Senha temporária</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-background px-2 py-1 rounded text-sm font-mono">
                        {createdCredentials.password}
                      </code>
                      <Button variant="ghost" size="sm" onClick={copyPassword}>
                        {copiedPassword ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Envie estas credenciais para o admin. Ele poderá acessar em /{tenant.slug}/app após fazer login.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setCreatedCredentials(null)}>
                    Fechar
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Current admins list */}
            {adminsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : admins && admins.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-sm">Administradores atuais</Label>
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Mail className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {admin.profile?.name || 'Sem nome'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {admin.profile?.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setAdminToRemove(admin)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('empty.admins.title')}</p>
              </div>
            )}

            <Separator />

            {/* Add admin form */}
            {isAddingAdmin ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={useExisting ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUseExisting(true)}
                  >
                    Usuário existente
                  </Button>
                  <Button
                    variant={!useExisting ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUseExisting(false)}
                  >
                    Criar novo usuário
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-email">E-mail *</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    placeholder="admin@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {!useExisting && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="admin-name">Nome</Label>
                      <Input
                        id="admin-name"
                        placeholder="Nome do administrador"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="admin-password">Senha (deixe vazio para gerar)</Label>
                      <Input
                        id="admin-password"
                        type="text"
                        placeholder="Senha temporária"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se deixar vazio, uma senha aleatória será gerada.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddingAdmin(false);
                      setEmail('');
                      setName('');
                      setPassword('');
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => addAdminMutation.mutate()}
                    disabled={addAdminMutation.isPending}
                  >
                    {addAdminMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Adicionar Admin'
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsAddingAdmin(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Admin
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove admin confirmation */}
      <AlertDialog open={!!adminToRemove} onOpenChange={() => setAdminToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover administrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{adminToRemove?.profile?.email}</strong> como
              administrador de <strong>{tenant.name}</strong>?
              <br /><br />
              Esta ação pode ser revertida adicionando o admin novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => adminToRemove && removeAdminMutation.mutate(adminToRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeAdminMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

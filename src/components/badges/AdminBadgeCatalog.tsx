import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, Pencil, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BadgeCatalogRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface AdminBadgeCatalogProps {
  tenantId: string;
}

/**
 * AdminBadgeCatalog — Manage the badge catalog for a tenant.
 * Edit name/description, toggle active status.
 * No CRUD of new badges. No deletion. Code is immutable.
 * Badge = reconhecimento simbólico. Não concede permissões.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function AdminBadgeCatalog({ tenantId }: AdminBadgeCatalogProps) {
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<BadgeCatalogRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [toggleTarget, setToggleTarget] = useState<BadgeCatalogRow | null>(null);

  const { data: badges = [], isLoading } = useQuery({
    queryKey: ["badge-catalog", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badges")
        .select("id, code, name, description, is_active")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data || []) as BadgeCatalogRow[];
    },
    enabled: !!tenantId,
  });

  // Edit metadata mutation
  const editMutation = useMutation({
    mutationFn: async ({ badgeId, name, description }: { badgeId: string; name: string; description: string | null }) => {
      const response = await supabase.functions.invoke("update-badge-metadata", {
        body: { badgeId, name, description },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["badge-catalog", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenant-badges-catalog", tenantId] });
      setEditTarget(null);
      toast.success("Badge atualizado com sucesso.");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar badge: ${err.message}`);
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ badgeId, isActive }: { badgeId: string; isActive: boolean }) => {
      const response = await supabase.functions.invoke("toggle-badge-active", {
        body: { badgeId, isActive },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["badge-catalog", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["tenant-badges-catalog", tenantId] });
      setToggleTarget(null);
      if (data?.action === "NOOP") {
        toast.info("Status já estava definido.");
      } else {
        toast.success(data?.action === "BADGE_ACTIVATED" ? "Badge ativado." : "Badge desativado.");
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao alterar status: ${err.message}`);
    },
  });

  function openEdit(badge: BadgeCatalogRow) {
    setEditName(badge.name);
    setEditDescription(badge.description || "");
    setEditTarget(badge);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Badges de Reconhecimento
        </CardTitle>
        <CardDescription>
          Badges são reconhecimentos simbólicos. Não concedem permissões nem acesso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : badges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum badge cadastrado neste tenant.
          </p>
        ) : (
          <div className="divide-y">
            {badges.map((badge) => (
              <div key={badge.id} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{badge.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{badge.code}</span>
                    {badge.is_active ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ativo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 opacity-60">Inativo</Badge>
                    )}
                  </div>
                  {badge.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{badge.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(badge)}
                    title="Editar nome/descrição"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setToggleTarget(badge)}
                    title={badge.is_active ? "Desativar" : "Ativar"}
                  >
                    {badge.is_active ? (
                      <ToggleRight className="h-4 w-4 text-primary" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Badge</DialogTitle>
            <DialogDescription>
              Altere o nome e descrição do badge. O código ({editTarget?.code}) não pode ser alterado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="badge-name">Nome</Label>
              <Input
                id="badge-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do badge"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge-desc">Descrição</Label>
              <Textarea
                id="badge-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Descrição opcional"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editTarget &&
                editMutation.mutate({
                  badgeId: editTarget.id,
                  name: editName,
                  description: editDescription || null,
                })
              }
              disabled={!editName.trim() || editMutation.isPending}
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Confirmation */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? "Desativar" : "Ativar"} Badge
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `Desativar "${toggleTarget.name}" impedirá novas atribuições, mas badges já concedidos permanecerão ativos.`
                : `Ativar "${toggleTarget?.name}" permitirá que ele seja atribuído a atletas novamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                toggleTarget &&
                toggleMutation.mutate({
                  badgeId: toggleTarget.id,
                  isActive: !toggleTarget.is_active,
                })
              }
              disabled={toggleMutation.isPending}
            >
              {toggleMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {toggleTarget?.is_active ? "Desativar" : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

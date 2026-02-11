import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { BadgeChip } from "./BadgeChip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AdminBadgeManagerProps {
  athleteId: string;
  tenantId: string;
}

interface BadgeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface AthleteBadgeRow {
  id: string;
  badge_id: string;
  badges: BadgeRow;
}

/**
 * AdminBadgeManager — Admin-only badge assign/revoke UI.
 * Writes exclusively via Edge Functions (service_role).
 * Badge = reconhecimento simbólico. Não concede permissões.
 *
 * @see docs/BADGE-CONTRACT.md
 */
export function AdminBadgeManager({ athleteId, tenantId }: AdminBadgeManagerProps) {
  useI18n();
  const queryClient = useQueryClient();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ badgeId: string; name: string } | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState("");

  // Fetch athlete's active badges
  const { data: activeBadges = [], isLoading: badgesLoading } = useQuery({
    queryKey: ["athlete-badges-admin", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_badges")
        .select("id, badge_id, badges(id, code, name, description)")
        .eq("athlete_id", athleteId)
        .is("revoked_at", null);
      if (error) throw error;
      return (data || []) as unknown as AthleteBadgeRow[];
    },
    enabled: !!athleteId,
  });

  // Fetch all tenant badges (catalog)
  const { data: allBadges = [] } = useQuery({
    queryKey: ["tenant-badges-catalog", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badges")
        .select("id, code, name, description")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as BadgeRow[];
    },
    enabled: !!tenantId,
  });

  // Available badges = catalog minus already assigned
  const activeBadgeIds = new Set(activeBadges.map((ab) => ab.badge_id));
  const availableBadges = allBadges.filter((b) => !activeBadgeIds.has(b.id));

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: async (badgeId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("assign-athlete-badge", {
        body: { athleteId, badgeId },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["athlete-badges-admin", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-badges", athleteId] });
      setAssignDialogOpen(false);
      setSelectedBadgeId("");
      if (data?.action === "NOOP") {
        toast.info("Badge já atribuído.");
      } else {
        toast.success("Badge atribuído com sucesso.");
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atribuir badge: ${error.message}`);
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async (badgeId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("revoke-athlete-badge", {
        body: { athleteId, badgeId },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["athlete-badges-admin", athleteId] });
      queryClient.invalidateQueries({ queryKey: ["athlete-badges", athleteId] });
      setRevokeTarget(null);
      toast.success("Badge revogado com sucesso.");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao revogar badge: ${error.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" />
              Badges de Reconhecimento
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Badges são reconhecimentos simbólicos. Não concedem permissões.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignDialogOpen(true)}
            disabled={availableBadges.length === 0}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Atribuir
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {badgesLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum badge atribuído.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeBadges.map((ab) => (
              <div key={ab.id} className="group relative inline-flex">
                <BadgeChip
                  name={ab.badges.name}
                  description={ab.badges.description}
                  surface="ATHLETE_CARD"
                />
                <button
                  onClick={() => setRevokeTarget({ badgeId: ab.badge_id, name: ab.badges.name })}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Revogar ${ab.badges.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Badge</DialogTitle>
            <DialogDescription>
              Selecione um badge de reconhecimento simbólico para atribuir ao atleta.
              Badges não concedem permissões.
            </DialogDescription>
          </DialogHeader>

          <Select value={selectedBadgeId} onValueChange={setSelectedBadgeId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um badge..." />
            </SelectTrigger>
            <SelectContent>
              {availableBadges.map((badge) => (
                <SelectItem key={badge.id} value={badge.id}>
                  {badge.name}
                  {badge.description && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      — {badge.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialogOpen(false);
                setSelectedBadgeId("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => assignMutation.mutate(selectedBadgeId)}
              disabled={!selectedBadgeId || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Atribuir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar Badge</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja revogar o badge <strong>{revokeTarget?.name}</strong>?
              Esta ação pode ser revertida atribuindo novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.badgeId)}
              disabled={revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

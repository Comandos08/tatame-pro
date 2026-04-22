import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';

const SPORT_TYPES = ['Jiu-Jitsu', 'Judo', 'Muay Thai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA', 'Sambo', 'Krav Maga'];
const LOCALES = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sport_types: string[];
  default_locale: string;
  primary_color: string;
  is_active: boolean;
}

interface EditTenantDialogProps {
  tenant: Tenant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTenantDialog({ tenant, open, onOpenChange }: EditTenantDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(tenant.name);
  const [description, setDescription] = useState(tenant.description || '');
  const [selectedSports, setSelectedSports] = useState<string[]>(tenant.sport_types || []);
  const [defaultLocale, setDefaultLocale] = useState(tenant.default_locale || 'pt-BR');
  const [primaryColor, setPrimaryColor] = useState(tenant.primary_color || '#dc2626');
  const [isActive, setIsActive] = useState(tenant.is_active);
  
  const queryClient = useQueryClient();

  // Parent remounts this dialog with a `key={tenant.id}` so local form state is
  // freshly initialised from props instead of being synced via an effect.

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error(t('admin.nameRequired'));
      }

      if (selectedSports.length === 0) {
        throw new Error(t('admin.selectModality'));
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          sport_types: selectedSports,
          default_locale: defaultLocale,
          primary_color: primaryColor,
          is_active: isActive,
        })
        .eq('id', tenant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('admin.organizationUpdatedSuccess'));
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('admin.organizationUpdateError'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.editOrganization')}</DialogTitle>
          <DialogDescription>
            {t('admin.editOrganizationDesc', { name: tenant.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-tenant-name">{t('admin.organizationNameLabel')} *</Label>
            <Input
              id="edit-tenant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('admin.slugLabel')}</Label>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                /{tenant.slug}
              </code>
              <Button variant="ghost" size="sm" asChild>
                <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('admin.slugImmutable')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('admin.modalities')} *</Label>
            <div className="flex flex-wrap gap-2">
              {SPORT_TYPES.map((sport) => (
                <Badge
                  key={sport}
                  variant={selectedSports.includes(sport) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleSport(sport)}
                >
                  {sport}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-default-locale">{t('admin.defaultLanguage')}</Label>
              <Select value={defaultLocale} onValueChange={setDefaultLocale}>
                <SelectTrigger id="edit-default-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((loc) => (
                    <SelectItem key={loc.code} value={loc.code}>
                      {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-primary-color">{t('admin.primaryColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="edit-primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">{t('admin.descriptionLabel')}</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div>
              <Label htmlFor="is-active">{t('admin.organizationStatus')}</Label>
              <p className="text-sm text-muted-foreground">
                {isActive ? t('admin.statusActiveDesc') : t('admin.statusInactiveDesc')}
              </p>
            </div>
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              t('common.saveChanges')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

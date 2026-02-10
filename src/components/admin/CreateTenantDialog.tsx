import React, { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify, isValidSlug } from '@/lib/slugify';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';

const SPORT_TYPES = ['Jiu-Jitsu', 'Judo', 'Muay Thai', 'Wrestling', 'Karate', 'Taekwondo', 'Boxing', 'MMA', 'Sambo', 'Krav Maga'];
const LOCALES = [
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

interface CreateTenantDialogProps {
  onSuccess?: (tenant: { id: string; slug: string; name: string }) => void;
}

export function CreateTenantDialog({ onSuccess }: CreateTenantDialogProps) {
  const { isAuthenticated } = useCurrentUser();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [defaultLocale, setDefaultLocale] = useState('pt-BR');
  const [primaryColor, setPrimaryColor] = useState('#dc2626');

  const queryClient = useQueryClient();

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(value));
    }
  };

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // ✅ GUARD ESTRUTURAL: Garantir sessão pronta antes de qualquer operação
      if (!isAuthenticated) {
        throw new Error(t('admin.sessionSyncError'));
      }

      if (!name.trim() || !slug.trim()) {
        throw new Error(t('admin.nameSlugRequired'));
      }

      // ✅ Validação de slug reservado ou inválido
      if (!isValidSlug(slug)) {
        throw new Error(t('admin.slugInvalid'));
      }

      if (selectedSports.length === 0) {
        throw new Error(t('admin.selectModality'));
      }

      // Check if slug is unique
      const { data: existing } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (existing) {
        throw new Error(t('admin.slugInUse'));
      }

      const { data, error } = await supabase
        .from('tenants')
        .insert({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          sport_types: selectedSports,
          default_locale: defaultLocale,
          primary_color: primaryColor,
          is_active: true,
        })
        .select('id, slug, name')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(t('admin.organizationCreatedSuccess').replace('{name}', data.name));
      setOpen(false);
      resetForm();
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('admin.organizationCreateError'));
    },
  });

  const resetForm = () => {
    setName('');
    setSlug('');
    setDescription('');
    setSelectedSports([]);
    setDefaultLocale('pt-BR');
    setPrimaryColor('#dc2626');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          {t('admin.newOrganization')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.createOrganization')}</DialogTitle>
          <DialogDescription>
            {t('admin.createOrganizationDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">{t('admin.organizationNameLabel')} *</Label>
            <Input
              id="tenant-name"
              placeholder={t('admin.organizationNamePlaceholder')}
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-slug">{t('admin.slugLabel')} *</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">tatame.pro/</span>
              <Input
                id="tenant-slug"
                placeholder={t('admin.slugPlaceholder')}
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('admin.slugHint').replace('{slug}', slug || 'exemplo')}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('admin.modalities')} *</Label>
            <div className="flex flex-wrap gap-2">
              {SPORT_TYPES.map((sport) => (
                <Badge
                  key={sport}
                  variant="outline"
                  className={cn(
                    "cursor-pointer transition-colors",
                    selectedSports.includes(sport) && "border-primary bg-primary/10 text-primary"
                  )}
                  onClick={() => toggleSport(sport)}
                >
                  {sport}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-locale">{t('admin.defaultLanguage')}</Label>
              <Select value={defaultLocale} onValueChange={setDefaultLocale}>
                <SelectTrigger id="default-locale">
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
              <Label htmlFor="primary-color">{t('admin.primaryColor')}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1"
                  placeholder="#dc2626"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('admin.descriptionLabel')}</Label>
            <Textarea
              id="description"
              placeholder={t('admin.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={() => createMutation.mutate()} 
            disabled={createMutation.isPending || !isAuthenticated}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('admin.creating')}
              </>
            ) : (
              t('admin.createButton')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

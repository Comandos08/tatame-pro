import { useState } from 'react';
import { logger } from '@/lib/logger';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';
import { CategoryGender } from '@/types/event';

// ============================================
// P2.3.1 — CreateCategoryDialog
// AJUSTES APLICADOS: A (UI funcional), B (governança), C (logs + feedback)
// ============================================

const optionalNumber = (max?: number) => {
  let base = z.coerce.number().min(0);
  if (max !== undefined) base = base.max(max);
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    base.optional(),
  );
};

const categorySchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  gender: z.enum(['MALE', 'FEMALE', 'MIXED']).optional(),
  minWeight: optionalNumber(),
  maxWeight: optionalNumber(),
  minAge: optionalNumber(120),
  maxAge: optionalNumber(120),
});

type CategoryFormInput = z.input<typeof categorySchema>;
type CategoryFormData = z.output<typeof categorySchema>;

interface CreateCategoryDialogProps {
  eventId: string;
  disabled?: boolean;
}

export function CreateCategoryDialog({ eventId, disabled = false }: CreateCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const { tenant } = useTenant();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const form = useForm<CategoryFormInput, any, CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      gender: undefined,
      minWeight: '',
      maxWeight: '',
      minAge: '',
      maxAge: '',
    },
  });

  const createCategory = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      if (!tenant?.id) {
        throw new Error('Tenant não encontrado');
      }

      // Preparar payload com campos obrigatórios (AJUSTE B - governança)
      const payload = {
        tenant_id: tenant.id,
        event_id: eventId,
        name: data.name.trim(),
        is_active: true,
        gender: data.gender as CategoryGender || null,
        min_weight: data.minWeight ?? null,
        max_weight: data.maxWeight ?? null,
        min_age: data.minAge ?? null,
        max_age: data.maxAge ?? null,
        price_cents: 0,
        currency: 'BRL',
      };

      // LOG OBRIGATÓRIO — Diagnóstico (AJUSTE C)
      logger.log('[CREATE CATEGORY PAYLOAD]', payload);

      const { data: result, error } = await supabase
        .from('event_categories')
        .insert(payload)
        .select()
        .single();

      if (error) {
        // LOG OBRIGATÓRIO — Diagnóstico (AJUSTE C)
        logger.error('[CREATE CATEGORY ERROR]', error);
        throw error;
      }

      return result;
    },
    onSuccess: () => {
      // FEEDBACK EXPLÍCITO — Nunca silencioso (AJUSTE C)
      toast.success(t('events.categoryCreated'));
      queryClient.invalidateQueries({ queryKey: ['event-categories', eventId] });
      setOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      // FEEDBACK EXPLÍCITO — Nunca silencioso (AJUSTE C)
      toast.error(error.message || t('events.categoryCreateError'));
    },
  });

  const onSubmit = (data: CategoryFormData) => {
    createCategory.mutate(data);
  };

  // Botão com tooltip quando desabilitado
  const triggerButton = (
    <Button size="sm" disabled={disabled}>
      <Plus className="mr-2 h-4 w-4" />
      {t('events.createCategory')}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {disabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{triggerButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('events.categoriesLockedDesc')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
      )}

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('events.createCategory')}</DialogTitle>
          <DialogDescription>{t('events.createCategoryDesc')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Nome da categoria (obrigatório) */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.categoryName')} *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Peso Leve Masculino"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gênero (opcional) */}
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.gender.label')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('membership.selectPlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MALE">{t('events.genderMale')}</SelectItem>
                      <SelectItem value="FEMALE">{t('events.genderFemale')}</SelectItem>
                      <SelectItem value="MIXED">{t('events.genderMixed')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Peso (min/max) */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="minWeight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.minWeight.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder={t('events.minWeight.placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxWeight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.maxWeight.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder={t('events.maxWeight.placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Idade (min/max) */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="minAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.minAge.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        placeholder={t('events.years')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.maxAge.label')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        placeholder={t('events.years')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createCategory.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createCategory.isPending}>
                {createCategory.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

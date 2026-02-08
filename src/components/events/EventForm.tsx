/**
 * E1.0 — EVENT FORM COMPONENT (SAFE GOLD)
 *
 * Form for creating/editing events.
 * SAFE GOLD: deterministic, no side effects during render.
 */

import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Calendar, MapPin, Users, Loader2 } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { EventFormData } from '@/domain/events/types';
import type { SafeEventStatus } from '@/domain/events/safeEnums';
import { isEventEditable } from '@/domain/events/guards';

const eventFormSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  description: z.string().optional(),
  eventDate: z.string().min(1, 'Data do evento é obrigatória'),
  eventEndDate: z.string().optional(),
  location: z.string().optional(),
  isPublic: z.boolean(),
  registrationOpensAt: z.string().optional(),
  registrationClosesAt: z.string().optional(),
  maxParticipants: z.number().nullable().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  initialData?: Partial<EventFormData>;
  eventStatus?: SafeEventStatus;
  onSubmit: (data: EventFormData) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
}

export function EventForm({
  initialData,
  eventStatus = 'DRAFT',
  onSubmit,
  onCancel,
  isSubmitting = false,
  mode,
}: EventFormProps) {
  const { t } = useI18n();
  const isEditable = isEventEditable(eventStatus);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      eventDate: initialData?.eventDate ?? '',
      eventEndDate: initialData?.eventEndDate ?? '',
      location: initialData?.location ?? '',
      isPublic: initialData?.isPublic ?? true,
      registrationOpensAt: initialData?.registrationOpensAt ?? '',
      registrationClosesAt: initialData?.registrationClosesAt ?? '',
      maxParticipants: initialData?.maxParticipants ?? null,
    },
  });

  const handleSubmit = useCallback(
    (values: EventFormValues) => {
      onSubmit({
        name: values.name,
        description: values.description ?? '',
        eventDate: values.eventDate,
        eventEndDate: values.eventEndDate ?? '',
        location: values.location ?? '',
        isPublic: values.isPublic,
        registrationOpensAt: values.registrationOpensAt ?? '',
        registrationClosesAt: values.registrationClosesAt ?? '',
        maxParticipants: values.maxParticipants ?? null,
      });
    },
    [onSubmit]
  );

  if (mode === 'edit' && !isEditable) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            {t('events.form.readOnly')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === 'create'
            ? t('events.form.createTitle')
            : t('events.form.editTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Event Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.form.name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('events.form.namePlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.form.description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('events.form.descriptionPlaceholder')}
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="eventDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {t('events.form.startDate')}
                    </FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eventEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {t('events.form.endDate')}
                    </FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {t('events.form.location')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('events.form.locationPlaceholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Registration Period */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="registrationOpensAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.form.registrationOpens')}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="registrationClosesAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.form.registrationCloses')}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Max Participants */}
            <FormField
              control={form.control}
              name="maxParticipants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('events.form.maxParticipants')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      placeholder={t('events.form.maxParticipantsPlaceholder')}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        field.onChange(value === '' ? null : parseInt(value, 10));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Public Toggle */}
            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>{t('events.form.isPublic')}</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      {t('events.form.isPublicDescription')}
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t('common.cancel')}
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create'
                  ? t('events.form.create')
                  : t('events.form.save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

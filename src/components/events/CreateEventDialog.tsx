import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Plus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

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
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useCurrentUser } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';
import { EventImageUpload } from './EventImageUpload';

const formSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  description: z.string().optional(),
  location: z.string().optional(),
  start_date: z.date({ message: 'Data de início é obrigatória' }),
  end_date: z.date({ message: 'Data de fim é obrigatória' }),
  sport_type: z.string().optional(),
}).refine((data) => data.end_date >= data.start_date, {
  message: 'Data de fim deve ser igual ou posterior à data de início',
  path: ['end_date'],
});

type FormData = z.infer<typeof formSchema>;

interface CreateEventDialogProps {
  children?: React.ReactNode;
}

export function CreateEventDialog({ children }: CreateEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const { tenant } = useTenant();
  const { currentUser } = useCurrentUser();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      location: '',
      sport_type: tenant?.sportTypes?.[0] || '',
    },
  });

  const createEvent = useMutation({
    mutationFn: async (data: FormData) => {
      if (!tenant?.id || !currentUser?.id) throw new Error('Missing tenant or user');
      
      const { error } = await supabase.from('events').insert({
        tenant_id: tenant.id,
        name: data.name,
        description: data.description || null,
        location: data.location || null,
        start_date: data.start_date.toISOString(),
        end_date: data.end_date.toISOString(),
        sport_type: data.sport_type || null,
        created_by: currentUser.id,
        status: 'DRAFT',
        is_public: false,
        banner_url: bannerUrl,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('events.createSuccess'));
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setOpen(false);
      form.reset();
      setBannerUrl(null);
    },
    onError: (error) => {
      logger.error('Error creating event:', error);
      toast.error(t('events.createError'));
    },
  });

  const onSubmit = (data: FormData) => {
    createEvent.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('events.createEvent')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('events.createEvent')}</DialogTitle>
          <DialogDescription>
            {t('events.createEventDesc')}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.eventName.label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('events.eventName.placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.description.label')}</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder={t('events.description.placeholder')}
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t('events.startDate.label')}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd/MM/yyyy')
                            ) : (
                              <span>{t('events.startDate.placeholder')}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{t('events.endDate.label')}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd/MM/yyyy')
                            ) : (
                              <span>{t('events.endDate.placeholder')}</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => {
                            const startDate = form.getValues('start_date');
                            return startDate ? date < startDate : date < new Date();
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('events.location.label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('events.location.placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {tenant?.sportTypes && tenant.sportTypes.length > 1 && (
              <FormField
                control={form.control}
                name="sport_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('events.sportType.label')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('events.sportType.placeholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {tenant.sportTypes.map((sport) => (
                          <SelectItem key={sport} value={sport}>
                            {sport}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Event Cover Image */}
            {tenant?.id && (
              <EventImageUpload
                tenantId={tenant.id}
                currentUrl={bannerUrl}
                onUploaded={setBannerUrl}
                disabled={createEvent.isPending}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createEvent.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? t('common.loading') : t('events.createEvent')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
